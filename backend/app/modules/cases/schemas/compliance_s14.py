"""S14 合规报送任务 Schemas (Pydantic DTOs).

对应:
  docs/design/v1/api/04_compliance_center/03_unified_tasks_api_plan.md v2.1  (8 端点)
  docs/design/v1/api/04_compliance_center/04_ai_generation_export_api_plan.md v2.1 (4 端点)

五组接口:
  - 统一报送任务 (tasks): list / detail / create / update-status
  - 报送范围圈定 (task-cases): cases/link / cases/list
  - 不可变数据快照 (snapshots): snapshots/create / snapshots/list
  - AI 赋能与草稿 (ai): ai-summary / content/save
  - 物料渲染导出 (generate): generate / download
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 统一报送任务 (Tasks)
# ---------------------------------------------------------------------------

class TaskListRequest(BaseModel):
    category: Optional[str] = Field(None, description="COMPLIANCE_DISCLOSURE / INTERNAL_FINANCE / AUDIT_EXPORT")
    status: Optional[str] = Field(None, description="DATA_PREP / PENDING_APPROVAL / APPROVED / CANCELLED")
    dueDateStart: Optional[date] = Field(None, description="截止日期范围起")
    dueDateEnd: Optional[date] = Field(None, description="截止日期范围止")
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)


class TaskItem(BaseModel):
    taskId: str
    taskName: str
    category: str
    dueDate: date
    status: str
    status_name: str
    assigneeId: str
    templateId: Optional[str] = None
    snapshotId: Optional[str] = None
    createdAt: datetime


class TaskListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[TaskItem]


class TaskDetailRequest(BaseModel):
    taskId: str


class TaskDetailResponse(BaseModel):
    taskId: str
    taskName: str
    category: str
    dueDate: date
    status: str
    status_name: str
    assigneeId: str
    templateId: Optional[str] = None
    snapshotId: Optional[str] = None
    contentData: Optional[str] = None
    reportUrl: Optional[str] = None
    snapshotCount: int = 0
    createdAt: datetime
    updatedAt: datetime


class TaskCreateRequest(BaseModel):
    taskName: str = Field(..., min_length=1, max_length=128)
    category: str = Field(..., description="COMPLIANCE_DISCLOSURE / INTERNAL_FINANCE / AUDIT_EXPORT")
    dueDate: date
    templateId: Optional[str] = None
    assigneeId: str
    description: Optional[str] = None


class TaskCreateResponse(BaseModel):
    taskId: str
    status: str


class TaskUpdateStatusRequest(BaseModel):
    taskId: str
    targetStatus: str = Field(..., description="PENDING_APPROVAL / APPROVED / DATA_PREP / CANCELLED")
    comment: Optional[str] = None


class TaskUpdateStatusResponse(BaseModel):
    taskId: str
    previousStatus: str
    currentStatus: str


# ---------------------------------------------------------------------------
# 报送范围圈定 (Task-Case Association)
# ---------------------------------------------------------------------------

class TaskCaseLinkRequest(BaseModel):
    taskId: str
    caseIds: List[str] = Field(..., min_length=1, description="关联案件 ID 列表")


class TaskCaseLinkResponse(BaseModel):
    taskId: str
    linkedCount: int = Field(..., description="本次新增关联数量 (已存在的幂等跳过)")


class TaskCaseListRequest(BaseModel):
    taskId: str
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)


class CaseWithBlockerItem(BaseModel):
    caseId: str
    caseCode: str
    caseName: str
    hasBlocker: bool
    blockerCount: int


class TaskCaseListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[CaseWithBlockerItem]


# ---------------------------------------------------------------------------
# 不可变数据快照 (Snapshots)
# ---------------------------------------------------------------------------

class SnapshotCreateRequest(BaseModel):
    taskId: str
    snapshotName: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None


class BlockerIssueItem(BaseModel):
    caseId: str
    caseCode: str
    description: str


class SnapshotCreateResponse(BaseModel):
    snapshotId: str
    taskId: str
    snapshotName: str
    ossUrl: str
    recordCount: int
    createdAt: datetime


class SnapshotListRequest(BaseModel):
    taskId: str
    page: int = Field(1, ge=1)
    pageSize: int = Field(10, ge=1, le=100)


class SnapshotItem(BaseModel):
    snapshotId: str
    taskId: str
    snapshotName: str
    description: Optional[str] = None
    recordCount: int
    ossUrl: str
    createdAt: datetime
    createdBy: str


class SnapshotListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[SnapshotItem]


# ---------------------------------------------------------------------------
# AI 赋能与草稿编辑 (AI Generation)
# ---------------------------------------------------------------------------

class AiSummaryRequest(BaseModel):
    taskId: str
    snapshotId: str
    promptType: str = Field(..., description="RISK_SUMMARY / MANAGEMENT_ADVICE / CASE_BRIEF")


class AiSummaryResponse(BaseModel):
    taskId: str
    snapshotId: str
    promptType: str
    summary: str
    generatedAt: datetime
    isStub: bool = True


class ContentSaveRequest(BaseModel):
    taskId: str
    contentData: str = Field(..., max_length=512_000, description="AI 草稿 + 人工润色富文本 (≤500KB)")


class ContentSaveResponse(BaseModel):
    taskId: str
    savedAt: datetime


# ---------------------------------------------------------------------------
# 物料渲染与组合下载 (Generate & Download)
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    taskId: str
    snapshotId: str
    templateId: Optional[str] = None


class GenerateResponse(BaseModel):
    taskId: str
    snapshotId: str
    reportUrl: str


class DownloadRequest(BaseModel):
    taskId: str
    includeDataDraft: bool = True


class DownloadFileItem(BaseModel):
    type: str = Field(..., description="REPORT / DATA_DRAFT")
    url: str
    fileName: str


class DownloadResponse(BaseModel):
    taskId: str
    files: List[DownloadFileItem]
