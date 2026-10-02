"""文书模板 / 流程模板 / 任务模板 BFF Schemas (2.S17).

D1=A: 直接返回 file_url, 无预签名
D2=A: 流程模板 + 任务模板管理端 CRUD 归入 S17
"""
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 文书模板 - 列表
# ---------------------------------------------------------------------------

class TemplateListRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=500, alias="page_size")
    keyword: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


class TemplateListItem(BaseModel):
    templateId: str
    templateName: str
    category: str
    categoryName: str
    fileType: str
    fileTypeName: str
    version: int
    status: str
    statusName: str
    fileUrl: str
    updatedAt: Optional[str] = None


class TemplateListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[TemplateListItem]


# ---------------------------------------------------------------------------
# 文书模板 - 详情
# ---------------------------------------------------------------------------

class TemplateDetailRequest(BaseModel):
    templateId: str = Field(alias="template_id")


class TemplateDetailResponse(BaseModel):
    templateId: str
    templateName: str
    category: str
    categoryName: str
    description: Optional[str] = None
    fileUrl: str
    fileType: str
    fileTypeName: str
    version: int
    status: str
    statusName: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ---------------------------------------------------------------------------
# 文书模板 - 创建
# ---------------------------------------------------------------------------

class TemplateCreateRequest(BaseModel):
    templateName: str = Field(alias="template_name")
    category: str
    description: Optional[str] = None
    fileUrl: str = Field(alias="file_url")
    fileType: str = Field(alias="file_type")


class TemplateCreateResponse(BaseModel):
    templateId: str
    templateName: str
    status: str


# ---------------------------------------------------------------------------
# 文书模板 - 更新元数据
# ---------------------------------------------------------------------------

class TemplateUpdateRequest(BaseModel):
    templateId: str = Field(alias="template_id")
    templateName: str = Field(alias="template_name")
    category: str
    description: Optional[str] = None


class TemplateUpdateResponse(BaseModel):
    templateId: str
    updatedAt: str


# ---------------------------------------------------------------------------
# 文书模板 - 替换文件 (版本升级)
# ---------------------------------------------------------------------------

class TemplateReplaceFileRequest(BaseModel):
    templateId: str = Field(alias="template_id")
    fileUrl: str = Field(alias="file_url")
    fileType: str = Field(alias="file_type")
    versionNote: Optional[str] = Field(default=None, alias="version_note")


class TemplateReplaceFileResponse(BaseModel):
    templateId: str
    version: int
    fileUrl: str


# ---------------------------------------------------------------------------
# 文书模板 - 状态切换
# ---------------------------------------------------------------------------

class TemplateToggleRequest(BaseModel):
    templateId: str = Field(alias="template_id")
    targetStatus: str = Field(alias="target_status")


class TemplateToggleResponse(BaseModel):
    templateId: str
    status: str
    statusName: str


# ---------------------------------------------------------------------------
# 流程模板 - 列表
# ---------------------------------------------------------------------------

class ProcessTemplateListRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(50, ge=1, le=500, alias="page_size")
    caseTypeCode: Optional[str] = Field(default=None, alias="case_type_code")
    stageCode: Optional[str] = Field(default=None, alias="stage_code")
    isActive: Optional[bool] = Field(default=None, alias="is_active")


class ProcessTemplateListItem(BaseModel):
    processTemplateId: str
    caseTypeCode: str
    stageCode: str
    stageName: str
    sortOrder: int
    isRequired: bool
    description: Optional[str] = None
    isActive: bool
    taskCount: int = 0


class ProcessTemplateListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[ProcessTemplateListItem]


# ---------------------------------------------------------------------------
# 流程模板 - 详情 (含任务列表)
# ---------------------------------------------------------------------------

class ProcessTemplateDetailRequest(BaseModel):
    processTemplateId: str = Field(alias="process_template_id")


class TaskTemplateSummary(BaseModel):
    taskTemplateId: str
    taskCode: Optional[str] = None
    taskName: str
    sortOrder: int
    isMilestone: bool
    isRequired: bool
    defaultDaysDue: Optional[int] = None


class ProcessTemplateDetailResponse(BaseModel):
    processTemplateId: str
    caseTypeCode: str
    stageCode: str
    stageName: str
    sortOrder: int
    isRequired: bool
    description: Optional[str] = None
    isActive: bool
    tasks: list[TaskTemplateSummary]


# ---------------------------------------------------------------------------
# 流程模板 - 创建
# ---------------------------------------------------------------------------

