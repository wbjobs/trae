export class FrameInterpolator {
    constructor(apiBaseUrl = 'http://localhost:8000') {
        this.apiBaseUrl = apiBaseUrl;
        this.isInterpolating = false;
        this.interpolatedFrames = [];
        this.sourceFps = 24;
        this.targetFps = 60;
        this.onProgress = null;
        this.onComplete = null;
    }

    async getInterpolationInfo(sourceFps, targetFps) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/interpolate/info?source_fps=${sourceFps}&target_fps=${targetFps}`
            );
            return await response.json();
        } catch (e) {
            console.warn('Could not get interpolation info:', e);
            return {
                source_fps: sourceFps,
                target_fps: targetFps,
                interpolation_factor: targetFps / sourceFps,
                num_intermediate_frames: Math.floor(targetFps / sourceFps) - 1,
                uses_rife_model: false
            };
        }
    }

    async interpolatePair(frame1Blob, frame2Blob, numIntermediate = 2) {
        const frame1Base64 = await this.blobToBase64(frame1Blob);
        const frame2Base64 = await this.blobToBase64(frame2Blob);
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/interpolate/pair`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    frame1: frame1Base64.split(',')[1],
                    frame2: frame2Base64.split(',')[1],
                    num_intermediate: numIntermediate
                })
            });
            
            const result = await response.json();
            const interpolated = [];
            
            for (const frameBase64 of result.interpolated_frames) {
                const blob = await this.base64ToBlob(`data:image/jpeg;base64,${frameBase64}`);
                interpolated.push({
                    blob,
                    url: URL.createObjectURL(blob),
                    is_interpolated: true
                });
            }
            
            return interpolated;
        } catch (e) {
            console.error('Pair interpolation failed:', e);
            return this._fallbackInterpolate(frame1Blob, frame2Blob, numIntermediate);
        }
    }

    async interpolateSequence(frames, sourceFps, targetFps, useAsync = true) {
        if (frames.length < 2) {
            return frames;
        }
        
        this.isInterpolating = true;
        this.sourceFps = sourceFps;
        this.targetFps = targetFps;
        
        const framesData = [];
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const base64 = await this.blobToBase64(frame.blob);
            framesData.push({
                frame_index: i,
                image_base64: base64.split(',')[1],
                timestamp: frame.timestamp
            });
        }
        
        try {
            const endpoint = useAsync ? '/interpolate/async' : '/interpolate/sequence';
            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    frames: framesData,
                    source_fps: sourceFps,
                    target_fps: targetFps
                })
            });
            
            const result = await response.json();
            
            if (useAsync && result.task_id) {
                return this._pollForResult(result.task_id, frames.length);
            } else {
                return this._processResults(result, frames);
            }
        } catch (e) {
            console.error('Sequence interpolation failed:', e);
            return this._fallbackInterpolateSequence(frames, sourceFps, targetFps);
        }
    }

    async _pollForResult(taskId, totalFrames) {
        const maxAttempts = 300;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/tasks/${taskId}`);
                const status = await response.json();
                
                if (this.onProgress) {
                    this.onProgress(status.progress, status.processed_frames, totalFrames);
                }
                
                if (status.status === 'completed') {
                    return this._processResults(status, null);
                } else if (status.status === 'failed') {
                    throw new Error(status.error || 'Interpolation failed');
                }
                
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.error('Polling error:', e);
                attempts++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        throw new Error('Interpolation timed out');
    }

    async _processResults(result, originalFrames) {
        this.interpolatedFrames = [];
        
        for (const frameData of result.results || []) {
            let blob, url;
            
            if (frameData.image_base64) {
                blob = await this.base64ToBlob(`data:image/jpeg;base64,${frameData.image_base64}`);
                url = URL.createObjectURL(blob);
            } else if (originalFrames && frameData.original_index !== undefined) {
                const original = originalFrames[frameData.original_index];
                blob = original.blob;
                url = original.url;
            }
            
            this.interpolatedFrames.push({
                index: frameData.index,
                timestamp: frameData.timestamp,
                blob,
                url,
                is_interpolated: frameData.is_interpolated || false,
                original_index: frameData.original_index,
                interpolation_between: frameData.interpolation_between,
                interpolation_alpha: frameData.interpolation_alpha
            });
        }
        
        this.isInterpolating = false;
        
        if (this.onComplete) {
            this.onComplete(this.interpolatedFrames);
        }
        
        return this.interpolatedFrames;
    }

    _fallbackInterpolate(frame1Blob, frame2Blob, numIntermediate) {
        console.warn('Using fallback interpolation');
        return [];
    }

    _fallbackInterpolateSequence(frames, sourceFps, targetFps) {
        console.warn('Using fallback sequence interpolation');
        const factor = Math.floor(targetFps / sourceFps);
        const result = [];
        
        for (let i = 0; i < frames.length; i++) {
            result.push({
                ...frames[i],
                is_interpolated: false,
                original_index: i
            });
            
            if (i < frames.length - 1 && factor > 1) {
                for (let j = 1; j < factor; j++) {
                    const alpha = j / factor;
                    result.push({
                        index: result.length,
                        timestamp: frames[i].timestamp + (frames[i + 1].timestamp - frames[i].timestamp) * alpha,
                        blob: frames[i].blob,
                        url: frames[i].url,
                        is_interpolated: true,
                        original_index: i,
                        interpolation_between: [i, i + 1],
                        interpolation_alpha: alpha,
                        is_fallback: true
                    });
                }
            }
        }
        
        return result;
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async base64ToBlob(base64) {
        const response = await fetch(base64);
        return await response.blob();
    }

    getFrameAtTimestamp(timestamp) {
        if (this.interpolatedFrames.length === 0) return null;
        
        let left = 0;
        let right = this.interpolatedFrames.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const frame = this.interpolatedFrames[mid];
            
            if (Math.abs(frame.timestamp - timestamp) < 0.01) {
                return frame;
            } else if (frame.timestamp < timestamp) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        if (right < 0) return this.interpolatedFrames[0];
        if (left >= this.interpolatedFrames.length) return this.interpolatedFrames[this.interpolatedFrames.length - 1];
        
        const frame1 = this.interpolatedFrames[right];
        const frame2 = this.interpolatedFrames[left];
        
        if (timestamp - frame1.timestamp < frame2.timestamp - timestamp) {
            return frame1;
        }
        return frame2;
    }

    getFramesInRange(startTime, endTime) {
        return this.interpolatedFrames.filter(
            frame => frame.timestamp >= startTime && frame.timestamp <= endTime
        );
    }

    syncTimestamps(baseTimestamp = 0) {
        const targetFrameDuration = 1 / this.targetFps;
        
        for (let i = 0; i < this.interpolatedFrames.length; i++) {
            this.interpolatedFrames[i].timestamp = baseTimestamp + i * targetFrameDuration;
        }
        
        return this.interpolatedFrames;
    }

    alignFrames(sourceFrames, targetFps) {
        if (sourceFrames.length === 0) return [];
        
        const sourceDuration = sourceFrames[sourceFrames.length - 1].timestamp - sourceFrames[0].timestamp;
        const targetFrameDuration = 1 / targetFps;
        const totalTargetFrames = Math.ceil(sourceDuration / targetFrameDuration);
        
        const alignedFrames = [];
        
        for (let i = 0; i < totalTargetFrames; i++) {
            const targetTimestamp = i * targetFrameDuration;
            const nearestFrame = this._findNearestFrame(sourceFrames, targetTimestamp);
            
            if (nearestFrame) {
                alignedFrames.push({
                    ...nearestFrame,
                    aligned_timestamp: targetTimestamp,
                    timestamp: targetTimestamp
                });
            }
        }
        
        return alignedFrames;
    }

    _findNearestFrame(frames, timestamp) {
        if (frames.length === 0) return null;
        
        let minDiff = Infinity;
        let nearestFrame = null;
        
        for (const frame of frames) {
            const diff = Math.abs(frame.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                nearestFrame = frame;
            }
        }
        
        return nearestFrame;
    }

    destroy() {
        this.interpolatedFrames.forEach(frame => {
            if (frame.url && frame.is_interpolated) {
                URL.revokeObjectURL(frame.url);
            }
        });
        this.interpolatedFrames = [];
        this.isInterpolating = false;
    }
}

export class FrameTimeManager {
    constructor() {
        this.frames = [];
        this.sourceFps = 24;
        this.targetFps = 60;
        this.synced = false;
    }

    addFrame(frame) {
        this.frames.push(frame);
        this.synced = false;
    }

    addFrames(frames) {
        this.frames.push(...frames);
        this.synced = false;
    }

    setSourceFps(fps) {
        this.sourceFps = fps;
        this.synced = false;
    }

    setTargetFps(fps) {
        this.targetFps = fps;
        this.synced = false;
    }

    syncTimestamps() {
        if (this.frames.length === 0) return;
        
        const targetFrameDuration = 1 / this.targetFps;
        const firstTimestamp = this.frames[0].timestamp;
        
        for (let i = 0; i < this.frames.length; i++) {
            this.frames[i].synced_timestamp = firstTimestamp + i * targetFrameDuration;
            this.frames[i].timestamp = this.frames[i].synced_timestamp;
        }
        
        this.synced = true;
        return this.frames;
    }

    getFrameAtTime(timestamp, useSynced = true) {
        if (this.frames.length === 0) return null;
        
        const timestampKey = useSynced && this.synced ? 'synced_timestamp' : 'timestamp';
        
        let left = 0;
        let right = this.frames.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const frame = this.frames[mid];
            const frameTime = frame[timestampKey];
            
            if (Math.abs(frameTime - timestamp) < 0.001) {
                return frame;
            } else if (frameTime < timestamp) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        if (right < 0) return this.frames[0];
        if (left >= this.frames.length) return this.frames[this.frames.length - 1];
        
        const frame1 = this.frames[right];
        const frame2 = this.frames[left];
        const time1 = frame1[timestampKey];
        const time2 = frame2[timestampKey];
        
        if (timestamp - time1 < time2 - timestamp) {
            return frame1;
        }
        return frame2;
    }

    getFramesBetween(startTime, endTime, useSynced = true) {
        const timestampKey = useSynced && this.synced ? 'synced_timestamp' : 'timestamp';
        
        return this.frames.filter(frame => {
            const t = frame[timestampKey];
            return t >= startTime && t <= endTime;
        });
    }

    getDuration(useSynced = true) {
        if (this.frames.length === 0) return 0;
        
        const timestampKey = useSynced && this.synced ? 'synced_timestamp' : 'timestamp';
        return this.frames[this.frames.length - 1][timestampKey] - this.frames[0][timestampKey];
    }

    alignToReference(referenceTimestamps) {
        if (this.frames.length === 0 || referenceTimestamps.length === 0) {
            return this.frames;
        }
        
        const aligned = [];
        
        for (const refTime of referenceTimestamps) {
            const nearestFrame = this._findNearestFrame(refTime);
            if (nearestFrame) {
                aligned.push({
                    ...nearestFrame,
                    reference_timestamp: refTime,
                    timestamp: refTime
                });
            }
        }
        
        this.frames = aligned;
        this.synced = true;
        
        return aligned;
    }

    _findNearestFrame(timestamp) {
        if (this.frames.length === 0) return null;
        
        let minDiff = Infinity;
        let nearestFrame = null;
        
        for (const frame of this.frames) {
            const diff = Math.abs(frame.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                nearestFrame = frame;
            }
        }
        
        return nearestFrame;
    }

    clear() {
        this.frames = [];
        this.synced = false;
    }

    destroy() {
        this.frames.forEach(frame => {
            if (frame.url) {
                URL.revokeObjectURL(frame.url);
            }
        });
        this.clear();
    }
}
