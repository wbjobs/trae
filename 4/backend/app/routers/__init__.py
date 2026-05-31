from app.routers.projects import router as projects_router
from app.routers.geometry import router as geometry_router
from app.routers.mesh import router as mesh_router
from app.routers.results import router as results_router

router = projects_router
geometry = geometry_router
mesh = mesh_router
results = results_router

__all__ = ["router", "geometry", "mesh", "results"]
