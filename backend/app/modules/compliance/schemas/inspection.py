from pydantic import BaseModel, ConfigDict, Field, field_validator


class InspectionPlanAttachmentRequest(BaseModel):
    attachment_type: str = Field(alias="attachmentType", min_length=1)
    file_id: str = Field(alias="fileId", min_length=1)

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class InspectionPlanCreateRequest(BaseModel):
    inspection_plan_id: str | None = Field(default=None, alias="inspectionPlanId")
    inspect_code: str | None = Field(default=None, alias="inspectCode")
    title: str = Field(min_length=1)
    type: str = Field(min_length=1)
    frequency: str = Field(min_length=1)
    confidentiality_level: str | None = Field(default=None, alias="confidentialityLevel")
    target_org_ids: list[str] = Field(default_factory=list, alias="targetOrgIds")
    target_personnel_ids: list[str] = Field(default_factory=list, alias="targetPersonnelIds")
    target_dept: str | None = Field(default=None, alias="targetDept")
    leader_user_id: str | None = Field(default=None, alias="leaderUserId")
    team_member_user_ids: list[str] | None = Field(default=None, alias="teamMemberUserIds")
    planned_start_date: str = Field(alias="plannedStartDate")
    planned_end_date: str = Field(alias="plannedEndDate")
    files: list[InspectionPlanAttachmentRequest] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    @field_validator("type", "frequency")
    @classmethod
    def required_dictionary_code(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("required")
        return value


class InspectionPlanUpdateRequest(BaseModel):
    inspect_code: str | None = Field(default=None, alias="inspectCode")
    title: str | None = Field(default=None, min_length=1)
    type: str | None = None
    frequency: str | None = None
    confidentiality_level: str | None = Field(default=None, alias="confidentialityLevel")
    target_org_ids: list[str] | None = Field(default=None, alias="targetOrgIds")
    target_personnel_ids: list[str] | None = Field(default=None, alias="targetPersonnelIds")
    target_dept: str | None = Field(default=None, alias="targetDept")
    leader_user_id: str | None = Field(default=None, alias="leaderUserId")
    team_member_user_ids: list[str] | None = Field(default=None, alias="teamMemberUserIds")
    planned_start_date: str | None = Field(default=None, alias="plannedStartDate")
    planned_end_date: str | None = Field(default=None, alias="plannedEndDate")
    files: list[InspectionPlanAttachmentRequest] | None = None

    model_config = {"populate_by_name": True}


class InspectionPlanTransitionRequest(BaseModel):
    action: str = Field(min_length=1)
    reason: str | None = None
    comment: str | None = None
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")
    optimistic_version: int | None = Field(default=None, alias="optimisticVersion")

    model_config = {"populate_by_name": True}


class InspectionPlanAcknowledgementRequest(BaseModel):
    liaison_name: str | None = Field(default=None, alias="liaisonName")
    liaison_phone: str | None = Field(default=None, alias="liaisonPhone")
    liaison_title: str | None = Field(default=None, alias="liaisonTitle")

    model_config = {"populate_by_name": True}


class EvidenceSubmissionCreateRequest(BaseModel):
    requirement_id: str = Field(alias="requirementId", min_length=1)
    file_ids: list[str] = Field(alias="fileIds", min_length=1)

    model_config = {"populate_by_name": True}


class EvidenceSubmissionReviewRequest(BaseModel):
    decision: str = Field(min_length=1)
    feedback: str | None = None
    comment: str | None = None
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = {"populate_by_name": True}


class WorkingPaperCreateRequest(BaseModel):
    paper_code: str = Field(alias="paperCode", min_length=1)
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    branch_id: str | None = Field(default=None, alias="branchId")
    target_org_id: str | None = Field(default=None, alias="targetOrgId")
    guidelines: list[str] = Field(default_factory=list)
    procedure: str = Field(min_length=1)
    execution_record: str = Field(alias="executionRecord", min_length=1)
    result: str = "DRAFT"
    file_ids: list[str] = Field(default_factory=list, alias="fileIds")
    evidence_list: list[str] = Field(default_factory=list, alias="evidenceList")
    related_issue_id: str | None = Field(default=None, alias="relatedIssueId")
    converted_issue_id: str | None = Field(default=None, alias="convertedIssueId")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class WorkingPaperResultUpdateRequest(BaseModel):
    result: str | None = None
    execution_record: str | None = Field(default=None, alias="executionRecord")
    file_ids: list[str] | None = Field(default=None, alias="fileIds")
    evidence_list: list[str] | None = Field(default=None, alias="evidenceList")
    related_issue_id: str | None = Field(default=None, alias="relatedIssueId")
    converted_issue_id: str | None = Field(default=None, alias="convertedIssueId")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class IssueCreateRequest(BaseModel):
    inspection_plan_id: str = Field(alias="inspectionPlanId", min_length=1)
    branch_id: str = Field(alias="branchId", min_length=1)
    title: str = Field(min_length=1)
    risk_level: str = Field(alias="riskLevel", min_length=1)
    description: str = Field(min_length=1)
    basis_rule: str = Field(default="", alias="basisRule")
    source_working_paper_id: str | None = Field(
        default=None,
        alias="sourceWorkingPaperId",
    )
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class EkpReminderCreateRequest(BaseModel):
    target_type: str = Field(alias="targetType", min_length=1)
    target_id: str = Field(alias="targetId", min_length=1)
    message: str = Field(min_length=1)
    channel: str = "EKP"

    model_config = {"populate_by_name": True}


class FactConfirmationRequest(BaseModel):
    decision: str = "NO_OBJECTION"
    comment: str | None = None


class AppealSubmitRequest(BaseModel):
    reason: str = ""
    file_ids: list[str] = Field(default_factory=list, alias="fileIds")

    model_config = {"populate_by_name": True}


class AdjudicationDecisionRequest(BaseModel):
    decision: str = Field(min_length=1)
    decision_reason: str = Field(default="", alias="decisionReason")

    model_config = {"populate_by_name": True}


class InspectionReportGenerateDraftRequest(BaseModel):
    format: str = "DOCX"
    remarks: str | None = None
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)

    model_config = {"populate_by_name": True}


