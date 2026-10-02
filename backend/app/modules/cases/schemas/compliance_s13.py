"""S13 合规中心 Schemas (Pydantic DTOs).

对应 docs/design/v1/api/04_compliance_center/02_alerts_governance_api_plan.md v1.2

三组接口:
  - 合规预警 (alerts): list / handle
  - 数据治理 (governance): issues/list / scan / issues/ignore
  - 合规规则 (rules): list / save / toggle
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 合规预警 (Compliance Alerts)
# ---------------------------------------------------------------------------

class AlertListRequest(BaseModel):
    status: Optional[str] = Field(None, description="PENDING / REPORTED / EXEMPTED")
    alertLevel: Optional[str] = Field(None, description="CRITICAL / HIGH / MEDIUM / LOW")
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)


class AlertItem(BaseModel):
    alertId: str
    caseId: str
    caseCode: str
    caseTitle: str
    ruleName: str
    alertMessage: str
    alertLevel: str
    alertLevel_name: str
    status: str
    status_name: str
    createdAt: datetime

    class Config:
        from_attributes = True


class AlertListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[AlertItem]


class AlertHandleRequest(BaseModel):
    alertId: str = Field(..., description="预警 ID")
    action: str = Field(..., description="CONVERT_TO_TASK / DISMISS")
    notes: Optional[str] = Field(None, description="处理备注；DISMISS 时必填")


class AlertHandleResponse(BaseModel):
    alertId: str
    status: str
    status_name: str
    newTaskId: Optional[str] = None


# ---------------------------------------------------------------------------
# 数据质量与治理 (Data Governance)
# ---------------------------------------------------------------------------

class IssueListRequest(BaseModel):
    severity: Optional[str] = Field(None, description="BLOCKER / WARNING")
    issueType: Optional[str] = Field(None, description="LOGICAL_CONTRADICTION / MISSING_MANDATORY")
    status: Optional[str] = Field(None, description="PENDING / RESOLVED / IGNORED")
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)


class IssueItem(BaseModel):
    issueId: str
    caseId: str
    caseCode: str
    issueType: str
    description: str
    severity: str
    severity_name: str
    status: str
    status_name: str
    createdAt: datetime

    class Config:
        from_attributes = True


class IssueListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[IssueItem]


class ScanRequest(BaseModel):
    scope: str = Field(..., description="ALL_ACTIVE / SPECIFIC_CASES")
    caseIds: Optional[List[str]] = Field(None, description="scope=SPECIFIC_CASES 时必填")


class ScanResponse(BaseModel):
    scan_id: str
    status: str
    estimated_cases: int


class IssueIgnoreRequest(BaseModel):
    issueId: str = Field(..., description="异常 ID")
    reason: str = Field(..., description="忽略原因（必填，用于审计）")


class IssueIgnoreResponse(BaseModel):
    issueId: str
    status: str


# ---------------------------------------------------------------------------
# 合规规则 (Compliance Rules)
# ---------------------------------------------------------------------------

class RuleListRequest(BaseModel):
    ruleType: Optional[str] = Field(None, description="EVENT_TRIGGERED / TIME_TRIGGERED")
    status: Optional[str] = Field(None, description="ACTIVE / INACTIVE / DRAFT")
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)


class RuleItem(BaseModel):
    ruleId: str
    ruleCode: str
    ruleName: str
    ruleType: str
    ruleType_name: str
    actionType: str
    actionType_name: str
    ruleLogic: Optional[dict] = None
    actionConfig: Optional[dict] = None
    status: str
    status_name: str

    class Config:
        from_attributes = True


class RuleListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[RuleItem]


class RuleSaveRequest(BaseModel):
    ruleId: Optional[str] = Field(None, description="更新时必填，新建时省略")
    ruleCode: str = Field(..., description="规则编码（唯一键）")
    ruleName: str = Field(..., description="规则名称")
    ruleType: str = Field(..., description="EVENT_TRIGGERED / TIME_TRIGGERED")
    actionType: str = Field(..., description="GENERATE_ALERT / GENERATE_TASK / SEND_NOTIFICATION")
    ruleLogic: Optional[dict] = Field(None, description="规则逻辑 JSONB（D1=A: 仅存储）")
    actionConfig: Optional[dict] = Field(None, description="动作配置 JSONB")


class RuleSaveResponse(BaseModel):
    ruleId: str
    ruleCode: str
    ruleName: str
    ruleType: str
    ruleType_name: str
    actionType: str
    actionType_name: str
    status: str
    status_name: str
    ruleLogic: Optional[dict] = None
    actionConfig: Optional[dict] = None

    class Config:
        from_attributes = True


class RuleToggleRequest(BaseModel):
    ruleId: str = Field(..., description="规则 ID")


class RuleToggleResponse(BaseModel):
    ruleId: str
    status: str
    status_name: str
