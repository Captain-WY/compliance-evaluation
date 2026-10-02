from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class RoleAssignmentCreateRequest(BaseModel):
    role_id: str = Field(alias="roleId")
    personnel_id: str = Field(alias="personnelId")
    org_id: str = Field(alias="orgId")

    model_config = {"populate_by_name": True}
