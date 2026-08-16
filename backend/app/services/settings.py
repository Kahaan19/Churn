"""The configured assumptions, for display.

Read-only on purpose (see `PlatformSettings`). This is the only place the financial config is
exposed outside a scored payload.
"""

from app.core.config import get_financial_assumptions, get_settings
from app.schemas.settings import PlatformSettings


def get_platform_settings() -> PlatformSettings:
    assumptions = get_financial_assumptions()
    settings = get_settings()
    return PlatformSettings(
        gross_margin=assumptions.gross_margin,
        discount_rate_monthly=assumptions.discount_rate_monthly,
        expected_tenure_months=assumptions.expected_tenure_months,
        save_rate=assumptions.save_rate,
        retention_cost=assumptions.retention_cost,
        config_path=settings.financial_config_path,
        max_upload_mb=settings.max_upload_mb,
        version=settings.version,
    )