class ProcessTemplateCreateRequest(BaseModel):
    caseTypeCode: str = Field(alias="case_type_code")
    stageCode: str = Field(alias="stage_code")
    stageName: str = Field(alias="stage_name")
    sortOrder: int = Field(0, alias="sort_order")
    isRequired: bool = Field(True, alias="is_required")
    description: Optional[str] = None


class ProcessTemplateCreateResponse(BaseModel):
    processTemplateId: str
    stageName: str
    isActive: bool


# ---------------------------------------------------------------------------
# 流程模板 - 更新
# ---------------------------------------------------------------------------

class ProcessTemplateUpdateRequest(BaseModel):
    processTemplateId: str = Field(alias="process_template_id")
    stageName: str = Field(alias="stage_name")
    sortOrder: int = Field(alias="sort_order")
    isRequired: bool = Field(alias="is_required")
    description: Optional[str] = None


class ProcessTemplateUpdateResponse(BaseModel):
    processTemplateId: str
    updatedAt: str


# ---------------------------------------------------------------------------
# 流程模板 - 激活状态切换
# ---------------------------------------------------------------------------

class ProcessTemplateToggleRequest(BaseModel):
    processTemplateId: str = Field(alias="process_template_id")
    isActive: bool = Field(alias="is_active")


class ProcessTemplateToggleResponse(BaseModel):
    processTemplateId: str
    isActive: bool


# ---------------------------------------------------------------------------
# 任务模板 - 列表
# ---------------------------------------------------------------------------

class TaskTemplateListRequest(BaseModel):
    processTemplateId: str = Field(alias="process_template_id")
    page: int = Field(1, ge=1)
    pageSize: int = Field(100, ge=1, le=500, alias="page_size")


class TaskTemplateListItem(BaseModel):
    taskTemplateId: str
    processTemplateId: str
    taskCode: Optional[str] = None
    taskName: str
    taskGroup: Optional[str] = None
    displayStyle: Optional[str] = None
    isMilestone: bool
    isRequired: bool
    sortOrder: int
    defaultDaysDue: Optional[int] = None
    description: Optional[str] = None
    isActive: bool


class TaskTemplateListResponse(BaseModel):
    processTemplateId: str
    total: int
    page: int
    pageSize: int
    items: list[TaskTemplateListItem]


# ---------------------------------------------------------------------------
# 任务模板 - 创建
# ---------------------------------------------------------------------------

class TaskTemplateCreateRequest(BaseModel):
    processTemplateId: str = Field(alias="process_template_id")
    taskCode: Optional[str] = Field(default=None, alias="task_code")
    taskName: str = Field(alias="task_name")
    taskGroup: Optional[str] = Field(default=None, alias="task_group")
    displayStyle: str = Field("TIMELINE", alias="display_style")
    isMilestone: bool = Field(False, alias="is_milestone")
    isRequired: bool = Field(True, alias="is_required")
    sortOrder: int = Field(0, alias="sort_order")
    defaultDaysDue: Optional[int] = Field(default=None, alias="default_days_due")
    description: Optional[str] = None
    extendedConfig: Optional[Any] = Field(default=None, alias="extended_config")
    actionType: str = Field("NONE", alias="action_type")
    actionConfig: Optional[Any] = Field(default=None, alias="action_config")
    requiredDocTypes: Optional[Any] = Field(default=None, alias="required_doc_types")


class TaskTemplateCreateResponse(BaseModel):
    taskTemplateId: str
    taskName: str
    processTemplateId: str


# ---------------------------------------------------------------------------
# 任务模板 - 更新
# ---------------------------------------------------------------------------

class TaskTemplateUpdateRequest(BaseModel):
    taskTemplateId: str = Field(alias="task_template_id")
    taskName: Optional[str] = Field(default=None, alias="task_name")
    taskGroup: Optional[str] = Field(default=None, alias="task_group")
    isMilestone: Optional[bool] = Field(default=None, alias="is_milestone")
    isRequired: Optional[bool] = Field(default=None, alias="is_required")
    sortOrder: Optional[int] = Field(default=None, alias="sort_order")
    defaultDaysDue: Optional[int] = Field(default=None, alias="default_days_due")
    description: Optional[str] = None


class TaskTemplateUpdateResponse(BaseModel):
    taskTemplateId: str
    updatedAt: str


# ---------------------------------------------------------------------------
# 任务模板 - 删除
# ---------------------------------------------------------------------------

class TaskTemplateDeleteRequest(BaseModel):
    taskTemplateId: str = Field(alias="task_template_id")


class TaskTemplateDeleteResponse(BaseModel):
    taskTemplateId: str
    deleted: bool
