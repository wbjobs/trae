from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict
import os
import time
from dotenv import load_dotenv

from .models import (
    AggregationResponse, AggregationRequest, DrillDownRequest,
    TimeRangeRequest, InterpolationRequest,
    HourlyAggregationResponse, Batch24hResponse,
    HexagonData, StatsResponse
)
from .data_loader import data_loader
from .h3_aggregator import H3Aggregator
from .cache import cache_manager

load_dotenv()

app = FastAPI(
    title="H3 Geospatial Clustering API",
    description="FastAPI service for H3-based geospatial aggregation of taxi GPS data",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "name": "H3 Geospatial Clustering API",
        "version": "1.2.0",
        "endpoints": {
            "/aggregate": "POST - Get H3 aggregated hexagons",
            "/aggregate/{resolution}": "GET - Get H3 aggregated hexagons by resolution",
            "/aggregate/time": "POST - Aggregate data for a specific time range",
            "/aggregate/interpolate": "POST - Get interpolated data between two hours",
            "/aggregate/24h": "POST - Batch aggregate all 24 hours of data",
            "/drilldown": "POST - Precise drill-down into a specific hexagon (fixes boundary issues)",
            "/stats": "GET - Get dataset statistics",
            "/cache/clear": "POST - Clear Redis cache",
            "/data/reload": "POST - Reload dataset from disk"
        },
        "new_features": {
            "temporal_animation": "Added temporal animation support with 24-hour playback",
            "features": [
                "1. Time range aggregation (/aggregate/time)",
                "2. Hour interpolation for smooth transitions (/aggregate/interpolate)",
                "3. Batch 24-hour aggregation (/aggregate/24h)",
                "4. Realistic morning/evening rush hour patterns"
            ]
        }
    }


@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    return data_loader.get_stats()


@app.get("/aggregate/{resolution}", response_model=AggregationResponse)
async def aggregate_get(
    resolution: int = Query(..., ge=6, le=10, description="H3 resolution (6-10)"),
    min_lng: Optional[float] = Query(None, description="Minimum longitude"),
    min_lat: Optional[float] = Query(None, description="Minimum latitude"),
    max_lng: Optional[float] = Query(None, description="Maximum longitude"),
    max_lat: Optional[float] = Query(None, description="Maximum latitude"),
    parent_hex: Optional[str] = Query(None, description="Parent H3 hex ID for precise drill-down"),
    use_cache: bool = Query(True, description="Use Redis cache")
):
    bbox = None
    if all(v is not None for v in [min_lng, min_lat, max_lng, max_lat]):
        bbox = [min_lng, min_lat, max_lng, max_lat]

    return await _aggregate(resolution, bbox, use_cache, parent_hex)


@app.post("/aggregate", response_model=AggregationResponse)
async def aggregate_post(request: AggregationRequest):
    return await _aggregate(request.resolution, request.bbox, request.use_cache, request.parent_hex)


@app.post("/aggregate/time", response_model=AggregationResponse)
async def aggregate_by_time(request: TimeRangeRequest):
    resolution = H3Aggregator.validate_resolution(request.resolution)
    
    df = data_loader.get_data(
        request.bbox, 
        resolution, 
        start_hour=request.start_hour,
        end_hour=request.end_hour
    )
    
    if df.empty:
        return AggregationResponse(
            hexagons=[],
            resolution=resolution,
            total_points=0,
            processing_time_ms=0,
            cache_hit=False
        )
    
    hexagons_data, total_points, processing_time = H3Aggregator.aggregate_numpy(
        df, resolution, request.bbox, parent_hex=request.parent_hex
    )
    
    hexagons = [HexagonData(**h) for h in hexagons_data]
    
    return AggregationResponse(
        hexagons=hexagons,
        resolution=resolution,
        total_points=total_points,
        processing_time_ms=round(processing_time, 2),
        cache_hit=False
    )


