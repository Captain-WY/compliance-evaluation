"""S18 通知 / 附件 / 统一审批 Pydantic DTO."""
from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# 通知 DTOs
# ──────────────────────────────────────────────

class NotificationListRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=200)
    notifyType: Optional[str] = None
    isRead: Optional[bool] = None


class NotificationItem(BaseModel):
    notificationId: str
    notifyType: str
    notifyTypeName: str
    title: str
    content: Optional[str] = None
    referenceUrl: Optional[str] = None
    isRead: bool
    readAt: Optional[str] = None
    createdAt: str


class NotificationListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[NotificationItem]


class UnreadCountResponse(BaseModel):
    unreadCount: int


class MarkReadRequest(BaseModel):
    notificationId: str


class MarkAllReadRequest(BaseModel):
    notifyType: Optional[str] = None


# ──────────────────────────────────────────────
# 附件 DTOs
# ──────────────────────────────────────────────

class AttachmentRegisterRequest(BaseModel):
    businessType: str
    businessId: str
    fileName: str
    fileExtension: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    storageProvider: Optional[str] = "OSS"
    fileUrl: str
    description: Optional[str] = None


class AttachmentRegisterResponse(BaseModel):
    attachmentId: str
    fileName: str
    fileUrl: str
    createdAt: str


class AttachmentListRequest(BaseModel):
    businessType: str
    businessId: str
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=200)


class AttachmentItem(BaseModel):
    attachmentId: str
    fileName: str
    fileExtension: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    fileUrl: str
    storageProvider: Optional[str] = None
    description: Optional[str] = None
    uploaderId: Optional[str] = None
    createdAt: str


class AttachmentListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[AttachmentItem]


class AttachmentDeleteRequest(BaseModel):
    attachmentId: str


class AttachmentPresignRequest(BaseModel):
    fileName: str
    contentType: str | None = None
    expiresIn: int = 900


class AttachmentPresignResponse(BaseModel):
    presignedUrl: str
    objectKey: str
    expiresIn: int


# ──────────────────────────────────────────────
# 统一审批 DTOs
# ──────────────────────────────────────────────

class ApprovalCreateRequest(BaseModel):
    businessType: str
    businessId: str
    title: str
    approverId: str
    processCode: Optional[str] = None


class ApprovalCreateResponse(BaseModel):
    instanceId: str
    taskId: str
    businessType: str
    status: str
    statusName: str


class ApprovalMyTodosRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=200)
    businessType: Optional[str] = None


class ApprovalTodoItem(BaseModel):
    taskId: str
    instanceId: str
    businessType: str
    title: str
    applicantId: str
    applicantName: str
    submittedAt: Optional[str] = None
    referenceUrl: Optional[str] = None


class ApprovalMyTodosResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: List[ApprovalTodoItem]


class ApprovalDetailRequest(BaseModel):
    instanceId: str


class ApprovalTaskVO(BaseModel):
    taskId: str
    nodeName: str
    approverId: str
    approverName: str
    status: str
    statusName: str
    comment: Optional[str] = None
    processedAt: Optional[str] = None


class ApprovalDetailResponse(BaseModel):
    instanceId: str
    businessType: str
    businessId: str
    title: str
    status: str
    statusName: str
    applicantId: str
    submittedAt: Optional[str] = None
    completedAt: Optional[str] = None
    task: ApprovalTaskVO


class ApprovalProcessRequest(BaseModel):
    taskId: str
    action: str  # APPROVE | REJECT
    comment: Optional[str] = None


class ApprovalProcessResponse(BaseModel):
    instanceId: str
    taskId: str
    instanceStatus: str
    instanceStatusName: str
    taskStatus: str
    processedAt: str


class ApprovalCancelRequest(BaseModel):
    instanceId: str
    reason: Optional[str] = None


class ApprovalCancelResponse(BaseModel):
    instanceId: str
    status: str
    statusName: str
