from fastapi import APIRouter

from app.api.v1.datasets import router as datasets_router
from app.api.v1.runs import router as runs_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(datasets_router)
api_router.include_router(runs_router)
