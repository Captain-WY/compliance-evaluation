"""律所 & 外部律师 BFF Schemas (2.S17).

律所: LawFirm CRUD + 合作状态切换 + Tab4 案件实绩
律师: ExternalLawyer CRUD
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 律所 - 列表
# ---------------------------------------------------------------------------

class VendorListRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=500)
    keyword: Optional[str] = None
    cooperationStatus: Optional[str] = None
    ratingLevel: Optional[str] = None


class VendorListItem(BaseModel):
    firmId: str
    firmName: str
    unifiedSocialCreditCode: Optional[str] = None
    cooperationStatus: str
    cooperationStatusName: str
    ratingLevel: Optional[str] = None
    ratingLevelName: Optional[str] = None
    activeLawyerCount: int = 0


class VendorListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[VendorListItem]


# ---------------------------------------------------------------------------
# 律所 - 详情
# ---------------------------------------------------------------------------

class VendorDetailRequest(BaseModel):
    firmId: str


class VendorDetailResponse(BaseModel):
    firmId: str
    firmName: str
    unifiedSocialCreditCode: Optional[str] = None
    profile: Optional[str] = None
    rateCardSummary: Optional[str] = None
    cooperationStatus: str
    cooperationStatusName: str
    ratingLevel: Optional[str] = None
    ratingLevelName: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ---------------------------------------------------------------------------
# 律所 - 创建
# ---------------------------------------------------------------------------

class VendorCreateRequest(BaseModel):
    firmName: str
    unifiedSocialCreditCode: Optional[str] = None
    profile: Optional[str] = None
    rateCardSummary: Optional[str] = None
    cooperationStatus: str = "BACKUP"
    ratingLevel: Optional[str] = None


class VendorCreateResponse(BaseModel):
    firmId: str
    firmName: str
    cooperationStatus: str


# ---------------------------------------------------------------------------
# 律所 - 更新
# ---------------------------------------------------------------------------

class VendorUpdateRequest(BaseModel):
    firmId: str
    firmName: str
    unifiedSocialCreditCode: Optional[str] = None
    profile: Optional[str] = None
    rateCardSummary: Optional[str] = None
    ratingLevel: Optional[str] = None


class VendorUpdateResponse(BaseModel):
    firmId: str
    updatedAt: str


# ---------------------------------------------------------------------------
# 律所 - 合作状态切换
# ---------------------------------------------------------------------------

class VendorToggleRequest(BaseModel):
    firmId: str
    targetStatus: str


class VendorToggleResponse(BaseModel):
    firmId: str
    cooperationStatus: str
    cooperationStatusName: str


# ---------------------------------------------------------------------------
# 律所 - Tab4 案件实绩 (D3=A: 仅 case_counsels 列表)
# ---------------------------------------------------------------------------

class VendorCasesRequest(BaseModel):
    firmId: str
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=500)


class VendorCaseItem(BaseModel):
    counselId: str
    caseId: str
    caseName: str
    role: str
    roleName: str
    status: str
    statusName: str


class VendorCasesResponse(BaseModel):
    firmId: str
    total: int
    page: int
    pageSize: int
    items: list[VendorCaseItem]


# ---------------------------------------------------------------------------
# 外部律师 - 列表
# ---------------------------------------------------------------------------

class LawyerListRequest(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=500)
    keyword: Optional[str] = None
    firmId: Optional[str] = None
    status: Optional[str] = None


class LawyerListItem(BaseModel):
    lawyerId: str
    lawyerName: str
    firmId: str
    firmName: Optional[str] = None
    licenseNumber: Optional[str] = None
    title: Optional[str] = None
    expertise: Optional[str] = None
    status: str
    statusName: str


class LawyerListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[LawyerListItem]


# ---------------------------------------------------------------------------
# 外部律师 - 详情
# ---------------------------------------------------------------------------

class LawyerDetailRequest(BaseModel):
    lawyerId: str


class LawyerDetailResponse(BaseModel):
    lawyerId: str
    firmId: str
    firmName: Optional[str] = None
    lawyerName: str
    licenseNumber: Optional[str] = None
    title: Optional[str] = None
    expertise: Optional[str] = None
    contactPhone: Optional[str] = None
    contactEmail: Optional[str] = None
    status: str
    statusName: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ---------------------------------------------------------------------------
# 外部律师 - 创建
# ---------------------------------------------------------------------------

class LawyerCreateRequest(BaseModel):
    firmId: str
    lawyerName: str
    licenseNumber: Optional[str] = None
    title: Optional[str] = None
    expertise: Optional[str] = None
    contactPhone: Optional[str] = None
    contactEmail: Optional[str] = None
    status: str = "ACTIVE"


class LawyerCreateResponse(BaseModel):
    lawyerId: str
    lawyerName: str
    firmId: str
    status: str


# ---------------------------------------------------------------------------
# 外部律师 - 更新
# ---------------------------------------------------------------------------

class LawyerUpdateRequest(BaseModel):
    lawyerId: str
    lawyerName: Optional[str] = None
    licenseNumber: Optional[str] = None
    title: Optional[str] = None
    expertise: Optional[str] = None
    contactPhone: Optional[str] = None
    contactEmail: Optional[str] = None
    status: Optional[str] = None


class LawyerUpdateResponse(BaseModel):
    lawyerId: str
    updatedAt: str
