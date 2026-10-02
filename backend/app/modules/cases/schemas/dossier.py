"""案件卷宗/文档 (Dossier) Pydantic Schema (切片 2.S5).

字段严格对齐 docs/design/v1/db/07_case_documents.md 与
docs/design/v1/db/15_document_permissions.md, Enum 字段使用
`PermissionTargetType / GranteeType / PermissionType / AuthRequestStatus` 自动校验.

覆盖 14 个 BFF 端点:
  - 目录树 (tree)
  - 文档列表/详情 (documents/list, documents/detail)
  - 上传三段式 (upload/init, upload/complete, upload/abort)
  - 下载 (download-url)
  - 文档 CRUD (rename, move, delete)
  - 文件夹 CRUD (folders/create, folders/rename, folders/delete)
  - 权限 (permissions/grant, permissions/revoke, permissions/list)
  - 授权申请 (auth-requests/create, auth-requests/review, auth-requests/list)
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.cases.enums.case_enums import (
    AuthRequestStatus,
    GranteeType,
    PermissionTargetType,
    PermissionType,
)


# =============================================================================
# 1. 文件夹 (Folder) VO / CRUD
# =============================================================================


class FolderVO(BaseModel):
    """文件夹视图对象."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: str | None = None
    folder_name: str
    sort_order: int = 0
    is_system: bool = False
    document_count: int = Field(0, description="该文件夹下最新版本文档数 (不递归子文件夹)")
    children_count: int = Field(0, description="直接子文件夹数")
    children: list["FolderVO"] = Field(default_factory=list, description="递归子文件夹 (仅 tree 端点返回)")


FolderVO.model_rebuild()


class DossierTreeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class DossierTreeResponse(BaseModel):
    case_id: str
    folders: list[FolderVO] = Field(default_factory=list)


class FolderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    parent_id: str | None = Field(None, max_length=36)
    folder_name: str = Field(..., min_length=1, max_length=128)
    sort_order: int = 0


class FolderRenameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder_id: str = Field(..., max_length=36)
    new_name: str = Field(..., min_length=1, max_length=128)


class FolderDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder_id: str = Field(..., max_length=36)
    reason: str | None = Field(None, max_length=200)


# =============================================================================
# 2. 文档 (Document) VO / CRUD
# =============================================================================


