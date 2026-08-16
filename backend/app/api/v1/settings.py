from fastapi import APIRouter

from app.schemas.settings import PlatformSettings
from app.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=PlatformSettings)
def get_settings() -> PlatformSettings:
    return settings_service.get_platform_settings()
