from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, Float, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from typing import List, Optional

DATABASE_URL = "sqlite:///./benchmark.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"

    id = Column(Integer, primary_key=True, index=True)
    matrix_size = Column(Integer, index=True)
    iterations = Column(Integer)
    optimized = Column(Boolean, default=True)
    wasm_time_avg = Column(Float, nullable=True)
    wasm_gflops = Column(Float, nullable=True)
    js_time_avg = Column(Float)
    js_gflops = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


class BenchmarkResultCreate(BaseModel):
    matrix_size: int
    iterations: int
    optimized: bool
    wasm_time_avg: Optional[float] = None
    wasm_gflops: Optional[float] = None
    js_time_avg: float
    js_gflops: float
    timestamp: Optional[str] = None


class BenchmarkResultResponse(BaseModel):
    id: int
    matrix_size: int
    iterations: int
    optimized: bool
    wasm_time_avg: Optional[float]
    wasm_gflops: Optional[float]
    js_time_avg: float
    js_gflops: float
    timestamp: datetime

    class Config:
        from_attributes = True


app = FastAPI(title="矩阵乘法性能测试 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/api/results", response_model=BenchmarkResultResponse)
def create_result(result: BenchmarkResultCreate):
    db = next(get_db())
    db_result = BenchmarkResult(
        matrix_size=result.matrix_size,
        iterations=result.iterations,
        optimized=result.optimized,
        wasm_time_avg=result.wasm_time_avg,
        wasm_gflops=result.wasm_gflops,
        js_time_avg=result.js_time_avg,
        js_gflops=result.js_gflops,
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return db_result


@app.get("/api/results", response_model=List[BenchmarkResultResponse])
def read_results(skip: int = 0, limit: int = 100, matrix_size: Optional[int] = None):
    db = next(get_db())
    query = db.query(BenchmarkResult).order_by(BenchmarkResult.timestamp.desc())
    
    if matrix_size is not None:
        query = query.filter(BenchmarkResult.matrix_size == matrix_size)
    
    results = query.offset(skip).limit(limit).all()
    return list(reversed(results))


@app.get("/api/results/{result_id}", response_model=BenchmarkResultResponse)
def read_result(result_id: int):
    db = next(get_db())
    result = db.query(BenchmarkResult).filter(BenchmarkResult.id == result_id).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    return result


@app.delete("/api/results")
def delete_all_results():
    db = next(get_db())
    db.query(BenchmarkResult).delete()
    db.commit()
    return {"message": "All results deleted"}


@app.delete("/api/results/{result_id}")
def delete_result(result_id: int):
    db = next(get_db())
    result = db.query(BenchmarkResult).filter(BenchmarkResult.id == result_id).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    db.delete(result)
    db.commit()
    return {"message": "Result deleted"}


@app.get("/api/stats")
def get_stats(matrix_size: Optional[int] = None):
    db = next(get_db())
    query = db.query(BenchmarkResult)
    
    if matrix_size is not None:
        query = query.filter(BenchmarkResult.matrix_size == matrix_size)
    
    results = query.all()
    
    if not results:
        return {"message": "No results found"}
    
    wasm_times = [r.wasm_time_avg for r in results if r.wasm_time_avg is not None]
    js_times = [r.js_time_avg for r in results]
    
    stats = {
        "total_runs": len(results),
        "matrix_size": matrix_size,
        "wasm": {
            "count": len(wasm_times),
            "avg_time": sum(wasm_times) / len(wasm_times) if wasm_times else None,
            "min_time": min(wasm_times) if wasm_times else None,
            "max_time": max(wasm_times) if wasm_times else None,
        },
        "js": {
            "count": len(js_times),
            "avg_time": sum(js_times) / len(js_times),
            "min_time": min(js_times),
            "max_time": max(js_times),
        }
    }
    
    if wasm_times and js_times:
        avg_speedup = sum(js_times) / sum(wasm_times) if sum(wasm_times) > 0 else 0
        stats["avg_speedup"] = avg_speedup
    
    return stats


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