class DocumentVO(BaseModel):
    """文档视图对象 (含字典/Enum 翻译)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    folder_id: str
    process_node_id: str | None = None
    doc_category: str | None = None
    doc_category_name: str | None = None
    doc_name: str
    doc_type: str
    doc_size: int
    file_hash: str | None = None
    file_url: str
    version: int = 1
    parent_doc_id: str | None = None
    is_latest: bool = True
    evidence_no: str | None = None
    proof_purpose: str | None = None
    is_confidential: bool = False
    uploader_id: str
    uploader_name: str | None = None
    upload_time: datetime | None = None
    created_at: datetime | None = None
    version_count: int = Field(1, description="同一版本链下的总版本数")


class DocumentsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    folder_id: str = Field(..., max_length=36)
    doc_category: str | None = None
    pagination: "DossierPagination | None" = None


class DossierPagination(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(50, ge=1, le=200)


class DocumentsListResponse(BaseModel):
    folder_id: str
    folder_path: list[str] = Field(default_factory=list, description="从根到当前文件夹的 folder_name 序列")
    total: int
    page: int
    size: int
    items: list[DocumentVO] = Field(default_factory=list)


class DocumentDetailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., max_length=36)


class DocumentDetailResponse(BaseModel):
    document: DocumentVO
    versions: list[DocumentVO] = Field(
        default_factory=list,
        description="同一版本链的历史版本 (按 version DESC, 不含当前)",
    )


class DocumentRenameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., max_length=36)
    new_name: str = Field(..., min_length=1, max_length=255)


class DocumentMoveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., max_length=36)
    target_folder_id: str = Field(..., max_length=36)


class DocumentDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., max_length=36)
    reason: str | None = Field(None, max_length=200)


# =============================================================================
# 3. 上传三段式
# =============================================================================


class UploadInitRequest(BaseModel):
    """`/upload/init` - 校验权限 + 颁发 presigned PUT URL + 登记 upload_session."""

    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., max_length=36)
    folder_id: str = Field(..., max_length=36)
    doc_name: str = Field(..., min_length=1, max_length=255)
    doc_type: str = Field(..., description="扩展名如 PDF / DOCX", max_length=32)
    doc_category: str | None = Field(None, description="字典 DOCUMENT_CATEGORY", max_length=64)
    doc_size: int = Field(
        ...,
        ge=1,
        le=104857600,  # 100 MB (对齐 config.MAX_UPLOAD_SIZE; Batch C)
        description="文件大小 (字节, 上限 100MB)",
    )
    file_hash: str | None = Field(None, description="SHA256 摘要 (可选, 用于秒传匹配)", max_length=96)
    parent_doc_id: str | None = Field(None, description="指向前一版本的 doc_id (形成版本链)", max_length=36)
    evidence_no: str | None = Field(None, max_length=64)
    proof_purpose: str | None = None
    is_confidential: bool = False
    process_node_id: str | None = Field(None, max_length=36)

    @field_validator("doc_type")
    @classmethod
    def _validate_doc_type(cls, v: str) -> str:
        from app.modules.cases.core.config import get_settings

        settings = get_settings()
        ext = v.lower() if not v.startswith(".") else v.lower()
        allowed = {a.lower().lstrip(".") for a in settings.ALLOWED_EXTENSIONS}
        if ext.lstrip(".") not in allowed:
            raise ValueError(f"不支持的文件类型: .{ext}。允许的类型: {', '.join(settings.ALLOWED_EXTENSIONS)}")
        return v


class UploadInitResponse(BaseModel):
    upload_id: str = Field(description="upload_sessions.id, complete 时回传")
    doc_id: str = Field(description="预分配的 case_documents.id")
    bucket: str
    object_key: str
    presigned_url: str | None = Field(
        None,
        description="直传 PUT URL; skip_upload=true 时可为空",
    )
    expires_in: int = 900
    http_method: Literal["PUT"] = "PUT"
    required_headers: dict[str, str] = Field(default_factory=dict)
    skip_upload: bool = Field(
        False,
        description="秒传命中: file_hash 在租户内已存在, 前端可跳过 PUT 直接调 complete",
    )


class UploadCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    upload_id: str = Field(..., max_length=36)
    etag: str | None = Field(None, description="MinIO PUT 返回的 ETag (可选校验)", max_length=128)


class UploadAbortRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    upload_id: str = Field(..., max_length=36)


# =============================================================================
# 4. 下载
# =============================================================================


class DownloadUrlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str = Field(..., max_length=36)
    disposition: Literal["attachment", "inline"] = "attachment"


class DownloadUrlResponse(BaseModel):
    doc_id: str
    presigned_url: str
    expires_in: int = 900
    http_method: Literal["GET"] = "GET"


# =============================================================================
# 5. 权限授予 / 回收 / 查询
# =============================================================================


class PermissionVO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    target_type: PermissionTargetType
    target_type_name: str | None = None
    target_id: str
    grantee_type: GranteeType
    grantee_type_name: str | None = None
    grantee_id: str
    grantee_name: str | None = None
    permission_type: PermissionType
    permission_type_name: str | None = None
    expire_at: datetime | None = None
    granted_by: str
    source_request_id: str | None = None
    created_at: datetime | None = None
    is_expired: bool = False


class PermissionGrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    target_type: PermissionTargetType
    target_id: str = Field(..., max_length=36)
    grantee_type: GranteeType
    grantee_id: str = Field(..., max_length=36)
    permission_type: PermissionType
    expire_at: datetime | None = None
    source_request_id: str | None = Field(None, max_length=36)


class PermissionRevokeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    permission_id: str = Field(..., max_length=36)
    reason: str | None = Field(None, max_length=200)


class PermissionsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    target_type: PermissionTargetType | None = None
    target_id: str | None = Field(None, max_length=36)


class PermissionsListResponse(BaseModel):
    total: int
    items: list[PermissionVO] = Field(default_factory=list)


# =============================================================================
# 6. 权限申请 (D8 轻实现)
# =============================================================================


class AuthRequestVO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    target_type: PermissionTargetType
    target_type_name: str | None = None
    target_id: str
    requested_permission: PermissionType
    requested_permission_name: str | None = None
    applicant_id: str
    applicant_name: str | None = None
    reason: str
    requested_duration_days: int | None = None
    status: AuthRequestStatus
    status_name: str | None = None
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    review_comment: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AuthRequestCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    target_type: PermissionTargetType
    target_id: str = Field(..., max_length=36)
    requested_permission: PermissionType
    reason: str = Field(..., min_length=1, max_length=1000)
    requested_duration_days: int | None = Field(None, ge=1, le=3650)


class AuthRequestReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(..., max_length=36)
    action: Literal["APPROVE", "REJECT"]
    comment: str | None = Field(None, max_length=1000)


class AuthRequestsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    status_filter: list[AuthRequestStatus] | None = None
    pagination: DossierPagination | None = None


class AuthRequestsListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[AuthRequestVO] = Field(default_factory=list)


# =============================================================================
# 7. 证据目录自动生成
# =============================================================================

class EvidenceCatalogItem(BaseModel):
    """证据目录单行项."""

    model_config = ConfigDict(from_attributes=True)

    evidence_no: str | None = Field(None, description="证据编号")
    doc_name: str = Field(..., description="证据名称")
    proof_purpose: str | None = Field(None, description="证明目的")
    doc_type: str = Field(..., description="文件类型")
    doc_size: int = Field(0, description="文件大小 (字节)")
    uploader_name: str | None = Field(None, description="上传人")
    upload_time: datetime | None = Field(None, description="上传时间")
    folder_path: str = Field("", description="所在文件夹路径")


class EvidenceCatalogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class EvidenceCatalogResponse(BaseModel):
    case_id: str
    case_name: str | None = None
    total: int
    items: list[EvidenceCatalogItem] = Field(default_factory=list)


# 解决循环引用
DocumentsListRequest.model_rebuild()
