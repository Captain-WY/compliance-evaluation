"""
Pydantic Schemas 包
"""
from .common import (
    StandardResponse,
    PaginationParams,
    PaginatedResponse,
    ErrorResponse,
    BaseSchema,
    AuditMixin,
)
from .dicts import (
    SysDictCreate,
    SysDictUpdate,
    SysDictResponse,
)
from .cases import (
    CaseBase,
    CaseCreate,
    CaseResponse,
    CaseBaseInfoUpdate,
)
from .case_ai import (
    # Enums
    SourceScope,
    AiRunMode,
    LegalDraftType,
    ReportPeriodType,
    ParseScope,
    DocumentParseStatus,
    InternalReportStorageMode,
    # Common VO
    AiSourceRefVO,
    MaterialCompletenessVO,
    AiCommonMetaMixin,
    # Context VO
    ClaimDefenseVO,
    AmountSummaryVO,
    StrategySnapshotVO,
    ClosureSnapshotVO,
    DossierDocumentSummaryVO,
    DossierSummaryVO,
    # Similar case VO
    SimilarCaseItemVO,
    # Report VO
    InternalReportMetricsVO,
    InternalReportSectionVO,
    # Dossier retry VO
    DossierParseRetryItemVO,
    # Requests
    CaseAiContextBuildRequest,
    SimilarCaseSearchRequest,
    StrategyRecommendRequest,
    InternalReportGenerateRequest,
    ClosingLegalDraftGenerateRequest,
    DossierParseRetryRequest,
    # Responses
    CaseAiContextBuildResponse,
    SimilarCaseSearchResponse,
    StrategyRecommendResponse,
    InternalReportGenerateResponse,
    ClosingLegalDraftGenerateResponse,
    DossierParseRetryResponse,
)
# NOTE: 原 .finance 导出 (TransactionCreate / TransactionResponse / CaseBudgetResponse
# / BusinessLineBudgetResponse) 已于 2026-04-20 (切片 2.S6-PRE, 决策 D9=A+D10=B) 彻底删除.
# 2.S6 主切片将新建 schemas/case_finance.py (BFF DTO 按 05_case_detail_finance_api_plan.md §3).

__all__ = [
    # Common
    "StandardResponse",
    "PaginationParams",
    "PaginatedResponse",
    "ErrorResponse",
    "BaseSchema",
    "AuditMixin",
    # Dicts
    "SysDictCreate",
    "SysDictUpdate",
    "SysDictResponse",
    # Cases
    "CaseBase",
    "CaseCreate",
    "CaseResponse",
    "CaseBaseInfoUpdate",
    # AI Case Assistant (WP-AI-00)
    # Enums
    "SourceScope",
    "AiRunMode",
    "LegalDraftType",
    "ReportPeriodType",
    "ParseScope",
    "DocumentParseStatus",
    "InternalReportStorageMode",
    # Common VO
    "AiSourceRefVO",
    "MaterialCompletenessVO",
    "AiCommonMetaMixin",
    # Context VO
    "ClaimDefenseVO",
    "AmountSummaryVO",
    "StrategySnapshotVO",
    "ClosureSnapshotVO",
    "DossierDocumentSummaryVO",
    "DossierSummaryVO",
    # Similar case VO
    "SimilarCaseItemVO",
    # Report VO
    "InternalReportMetricsVO",
    "InternalReportSectionVO",
    # Dossier retry VO
    "DossierParseRetryItemVO",
    # Requests
    "CaseAiContextBuildRequest",
    "SimilarCaseSearchRequest",
    "StrategyRecommendRequest",
    "InternalReportGenerateRequest",
    "ClosingLegalDraftGenerateRequest",
    "DossierParseRetryRequest",
    # Responses
    "CaseAiContextBuildResponse",
    "SimilarCaseSearchResponse",
    "StrategyRecommendResponse",
    "InternalReportGenerateResponse",
    "ClosingLegalDraftGenerateResponse",
    "DossierParseRetryResponse",
]