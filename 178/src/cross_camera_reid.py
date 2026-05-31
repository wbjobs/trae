"""
Cross-Camera Vehicle Re-Identification (ReID) Module.

Provides global vehicle tracking across multiple camera views by:
  1. Extracting ReID feature vectors from DeepStream tracker metadata
  2. Matching vehicles across cameras using cosine similarity + spatial-temporal constraints
  3. Maintaining a global trajectory registry that stitches per-camera
     tracklets into a unified cross-camera path
  4. Emitting cross_camera_match events to Kafka for trajectory visualization

Design:
  - Each camera produces per-vehicle tracklets with ReID features
  - A centralized CrossCameraTracker holds a rolling gallery of recent
    vehicle appearances (LRU cache per global track)
  - When a new tracklet ends (vehicle leaves camera FOV), we query the
    gallery for matches in other cameras
  - Spatial-temporal gating: a match is only accepted if the other
    camera is reachable within the time window (based on camera topology)
  - License plate OCR serves as a strong prior for matching
"""

from __future__ import annotations

import time
import uuid
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class CameraAppearance:
    """A single vehicle sighting at one camera."""

    camera_id: str
    camera_name: str
    track_id: int
    class_name: str
    first_seen: float
    last_seen: float
    avg_confidence: float
    bbox_first: List[float]
    bbox_last: List[float]
    reid_feature: np.ndarray
    license_plate: str = ""
    lp_confidence: float = 0.0
    speed_kmh: float = 0.0


@dataclass
class GlobalTrack:
    """A globally unique vehicle trajectory spanning multiple cameras."""

    global_id: str
    appearances: List[CameraAppearance] = field(default_factory=list)
    merged_features: Optional[np.ndarray] = None
    best_lp: str = ""
    best_lp_confidence: float = 0.0
    created_at: float = field(default_factory=time.time)
    last_updated: float = field(default_factory=time.time)

    def add_appearance(self, app: CameraAppearance) -> None:
        """Register a new sighting and update aggregated fields."""
        self.appearances.append(app)
        self.last_updated = time.time()

        if self.merged_features is None:
            self.merged_features = app.reid_feature.copy()
        else:
            alpha = 0.3
            self.merged_features = (
                alpha * self.merged_features
                + (1.0 - alpha) * app.reid_feature
            )
            norm = np.linalg.norm(self.merged_features)
            if norm > 0:
                self.merged_features /= norm

        if app.lp_confidence > self.best_lp_confidence and app.license_plate:
            self.best_lp = app.license_plate
            self.best_lp_confidence = app.lp_confidence

    def camera_ids(self) -> List[str]:
        return list({a.camera_id for a in self.appearances})


@dataclass
class CameraTopology:
    """Spatial-temporal relationship between two cameras."""

    cam_a: str
    cam_b: str
    min_travel_sec: float
    max_travel_sec: float
    distance_meters: float


# ---------------------------------------------------------------------------
# ReID Feature extraction from DeepStream metadata
# ---------------------------------------------------------------------------


