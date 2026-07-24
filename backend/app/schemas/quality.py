from pydantic import BaseModel


class MissingColumn(BaseModel):
    column: str
    count: int
    pct: float


class TypeIssue(BaseModel):
    column: str
    expected: str
    found: str
    n_bad: int


class Outlier(BaseModel):
    column: str
    method: str
    count: int
    pct: float


class ClassBalance(BaseModel):
    positive: int
    negative: int
    positive_rate: float


class LeakageWarning(BaseModel):
    column: str
    reason: str
    score: float


class QualityReport(BaseModel):
    n_rows: int
    n_duplicate_rows: int
    missing: list[MissingColumn]
    type_issues: list[TypeIssue]
    outliers: list[Outlier]
    class_balance: ClassBalance
    leakage_warnings: list[LeakageWarning]
    warnings: list[str]
    blocking_errors: list[str]