@app.post("/aggregate/interpolate", response_model=AggregationResponse)
async def aggregate_interpolate(request: InterpolationRequest):
    resolution = H3Aggregator.validate_resolution(request.resolution)
    
    df = data_loader.get_data(request.bbox, resolution)
    
    if df.empty:
        return AggregationResponse(
            hexagons=[],
            resolution=resolution,
            total_points=0,
            processing_time_ms=0,
            cache_hit=False
        )
    
    hexagons_data, total_points, _ = H3Aggregator.interpolate_hourly_data(
        df,
        hour_start=request.hour_start,
        hour_end=request.hour_end,
        resolution=resolution,
        fraction=request.fraction,
        bbox=request.bbox
    )
    
    hexagons = [HexagonData(**h) for h in hexagons_data]
    
    return AggregationResponse(
        hexagons=hexagons,
        resolution=resolution,
        total_points=total_points,
        processing_time_ms=0,
        cache_hit=False
    )


@app.post("/aggregate/24h", response_model=Batch24hResponse)
async def aggregate_24h(request: AggregationRequest):
    start_time = time.time()
    resolution = H3Aggregator.validate_resolution(request.resolution)
    
    df = data_loader.get_data(request.bbox, resolution)
    
    if df.empty:
        return Batch24hResponse(
            resolution=resolution,
            hourly_data={},
            processing_time_ms=0
        )
    
    hourly_results = H3Aggregator.aggregate_24h(
        df, resolution, request.bbox, request.parent_hex
    )
    
    hourly_data = {}
    for hour, data in hourly_results.items():
        hexagons = [HexagonData(**h) for h in data['hexagons']]
        hourly_data[hour] = HourlyAggregationResponse(
            hour=hour,
            hexagons=hexagons,
            total_points=data['total_points']
        )
    
    processing_time = (time.time() - start_time) * 1000
    
    return Batch24hResponse(
        resolution=resolution,
        hourly_data=hourly_data,
        processing_time_ms=round(processing_time, 2)
    )


@app.post("/drilldown", response_model=AggregationResponse)
async def drill_down(request: DrillDownRequest):
    import h3
    if not h3.h3_is_valid(request.parent_hex_id):
        raise HTTPException(status_code=400, detail=f"Invalid H3 hex ID: {request.parent_hex_id}")
    
    parent_res = h3.h3_get_resolution(request.parent_hex_id)
    if request.target_resolution <= parent_res:
        raise HTTPException(
            status_code=400,
            detail=f"Target resolution {request.target_resolution} must be higher than "
                   f"parent resolution {parent_res}"
        )
    
    return await _aggregate(
        request.target_resolution,
        request.bbox,
        request.use_cache,
        parent_hex=request.parent_hex_id
    )


async def _aggregate(
    resolution: int,
    bbox: Optional[List[float]] = None,
    use_cache: bool = True,
    parent_hex: Optional[str] = None
) -> AggregationResponse:
    resolution = H3Aggregator.validate_resolution(resolution)

    if use_cache and parent_hex is None:
        cached_data = cache_manager.get(resolution, bbox)
        if cached_data is not None:
            hexagons = [HexagonData(**h) for h in cached_data]
            return AggregationResponse(
                hexagons=hexagons,
                resolution=resolution,
                total_points=sum(h.count for h in hexagons),
                processing_time_ms=0,
                cache_hit=True
            )

    df = data_loader.get_data(bbox, resolution)

    if df.empty:
        return AggregationResponse(
            hexagons=[],
            resolution=resolution,
            total_points=0,
            processing_time_ms=0,
            cache_hit=False
        )

    hexagons_data, total_points, processing_time = H3Aggregator.aggregate_numpy(
        df, resolution, bbox, parent_hex=parent_hex
    )

    if use_cache and parent_hex is None:
        cache_manager.set(resolution, hexagons_data, bbox)

    hexagons = [HexagonData(**h) for h in hexagons_data]

    return AggregationResponse(
        hexagons=hexagons,
        resolution=resolution,
        total_points=total_points,
        processing_time_ms=round(processing_time, 2),
        cache_hit=False
    )


@app.post("/cache/clear")
async def clear_cache():
    cache_manager.clear()
    return {"status": "success", "message": "Cache cleared"}


@app.post("/data/reload")
async def reload_data():
    data_loader.reload()
    return {"status": "success", "message": "Data reloaded", "stats": data_loader.get_stats()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