class InspectionReportBindFinalRequest(BaseModel):
    file_asset_id: str = Field(alias="fileAssetId", min_length=1)
    supporting_file_asset_ids: list[str] = Field(
        default_factory=list,
        alias="supportingFileAssetIds",
    )
    label: str | None = None
    remarks: str | None = None
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)

    model_config = {"populate_by_name": True}


class InspectionReportReleaseRequest(BaseModel):
    comment: str | None = None
    optimistic_version: int | None = Field(default=None, alias="optimisticVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# WP-P0-BE-06  Issue Hub & Rectification Loop
# ---------------------------------------------------------------------------


class IssueSupervisionEventCreateRequest(BaseModel):
    message: str = Field(min_length=1)
    channel: str = "EKP"


class IssueProjectOverdueReminderRequest(BaseModel):
    target_org_ids: list[str] = Field(default_factory=list, alias="targetOrgIds")
    reason: str | None = None
    request_id: str | None = Field(default=None, alias="requestId")
    delivery_mode: str = Field(default="IN_APP_NOTIFICATION", alias="deliveryMode")

    model_config = {"populate_by_name": True}


class RectificationFeedbackSubmitRequest(BaseModel):
    content: str = ""
    file_ids: list[str] = Field(default_factory=list, alias="fileIds")

    model_config = {"populate_by_name": True}


class RectificationVerificationRequest(BaseModel):
    decision: str = Field(min_length=1)
    reject_reason: str | None = Field(default=None, alias="rejectReason")

    model_config = {"populate_by_name": True}
