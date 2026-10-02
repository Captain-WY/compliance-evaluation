"""Dashboard / Snapshots / Business Portal / Vendor Portal BFF Schemas (2.S19)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ================================================================
# Common
# ================================================================

class PageRequest(BaseModel):
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=20, ge=1, le=50)


# ================================================================
# Dashboard — metrics
# ================================================================

class DashboardMetricsRequest(BaseModel):
    period: str = "MONTH"  # WEEK / MONTH / YEAR


class DashboardMetricsResponse(BaseModel):
    period: str
    activeCaseCount: int
    totalAmount: str
    newCaseCount: int
    winRate: Optional[str]
    budgetExecutionRate: Optional[str]
    closedCaseCount: int


# ================================================================
# Dashboard — alerts
# ================================================================

class DashboardAlertsRequest(PageRequest):
    pass


class AlertItem(BaseModel):
    alertId: str
    alertType: str
    alertTypeName: str
    severity: str
    severityName: str
    title: str
    caseId: Optional[str]
    caseTitle: Optional[str]
    referenceUrl: Optional[str]
    dueDate: Optional[str]
    createdAt: str


class DashboardAlertsResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[AlertItem]


# ================================================================
# Snapshots — list
# ================================================================

class SnapshotListRequest(PageRequest):
    snapshotType: Optional[str] = None  # FINANCIAL / COMPLIANCE
    period: Optional[str] = None        # YYYY-Q{n} 或 YYYY-MM，仅 FINANCIAL 生效


class SnapshotListItem(BaseModel):
    snapshotId: str
    snapshotType: str
    snapshotTypeName: str
    snapshotName: str
    period: Optional[str]
    snapshotDate: Optional[str]
    status: str
    statusName: str
    fileSize: Optional[int]
    lockedAt: Optional[str]
    createdAt: str


class SnapshotListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[SnapshotListItem]


# ================================================================
# Snapshots — detail
# ================================================================

class SnapshotDetailRequest(BaseModel):
    snapshotId: str
    snapshotType: str  # FINANCIAL / COMPLIANCE


class SnapshotDetailResponse(BaseModel):
    snapshotId: str
    snapshotType: str
    snapshotTypeName: str
    snapshotName: str
    period: Optional[str]
    snapshotDate: Optional[str]
    description: Optional[str]
    recordCount: Optional[int]
    fileSize: Optional[int]
    status: str
    statusName: str
    lockedAt: Optional[str]
    createdAt: str
    createdBy: Optional[str]


# ================================================================
# Snapshots — download-url
# ================================================================

class SnapshotDownloadUrlRequest(BaseModel):
    snapshotId: str
    snapshotType: str  # FINANCIAL / COMPLIANCE


class SnapshotDownloadUrlResponse(BaseModel):
    snapshotId: str
    downloadUrl: Optional[str]
    expiresAt: Optional[str]
    fileName: Optional[str]


# ================================================================
# Business Portal — clues/list
# ================================================================

class ClueListRequest(PageRequest):
    status: Optional[str] = None


class ClueListItem(BaseModel):
    clueId: str
    title: str
    content: Optional[str]
    sourceType: str
    sourceTypeName: str
    status: str
    statusName: str
    submittedAt: str
    caseId: Optional[str]
    caseTitle: Optional[str]


class ClueListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[ClueListItem]


# ================================================================
# Business Portal — evidence-tasks/list
# ================================================================

class EvidenceTaskListRequest(PageRequest):
    status: Optional[str] = None  # PENDING / REJECTED / SUBMITTED / APPROVED


class EvidenceTaskListItem(BaseModel):
    taskId: str
    requestNo: str
    title: str
    description: str
    caseId: str
    caseTitle: Optional[str]
    caseCode: Optional[str]
    deadline: Optional[str]
    status: str
    statusName: str
    rejectReason: Optional[str]
    submittedAt: Optional[str]
    createdAt: str


class EvidenceTaskListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[EvidenceTaskListItem]


# ================================================================
# Business Portal — evidence-tasks/submit
# ================================================================

class EvidenceTaskSubmitRequest(BaseModel):
    taskId: str
    attachmentIds: list[str] = Field(default_factory=list)
    remark: Optional[str] = Field(default=None, max_length=500)


class EvidenceTaskSubmitResponse(BaseModel):
    taskId: str
    status: str
    statusName: str
    submittedAt: str


# ================================================================
# Vendor Portal — summary
# ================================================================

class VendorSummaryRequest(BaseModel):
    pass


class VendorSummaryResponse(BaseModel):
    lawyerId: str
    lawyerName: str
    lawFirmId: Optional[str]
    lawFirmName: Optional[str]
    rating: Optional[str]
    pendingTaskCount: int
    activeCaseCount: int
    totalCaseCount: int


# ================================================================
# Vendor Portal — tasks/list
# ================================================================

class VendorTaskListRequest(PageRequest):
    status: Optional[str] = None  # PENDING / OVERDUE / COMPLETED


class VendorTaskListItem(BaseModel):
    taskId: str
    title: str
    description: Optional[str]
    caseId: str
    caseTitle: Optional[str]
    caseCode: Optional[str]
    deadline: Optional[str]
    isOverdue: bool
    status: str
    statusName: str
    createdAt: str


class VendorTaskListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[VendorTaskListItem]


# ================================================================
# Vendor Portal — tasks/submit
# ================================================================

class VendorTaskSubmitRequest(BaseModel):
    taskId: str
    attachmentIds: list[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=500)


class VendorTaskSubmitResponse(BaseModel):
    taskId: str
    status: str
    statusName: str
    completedAt: str


# ================================================================
# Vendor Portal — tasks/detail
# ================================================================

class VendorTaskDetailRequest(BaseModel):
    taskId: str


class VendorTaskAttachment(BaseModel):
    attachmentId: str
    fileName: str
    fileUrl: str
    fileSize: Optional[int]
    uploadedAt: str


class VendorTaskDetailResponse(BaseModel):
    taskId: str
    title: str
    description: Optional[str]
    caseId: str
    caseTitle: Optional[str]
    caseCode: Optional[str]
    deadline: Optional[str]
    isOverdue: bool
    status: str
    statusName: str
    attachments: list[VendorTaskAttachment]
    notes: Optional[str]
    createdAt: str
    completedAt: Optional[str]
