"""
Compliance and Reporting schemas for API request/response
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from .common import BaseSchema


# ==================== Compliance Schemas ====================

class ComplianceAlertResponse(BaseSchema):
    """Compliance alert response"""
    id: str
    tenant_id: str
    case_id: str
    rule_id: str
    alert_level: str
    alert_message: str
    trigger_data: Optional[Dict[str, Any]] = None
    status: str
    handled_by: Optional[str] = None
    handled_at: Optional[str] = None
    handling_note: Optional[str] = None
    reporting_task_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ComplianceAlertListResponse(BaseSchema):
    """Compliance alert list response"""
    items: List[ComplianceAlertResponse]
    total: int
    page: int
    size: int


# ==================== Reporting Schemas ====================

class ReportingTaskCreate(BaseModel):
    """Reporting task creation request"""
    task_name: str = Field(..., description="Task name")
    report_category: str = Field(..., description="Report category (REGULATORY, INTERNAL_PERIODIC, INTERNAL_AD_HOC)")
    rule_id: Optional[str] = Field(None, description="Source rule ID")
    template_id: Optional[str] = Field(None, description="Template ID")
    assignee_id: str = Field(..., description="Assignee user ID")
    due_date: str = Field(..., description="Due date (YYYY-MM-DD)")


class ReportingTaskResponse(BaseSchema):
    """Reporting task response"""
    id: str
    tenant_id: str
    task_name: str
    report_category: str
    rule_id: Optional[str] = None
    template_id: Optional[str] = None
    assignee_id: str
    due_date: str
    status: str
    approval_instance_id: Optional[str] = None
    submitted_at: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReportingTaskListResponse(BaseSchema):
    """Reporting task list response"""
    items: List[ReportingTaskResponse]
    total: int
    page: int
    size: int