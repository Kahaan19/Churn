from fastapi import APIRouter

from app.api.v1.datasets import router as datasets_router
from app.api.v1.predictions import router as predictions_router
from app.api.v1.runs import router as runs_router
from app.api.v1.settings import router as settings_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(datasets_router)
api_router.include_router(runs_router)
api_router.include_router(predictions_router)
api_router.include_router(settings_router)
