from pydantic import BaseModel

from app.schemas.finance import RiskTier


class PlatformSettings(BaseModel):
    """What the platform is currently configured to assume, read-only.

    Exists so the settings page can show the basis of every currency figure without a run or a
    scored batch to hang it off. Editing is deliberately not offered: `config/financial.yaml` is
    the single source of these values, and a second, racier way to set them would mean two
    customers scored minutes apart could rest on different assumptions with no record of it.
    """

    gross_margin: float
    discount_rate_monthly: float
    expected_tenure_months: int
    save_rate: float
    # Per tier, because a critical-risk customer is worth a phone call and a low-risk one is not.
    retention_cost: dict[RiskTier, float]

    config_path: str
    max_upload_mb: int
    version: str