class ReIDFeatureExtractor:
    """
    Extracts and normalizes ReID feature vectors from DeepStream
    tracker user metadata.

    DeepStream NvDCF tracker with ReID enabled stores feature vectors
    in the object's user metadata list. We locate the ReID meta, extract
    the float array, and L2-normalize it.
    """

    def __init__(self, feature_dim: int = 256):
        self.feature_dim = feature_dim
        self._dummy_feature = np.zeros(feature_dim, dtype=np.float32)

    def extract_from_obj_meta(self, obj_meta, pyds_module) -> Optional[np.ndarray]:
        """
        Try to extract ReID feature from an NvDsObjectMeta.

        Walks the obj_user_meta_list looking for NVDS_USER_META_TYPE_REID.
        Returns the L2-normalized feature vector, or None if not found.
        """
        try:
            l_user = obj_meta.obj_user_meta_list
            while l_user is not None:
                try:
                    user_meta = pyds_module.glist_get_nvds_user_meta(l_user.data)
                except StopIteration:
                    break

                if (
                    user_meta
                    and user_meta.base_meta.meta_type
                    == pyds_module.NvDsUserMetaType.NVDS_USER_META_TYPE_REID
                ):
                    reid_meta = pyds_module.cast_user_meta_to_nvds_reid_meta(
                        user_meta
                    )
                    if reid_meta and reid_meta.feature:
                        feature = np.frombuffer(
                            reid_meta.feature, dtype=np.float32
                        )
                        if len(feature) >= self.feature_dim:
                            feature = feature[: self.feature_dim]
                            norm = np.linalg.norm(feature)
                            if norm > 1e-6:
                                feature = feature / norm
                            return feature.astype(np.float32)

                l_user = l_user.next

        except Exception:
            pass
        return None

    def fallback_feature(self, bbox: List[float], class_name: str) -> np.ndarray:
        """
        Produce a crude fallback feature when ReID model output is not
        available. Uses bbox aspect ratio + class one-hot encoding.
        """
        w = max(1.0, bbox[2] - bbox[0])
        h = max(1.0, bbox[3] - bbox[1])
        aspect = w / h
        area = (w * h) / (1920 * 1080)

        class_map = {"car": 0, "truck": 1, "bus": 2, "motorcycle": 3}
        cls_idx = class_map.get(class_name, 0)

        feat = np.zeros(self.feature_dim, dtype=np.float32)
        feat[0] = aspect
        feat[1] = area
        feat[2 + cls_idx] = 1.0
        norm = np.linalg.norm(feat)
        if norm > 1e-6:
            feat /= norm
        return feat


# ---------------------------------------------------------------------------
# Cross-Camera Tracker
# ---------------------------------------------------------------------------


class CrossCameraTracker:
    """
    Global vehicle registry that matches tracklets across cameras.

    Workflow:
      1. For every active track, accumulate ReID features (EMA)
      2. When a track ends (tracker lost target), compute the final
         averaged feature and query the global gallery
      3. Match candidates using:
           - Cosine similarity on ReID features
           - License plate exact match (strong signal)
           - Spatial-temporal gating (is the other camera reachable?)
      4. If matched → link to existing GlobalTrack; else → create new

    The gallery uses an LRU eviction policy with configurable TTL.
    """

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
    ):
        self.config = config or {}
        self._feature_extractor = ReIDFeatureExtractor(
            feature_dim=self.config.get("feature_dim", 256)
        )

        self._global_tracks: "OrderedDict[str, GlobalTrack]" = OrderedDict()
        self._max_global_tracks = self.config.get("max_global_tracks", 5000)
        self._track_ttl_sec = self.config.get("track_ttl_sec", 1800)

        self._pending: Dict[Tuple[str, int], Dict[str, Any]] = {}
        self._pending_max_age = self.config.get("pending_max_age_sec", 30)

        self._camera_topology: List[CameraTopology] = []
        for topo in self.config.get("camera_topology", []):
            self._camera_topology.append(
                CameraTopology(
                    cam_a=topo["cam_a"],
                    cam_b=topo["cam_b"],
                    min_travel_sec=topo.get("min_travel_sec", 5),
                    max_travel_sec=topo.get("max_travel_sec", 600),
                    distance_meters=topo.get("distance_meters", 0),
                )
            )

        self._reid_threshold = self.config.get("reid_similarity_threshold", 0.75)
        self._reid_soft_threshold = self.config.get(
            "reid_soft_threshold", 0.60
        )
        self._lp_match_weight = self.config.get("lp_match_weight", 0.5)
        self._reid_match_weight = self.config.get("reid_match_weight", 0.5)
        self._combined_threshold = self.config.get(
            "combined_match_threshold", 0.65
        )

        self._match_count = 0
        self._new_track_count = 0

    @property
    def feature_extractor(self) -> ReIDFeatureExtractor:
        return self._feature_extractor

    # ------------------------------------------------------------------
    # Per-track feature accumulation
    # ------------------------------------------------------------------

    def update_tracklet(
        self,
        camera_id: str,
        camera_name: str,
        track_id: int,
        class_name: str,
        bbox: List[float],
        confidence: float,
        timestamp: float,
        reid_feature: Optional[np.ndarray] = None,
        license_plate: str = "",
        lp_confidence: float = 0.0,
        speed_kmh: float = 0.0,
    ) -> None:
        """
        Feed a new observation of a per-camera tracklet.

        Maintains an EMA of the ReID feature and the first/last bbox
        and timestamps.
        """
        key = (camera_id, track_id)
        if key not in self._pending:
            self._pending[key] = {
                "camera_id": camera_id,
                "camera_name": camera_name,
                "track_id": track_id,
                "class_name": class_name,
                "first_seen": timestamp,
                "last_seen": timestamp,
                "bbox_first": list(bbox),
                "bbox_last": list(bbox),
                "confidence_sum": 0.0,
                "confidence_count": 0,
                "features": [],
                "license_plate": "",
                "lp_confidence": 0.0,
                "speed_kmh": 0.0,
            }

        entry = self._pending[key]
        entry["last_seen"] = timestamp
        entry["bbox_last"] = list(bbox)
        entry["confidence_sum"] += confidence
        entry["confidence_count"] += 1
        entry["speed_kmh"] = max(entry["speed_kmh"], speed_kmh)

        if reid_feature is not None:
            entry["features"].append(reid_feature)
            if len(entry["features"]) > 30:
                entry["features"] = entry["features"][-30:]

        if lp_confidence > entry["lp_confidence"] and license_plate:
            entry["license_plate"] = license_plate
            entry["lp_confidence"] = lp_confidence

    # ------------------------------------------------------------------
    # Tracklet finalization → global matching
    # ------------------------------------------------------------------

    def finalize_tracklet(
        self,
        camera_id: str,
        track_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Called when a per-camera tracklet ends (target lost or left FOV).

        Computes the final appearance, matches against the global gallery,
        and returns a match event dict if a cross-camera link was found.
        """
        key = (camera_id, track_id)
        if key not in self._pending:
            return None

        entry = self._pending.pop(key)

        avg_conf = 0.0
        if entry["confidence_count"] > 0:
            avg_conf = entry["confidence_sum"] / entry["confidence_count"]

        merged_feature = self._feature_extractor.dummy_feature
        if entry["features"]:
            stacked = np.stack(entry["features"], axis=0)
            merged_feature = np.mean(stacked, axis=0)
            norm = np.linalg.norm(merged_feature)
            if norm > 1e-6:
                merged_feature /= norm
            merged_feature = merged_feature.astype(np.float32)

        appearance = CameraAppearance(
            camera_id=entry["camera_id"],
            camera_name=entry["camera_name"],
            track_id=entry["track_id"],
            class_name=entry["class_name"],
            first_seen=entry["first_seen"],
            last_seen=entry["last_seen"],
            avg_confidence=avg_conf,
            bbox_first=entry["bbox_first"],
            bbox_last=entry["bbox_last"],
            reid_feature=merged_feature,
            license_plate=entry["license_plate"],
            lp_confidence=entry["lp_confidence"],
            speed_kmh=entry["speed_kmh"],
        )

        global_track, is_new_match = self._match_or_create(appearance)

        event: Optional[Dict[str, Any]] = None
        if not is_new_match:
            self._match_count += 1
            event = {
                "event_type": "cross_camera_match",
                "global_id": global_track.global_id,
                "camera_from": global_track.appearances[-2].camera_id
                if len(global_track.appearances) >= 2
                else None,
                "camera_to": appearance.camera_id,
                "camera_to_name": appearance.camera_name,
                "license_plate": global_track.best_lp,
                "lp_confidence": round(global_track.best_lp_confidence, 3),
                "class_name": appearance.class_name,
                "time_gap_sec": round(
                    appearance.first_seen
                    - global_track.appearances[-2].last_seen,
                    2,
                ) if len(global_track.appearances) >= 2 else 0,
                "trajectory_length": len(global_track.appearances),
                "camera_chain": [a.camera_id for a in global_track.appearances],
                "reid_similarity": 0.0,
            }
        else:
            self._new_track_count += 1

        self._evict_if_needed()
        return event

    # ------------------------------------------------------------------
    # Matching logic
    # ------------------------------------------------------------------

    def _match_or_create(
        self, appearance: CameraAppearance
    ) -> Tuple[GlobalTrack, bool]:
        """
        Find the best matching GlobalTrack from the gallery, or create new.

        Returns (GlobalTrack, is_new_match).
        """
        best_track: Optional[GlobalTrack] = None
        best_score = 0.0
        best_sim = 0.0

        for gtrack in self._global_tracks.values():
            if self._expired(gtrack):
                continue

            last_app = gtrack.appearances[-1]
            if last_app.camera_id == appearance.camera_id:
                continue

            if not self._spatio_temporal_gate(last_app, appearance):
                continue

            sim = float(
                np.dot(appearance.reid_feature, gtrack.merged_features)
            )

            lp_match = 0.0
            if (
                appearance.license_plate
                and gtrack.best_lp
                and appearance.license_plate == gtrack.best_lp
            ):
                lp_match = 1.0

            score = (
                self._reid_match_weight * sim
                + self._lp_match_weight * lp_match
            )

            if sim < self._reid_soft_threshold and lp_match < 0.5:
                continue

            if score > best_score and score >= self._combined_threshold:
                best_score = score
                best_track = gtrack
                best_sim = sim

        if best_track is None:
            gid = str(uuid.uuid4())[:8]
            track = GlobalTrack(global_id=gid)
            track.add_appearance(appearance)
            self._global_tracks[gid] = track
            self._global_tracks.move_to_end(gid)
            return track, True

        best_track.add_appearance(appearance)
        self._global_tracks.move_to_end(best_track.global_id)
        return best_track, False

    def _spatio_temporal_gate(
        self, last_app: CameraAppearance, new_app: CameraAppearance
    ) -> bool:
        """
        Check if new_app is reachable from last_app given camera topology.
        If no topology is configured, use a default time window.
        """
        dt = new_app.first_seen - last_app.last_seen
        if dt <= 0:
            return False

        topo = self._find_topology(last_app.camera_id, new_app.camera_id)
        if topo is not None:
            return topo.min_travel_sec <= dt <= topo.max_travel_sec

        default_min = self.config.get("default_min_travel_sec", 2)
        default_max = self.config.get("default_max_travel_sec", 600)
        return default_min <= dt <= default_max

    def _find_topology(
        self, cam_a: str, cam_b: str
    ) -> Optional[CameraTopology]:
        for t in self._camera_topology:
            if (t.cam_a == cam_a and t.cam_b == cam_b) or (
                t.cam_a == cam_b and t.cam_b == cam_a
            ):
                return t
        return None

    # ------------------------------------------------------------------
    # Housekeeping
    # ------------------------------------------------------------------

    def _expired(self, track: GlobalTrack) -> bool:
        return (time.time() - track.last_updated) > self._track_ttl_sec

    def _evict_if_needed(self) -> None:
        while len(self._global_tracks) > self._max_global_tracks:
            oldest_key = next(iter(self._global_tracks))
            del self._global_tracks[oldest_key]

        expired = [k for k, v in self._global_tracks.items() if self._expired(v)]
        for k in expired:
            del self._global_tracks[k]

    def cleanup_pending(self) -> List[Dict[str, Any]]:
        """
        Finalize tracklets that have been idle too long (tracker lost them
        without an explicit loss event). Returns any match events.
        """
        events: List[Dict[str, Any]] = []
        now = time.time()
        stale_keys = [
            k
            for k, v in self._pending.items()
            if now - v["last_seen"] > self._pending_max_age
        ]
        for key in stale_keys:
            cam_id, track_id = key
            evt = self.finalize_tracklet(cam_id, track_id)
            if evt:
                events.append(evt)
        return events

    def get_stats(self) -> Dict[str, Any]:
        return {
            "global_tracks": len(self._global_tracks),
            "pending_tracklets": len(self._pending),
            "cross_camera_matches": self._match_count,
            "new_tracks_created": self._new_track_count,
        }

    def get_global_track(self, global_id: str) -> Optional[GlobalTrack]:
        return self._global_tracks.get(global_id)

    def get_recent_matches(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return summary of recently matched global tracks."""
        recent = sorted(
            self._global_tracks.values(),
            key=lambda t: t.last_updated,
            reverse=True,
        )[:limit]
        result = []
        for t in recent:
            if len(t.appearances) >= 2:
                result.append(
                    {
                        "global_id": t.global_id,
                        "license_plate": t.best_lp,
                        "camera_chain": [a.camera_id for a in t.appearances],
                        "trajectory_length": len(t.appearances),
                        "first_seen": min(a.first_seen for a in t.appearances),
                        "last_seen": max(a.last_seen for a in t.appearances),
                    }
                )
        return result
