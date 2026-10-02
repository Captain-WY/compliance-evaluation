from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.modules.compliance.contracts.loader import WORKSPACE_ROOT
from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError, UnauthorizedError
from app.modules.compliance.domain.seed_time import relative_datetime_iso
from app.modules.compliance.providers.auth import ExternalIdentity

SEED_PATH = WORKSPACE_ROOT / "docs" / "ai-first" / "specs" / "seed-scenarios.yaml"
PERMISSION_PATH = WORKSPACE_ROOT / "docs" / "ai-first" / "contracts" / "p0-permission-contract.yaml"
P1_PERMISSION_PATH = (
    WORKSPACE_ROOT / "docs" / "ai-first" / "contracts" / "p1-permission-contract.yaml"
)
P2_PERMISSION_PATH = (
    WORKSPACE_ROOT / "docs" / "ai-first" / "specs" / "p2-permission-test-candidate.yaml"
)
DEMO_PASSWORD = None
LOCAL_TOKEN_ISSUER = "compliance-backend-local"
LOCAL_TOKEN_AUDIENCE = "compliance-p0-runtime"
LOCAL_TOKEN_TTL_SECONDS = 3600
LOCAL_TOKEN_SECRET = b""
TOKEN_PREFIX = "p0-local-jwt::"


@dataclass
class AuthUserRecord:
    user_id: str
    username: str
    display_name: str
    org_id: str
    role_ids: list[str]
    external_subject_id: str | None = None
    active: bool = True
    title: str = ""
    sync_source: str = "seed"
    last_synced_at: str | None = None


@dataclass
class OrgRecord:
    org_id: str
    org_name: str
    org_level: str
    parent_org_id: str | None
    region: str | None = None
    city: str | None = None
    business_line_ids: list[str] = field(default_factory=list)
    data_origin: str = "seed"
    active: bool = True
    sync_source: str = "seed"
    last_synced_at: str | None = None
    parent_assignment_basis: str | None = None
    parent_confidence: str = "unknown"
    business_line_source: str = "explicit"


@dataclass
class PersonnelRecord:
    personnel_id: str
    user_id: str
    display_name: str
    org_id: str
    title: str
    phone: str | None = None
    email: str | None = None
    active: bool = True
    sync_source: str = "seed"
    last_synced_at: str | None = None


@dataclass
class RoleRecord:
    role_id: str
    role_code: str
    role_name: str
    role_level: str
    description: str = ""


@dataclass
class RoleAssignmentRecord:
    assignment_id: str
    role_id: str
    personnel_id: str
    org_id: str
    assigned_by: str
    assigned_at: str
    active: bool = True


class SeedAuthStore:
    def __init__(self) -> None:
        self._seed = self._load_yaml(SEED_PATH)
        self._permission = self._load_permission_contract()
        self.reset()

    def reset(self) -> None:
        self.orgs = self._build_orgs()
        self.roles = self._build_roles()
        self.users = self._build_users()
        self.personnel = self._build_personnel()
        self.role_assignments = self._build_role_assignments()

    def login(self, username: str, password: str) -> dict[str, Any]:
        raise UnauthorizedError("Use platform Casdoor authentication")

    def login_with_external_identity(
        self,
        identity: ExternalIdentity,
        *,
        strict_local_user: bool = True,
    ) -> dict[str, Any]:
        raise UnauthorizedError("Use platform Casdoor authentication")

    def find_user_by_external_subject(self, subject_id: str) -> AuthUserRecord | None:
        return next(
            (
                item
                for item in self.users.values()
                if item.external_subject_id == subject_id
            ),
            None,
        )

    def find_user_by_username(self, username: str) -> AuthUserRecord | None:
        return next((item for item in self.users.values() if item.username == username), None)

    def upsert_shadow_identity(self, user: AuthUserRecord, identity: ExternalIdentity) -> None:
        username_holder = self.find_user_by_username(identity.username)
        if username_holder is not None and username_holder.user_id != user.user_id:
            raise AppError(
                code="LOCAL_USER_NOT_PROVISIONED",
                message="Casdoor username conflicts with another local projection",
                status_code=403,
            )

        now = relative_datetime_iso()
        user.external_subject_id = identity.subject_id
        if identity.username:
            user.username = identity.username
        if identity.display_name:
            user.display_name = identity.display_name
        user.sync_source = "casdoor_login"
        user.last_synced_at = now

        personnel = self.personnel.get(self.personnel_id_for_user(user.user_id))
        if personnel is not None:
            if identity.display_name:
                personnel.display_name = identity.display_name
            if identity.email:
                personnel.email = identity.email
            if identity.phone:
                personnel.phone = identity.phone
            personnel.sync_source = "casdoor_login"
            personnel.last_synced_at = now

    def user_from_token(self, token: str) -> AuthUserRecord:
        raise UnauthorizedError("Use platform Casdoor authentication")

    def issue_token(
        self,
        user: AuthUserRecord,
        *,
        auth_provider: str = "local",
        external_subject_id: str | None = None,
    ) -> str:
        raise UnauthorizedError("Use platform Casdoor authentication")

    def token_claims(self, token: str) -> dict[str, Any]:
        raise UnauthorizedError("Use platform Casdoor authentication")

    def auth_user_view(self, user: AuthUserRecord) -> dict[str, Any]:
        org = self.orgs.get(user.org_id)
        role_names = [
            self.roles[role_id].role_name
            for role_id in user.role_ids
            if role_id in self.roles
        ]
        menu_mode = self.menu_mode_for_roles(user.role_ids)
        permitted_menu_ids = self.permitted_menu_ids(user.role_ids)
        permission_ids = self.permission_ids_for_roles(user.role_ids)
        organization_name = org.org_name if org else ""
        return {
            "userId": user.user_id,
            "id": user.user_id,
            "username": user.username,
            "displayName": user.display_name,
            "title": user.title or (role_names[0] if role_names else "用户"),
            "department": organization_name,
            "organizationName": organization_name,
            "orgId": user.org_id,
            "level": self.principal_level(user),
            "menuMode": menu_mode,
            "permittedMenuIds": permitted_menu_ids,
            "roleIds": user.role_ids,
            "roles": role_names,
            "permissionIds": permission_ids,
            "dataScope": self.primary_data_scope_for_roles(user.role_ids),
            "dataScopes": self.data_scopes_for_roles(user.role_ids),
            "orgScopeIds": self.org_scope_ids(user.org_id),
            "personas": self.personas_for_user(user),
            "availableTaskViews": self.available_task_views(user.role_ids),
            "defaultMenuId": permitted_menu_ids[0] if permitted_menu_ids else "branch-tasks",
            "taskView": "hq" if menu_mode == "full-hq" else "branch",
            "avatarLabel": user.display_name[:2],
        }

    def org_tree(self) -> list[dict[str, Any]]:
        children_by_parent: dict[str | None, list[OrgRecord]] = {}
        for org in self.orgs.values():
            parent = org.parent_org_id if org.parent_org_id in self.orgs else None
            children_by_parent.setdefault(parent, []).append(org)

        def node(record: OrgRecord) -> dict[str, Any]:
            return {
                **self.org_view(record),
                "children": [
                    node(child)
                    for child in sorted(
                        children_by_parent.get(record.org_id, []),
                        key=lambda item: item.org_name,
                    )
                ],
            }

        return [
            node(item)
            for item in sorted(children_by_parent.get(None, []), key=lambda item: item.org_name)
        ]

    def personnel_page(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort: str = "displayName",
    ) -> dict[str, Any]:
        items = [self.personnel_view(record) for record in self.personnel.values()]
        reverse = sort.startswith("-")
        sort_key = sort.removeprefix("-")
        sort_map = {
            "displayName": lambda item: item["displayName"],
            "orgName": lambda item: item["orgName"],
            "title": lambda item: item["title"] or "",
        }
        items.sort(key=sort_map.get(sort_key, sort_map["displayName"]), reverse=reverse)
        start = (page - 1) * page_size
        end = start + page_size
        return {"items": items[start:end], "page": page, "pageSize": page_size, "total": len(items)}

    def role_list(self) -> list[dict[str, Any]]:
        return [
            {
                "roleId": role.role_id,
                "roleCode": role.role_code,
                "roleName": role.role_name,
                "roleLevel": role.role_level,
                "description": role.description,
            }
            for role in self.roles.values()
        ]

    def role_assignment_list(self) -> list[dict[str, Any]]:
        return [self.role_assignment_view(record) for record in self.role_assignments.values()]

    def create_role_assignment(
        self,
        *,
        role_id: str,
        personnel_id: str,
        org_id: str,
        assigned_by: str,
    ) -> dict[str, Any]:
        if role_id not in self.roles:
            raise NotFoundError("Role not found")
        personnel = self.personnel.get(personnel_id)
        if not personnel:
            raise NotFoundError("Personnel not found")
        if not personnel.active:
            raise AppError(code="INACTIVE_PERSONNEL", message="人员已停用", status_code=409)
        if org_id not in self.orgs:
            raise NotFoundError("Organization not found")
        duplicate = next(
            (
                item
                for item in self.role_assignments.values()
                if item.role_id == role_id
                and item.personnel_id == personnel_id
                and item.org_id == org_id
                and item.active
            ),
            None,
        )
        if duplicate:
            raise AppError(code="DUPLICATE_ASSIGNMENT", message="角色分配已存在", status_code=409)
        assignment_id = f"RA-SEED-{len(self.role_assignments) + 1:04d}"
        assignment = RoleAssignmentRecord(
            assignment_id=assignment_id,
            role_id=role_id,
            personnel_id=personnel_id,
            org_id=org_id,
            assigned_by=assigned_by,
            assigned_at=relative_datetime_iso(),
        )
        self.role_assignments[assignment_id] = assignment
        return self.role_assignment_view(assignment)

    def delete_role_assignment(self, assignment_id: str) -> dict[str, Any]:
        assignment = self.role_assignments.get(assignment_id)
        if not assignment or not assignment.active:
            raise NotFoundError("Role assignment not found")
        assignment.active = False
        return {"assignmentId": assignment.assignment_id, "deleted": True}

    def has_permission(self, user: AuthUserRecord, permission_id: str) -> bool:
        permission = next(
            (
                item
                for item in self._permission.get("permissions", [])
                if item.get("id") == permission_id
            ),
            None,
        )
        if not permission:
            return False
        allowed_roles = set(permission.get("roles", []))
        if "any_authenticated_user" in allowed_roles:
            return True
        if "ROLE_SYSTEM_ADMIN" in user.role_ids:
            return True
        return bool(allowed_roles.intersection(user.role_ids))

    def permission_ids_for_roles(self, role_ids: list[str]) -> list[str]:
        role_set = set(role_ids)
        if "ROLE_SYSTEM_ADMIN" in role_set:
            return list(
                dict.fromkeys(
                    item["id"]
                    for item in self._permission.get("permissions", [])
                    if isinstance(item, dict) and item.get("id")
                )
            )
        permission_ids = [
            item["id"]
            for item in self._permission.get("permissions", [])
            if set(item.get("roles", [])).intersection(role_set)
            or "any_authenticated_user" in set(item.get("roles", []))
        ]
        return list(dict.fromkeys(permission_ids))

    def data_scopes_for_roles(self, role_ids: list[str]) -> list[str]:
        role_set = set(role_ids)
        if "ROLE_SYSTEM_ADMIN" in role_set:
            return ["all"]
        scopes = [
            item.get("data_scope", "own")
            for item in self._permission.get("permissions", [])
            if set(item.get("roles", [])).intersection(role_set)
            or "any_authenticated_user" in set(item.get("roles", []))
        ]
        return list(dict.fromkeys(scopes))

    def primary_data_scope_for_roles(self, role_ids: list[str]) -> str:
        scopes = self.data_scopes_for_roles(role_ids)
        for scope in ("all", "project", "organization", "own"):
            if scope in scopes:
                return scope
        return scopes[0] if scopes else "own"

    def require_permission(self, user: AuthUserRecord, permission_id: str) -> None:
        if not self.has_permission(user, permission_id):
            raise ForbiddenError("无权执行此操作")

    def org_scope_ids(self, org_id: str) -> list[str]:
        scoped = [org_id]
        frontier = [org_id]
        while frontier:
            parent_id = frontier.pop(0)
            child_ids = [
                org.org_id
                for org in self.orgs.values()
                if org.parent_org_id == parent_id and org.org_id not in scoped
            ]
            scoped.extend(child_ids)
            frontier.extend(child_ids)
        return scoped

    def org_in_scope(self, user: AuthUserRecord, org_id: str) -> bool:
        return org_id in self.org_scope_ids(user.org_id)

    def personnel_id_for_user(self, user_id: str) -> str:
        return f"PERS-{user_id.removeprefix('USER-')}"

    def org_snapshot(self, org_id: str) -> dict[str, Any]:
        org = self.orgs.get(org_id)
        if not org:
            return {
                "orgId": org_id,
                "orgName": org_id,
                "orgLevel": "",
                "active": False,
            }
        return {
            "orgId": org.org_id,
            "orgName": org.org_name,
            "orgLevel": org.org_level,
            "active": org.active,
            "parentOrgId": org.parent_org_id,
            "businessLineIds": list(org.business_line_ids),
        }

    def user_snapshot(self, user_id: str) -> dict[str, Any]:
        user = self.users.get(user_id)
        if not user:
            return {
                "userId": user_id,
                "displayName": user_id,
                "title": "",
                "orgId": "",
                "orgName": "",
                "active": False,
            }
        org = self.orgs.get(user.org_id)
        return {
            "userId": user.user_id,
            "displayName": user.display_name,
            "title": user.title,
            "orgId": user.org_id,
            "orgName": org.org_name if org else "",
            "active": user.active,
        }

    def personas_for_user(self, user: AuthUserRecord) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        personnel_id = self.personnel_id_for_user(user.user_id)
        for assignment in self.role_assignments.values():
            if not assignment.active or assignment.personnel_id != personnel_id:
                continue
            role = self.roles.get(assignment.role_id)
            org = self.orgs.get(assignment.org_id)
            if not role or not org:
                continue
            records.append(
                {
                    "roleId": assignment.role_id,
                    "roleName": role.role_name,
                    "orgId": assignment.org_id,
                    "orgName": org.org_name,
                    "level": self.level_for_role_in_org(assignment.role_id, assignment.org_id),
                    "dataScope": self.primary_data_scope_for_roles([assignment.role_id]),
                    "orgScopeIds": self.org_scope_ids(assignment.org_id),
                }
            )
        return records

    def org_view(self, org: OrgRecord) -> dict[str, Any]:
        business_line_parent_org_ids = [
            record.org_id
            for record in self.orgs.values()
            if record.org_level == "BUSINESS_LINE_HQ"
            and set(record.business_line_ids).intersection(org.business_line_ids)
        ]
        return {
            "orgId": org.org_id,
            "orgName": org.org_name,
            "orgLevel": org.org_level,
            "frontendOrgType": self.frontend_org_type(org.org_level),
            "parentOrgId": org.parent_org_id,
            "administrativeParentOrgId": org.parent_org_id,
            "businessLineParentOrgIds": business_line_parent_org_ids,
            "region": org.region,
            "city": org.city,
            "businessLineIds": org.business_line_ids,
            "businessLineSource": org.business_line_source,
            "dataOrigin": org.data_origin,
            "active": org.active,
            "syncSource": org.sync_source,
            "lastSyncedAt": org.last_synced_at,
            "parentAssignmentBasis": org.parent_assignment_basis,
            "parentConfidence": org.parent_confidence,
        }

    def personnel_view(self, record: PersonnelRecord) -> dict[str, Any]:
        user = self.users.get(record.user_id)
        return {
            "personnelId": record.personnel_id,
            "userId": record.user_id,
            "displayName": record.display_name,
            "orgId": record.org_id,
            "orgName": self.orgs[record.org_id].org_name if record.org_id in self.orgs else "",
            "title": record.title,
            "phone": record.phone,
            "email": record.email,
            "active": record.active,
            "roleIds": user.role_ids if user else [],
            "syncSource": record.sync_source,
            "lastSyncedAt": record.last_synced_at,
        }

    def role_assignment_view(self, record: RoleAssignmentRecord) -> dict[str, Any]:
        role = self.roles.get(record.role_id)
        personnel = self.personnel.get(record.personnel_id)
        org = self.orgs.get(record.org_id)
        return {
            "assignmentId": record.assignment_id,
            "roleId": record.role_id,
            "roleName": role.role_name if role else "",
            "personnelId": record.personnel_id,
            "personnelName": personnel.display_name if personnel else "",
            "orgId": record.org_id,
            "orgName": org.org_name if org else "",
            "assignedBy": record.assigned_by,
            "assignedAt": record.assigned_at,
            "active": record.active,
        }

    def _build_orgs(self) -> dict[str, OrgRecord]:
        records: dict[str, OrgRecord] = {}

        def add_org(
            raw: dict[str, Any],
            default_level: str,
            default_parent: str | None = "WLZQ-GROUP",
        ) -> None:
            org_id = raw.get("org_id")
            if not org_id or org_id in records:
                return
            org_level = raw.get("org_level", default_level)
            business_line_ids, business_line_source = self._business_lines_for_org(raw, org_level)
            parent_assignment_basis = raw.get("parent_assignment_basis")
            records[org_id] = OrgRecord(
                org_id=org_id,
                org_name=raw.get("org_name", org_id),
                org_level=org_level,
                parent_org_id=raw.get("parent_org_id")
                or raw.get("parent_branch_company_org_id")
                or default_parent,
                region=raw.get("region"),
                city=raw.get("city"),
                business_line_ids=business_line_ids,
                data_origin=raw.get("data_origin", "seed"),
                active=raw.get("active", True),
                sync_source=raw.get("sync_source", raw.get("data_origin", "seed")),
                last_synced_at=raw.get("last_synced_at"),
                parent_assignment_basis=parent_assignment_basis,
                parent_confidence=raw.get(
                    "parent_confidence",
                    self._parent_confidence(parent_assignment_basis),
                ),
                business_line_source=raw.get("business_line_source", business_line_source),
            )

        for raw_org in self._seed.get("organizations", []):
            add_org(raw_org, raw_org.get("org_level", "HQ_DEPARTMENT"), None)
        for raw_org in self._seed.get("official_branch_companies_2024", []):
            add_org(raw_org, "REGIONAL_BRANCH_COMPANY")

        supplied = self._seed.get("user_supplied_branch_network", {})
        for raw_org in supplied.get("branch_companies", []):
            add_org(raw_org, "REGIONAL_BRANCH_COMPANY")
        for raw_org in supplied.get("branch_offices", []):
            add_org(raw_org, "BRANCH_OFFICE")
        return records

    def _build_roles(self) -> dict[str, RoleRecord]:
        seed_roles = {
            item["role_id"]: item
            for item in self._seed.get("dictionaries", {}).get("roles", [])
            if "role_id" in item
        }
        records: dict[str, RoleRecord] = {}
        for item in self._permission.get("roles", []):
            role_id = item["id"]
            seed_role = seed_roles.get(role_id, {})
            records[role_id] = RoleRecord(
                role_id=role_id,
                role_code=role_id,
                role_name=seed_role.get("label", role_id),
                role_level=seed_role.get("role_level", item.get("maps_to_levels", [""])[0]),
                description=item.get("reason", ""),
            )
        return records

    def _build_users(self) -> dict[str, AuthUserRecord]:
        account_by_user = {
            item["user_id"]: item
            for item in self._seed.get("accounts", [])
            if "user_id" in item and "username" in item
        }
        records: dict[str, AuthUserRecord] = {}
        for item in self._seed.get("users", []):
            account = account_by_user.get(item["user_id"], {})
            role_ids = list(item.get("role_ids", []))
            records[item["user_id"]] = AuthUserRecord(
                user_id=item["user_id"],
                external_subject_id=item.get("external_subject_id"),
                username=account.get("username", item["user_id"].lower()),
                display_name=item.get("display_name", item["user_id"]),
                org_id=item.get("org_id", "WLZQ-GROUP"),
                role_ids=role_ids,
                title=(
                    self.roles[role_ids[0]].role_name
                    if role_ids and role_ids[0] in self.roles
                    else ""
                ),
                sync_source=item.get("sync_source", "seed"),
                last_synced_at=item.get("last_synced_at"),
            )
        records["USER-DISABLED-001"] = AuthUserRecord(
            user_id="USER-DISABLED-001",
            external_subject_id=None,
            username="disabled.user",
            display_name="停用用户",
            org_id="WLZQ-GROUP",
            role_ids=["ROLE_SYSTEM_ADMIN"],
            active=False,
            title="停用用户",
        )
        return records

    def _build_personnel(self) -> dict[str, PersonnelRecord]:
        records: dict[str, PersonnelRecord] = {}
        for user in self.users.values():
            personnel_id = self.personnel_id_for_user(user.user_id)
            records[personnel_id] = PersonnelRecord(
                personnel_id=personnel_id,
                user_id=user.user_id,
                display_name=user.display_name,
                org_id=user.org_id,
                title=user.title,
                phone=None,
                email=user.username if "@" in user.username else None,
                active=user.active,
                sync_source=user.sync_source,
                last_synced_at=user.last_synced_at,
            )
        return records

    def _build_role_assignments(self) -> dict[str, RoleAssignmentRecord]:
        records: dict[str, RoleAssignmentRecord] = {}
        counter = 1
        for personnel in self.personnel.values():
            user = self.users[personnel.user_id]
            for role_id in user.role_ids:
                assignment_id = f"RA-SEED-{counter:04d}"
                counter += 1
                records[assignment_id] = RoleAssignmentRecord(
                    assignment_id=assignment_id,
                    role_id=role_id,
                    personnel_id=personnel.personnel_id,
                    org_id=personnel.org_id,
                    assigned_by="SYSTEM-SEED",
                    assigned_at=relative_datetime_iso(),
                )
        return records

    def menu_mode_for_roles(self, role_ids: list[str]) -> str:
        for mode, config in self._permission.get("menu_mapping", {}).items():
            if set(config.get("roles", [])).intersection(role_ids):
                return mode.replace("_", "-")
        return "branch-only"

    def available_task_views(self, role_ids: list[str]) -> list[str]:
        views: list[str] = []
        if any(
            role_id in role_ids
            for role_id in (
                "ROLE_SYSTEM_ADMIN",
                "ROLE_COMPLIANCE_DIRECTOR",
                "ROLE_COMPLIANCE_MANAGER",
                "ROLE_INSPECTION_LEAD",
                "ROLE_INSPECTOR",
            )
        ):
            views.append("hq")
        if any(role_id.startswith("ROLE_BRANCH") for role_id in role_ids):
            views.append("branch")
        return views or ["branch"]

    def permitted_menu_ids(self, role_ids: list[str]) -> list[str]:
        menu_ids: list[str] = []
        for config in self._permission.get("menu_mapping", {}).values():
            if set(config.get("roles", [])).intersection(role_ids):
                menu_ids.extend(config.get("permitted_menu_ids", []))
        unique_menu_ids = list(dict.fromkeys(menu_ids))
        if not self._roles_have_permission(role_ids, "PERM-SYSTEM-ADMIN"):
            unique_menu_ids = [
                menu_id
                for menu_id in unique_menu_ids
                if menu_id not in {"hq-org", "hq-dictionaries"}
            ]
        if not self._roles_have_permission(role_ids, "PERM-P2-ASSESSMENT-SCHEDULE-READ"):
            unique_menu_ids = [menu_id for menu_id in unique_menu_ids if menu_id != "hq-scheduler"]
        if not self._roles_have_permission(role_ids, "PERM-P2-ASSESSMENT-SIMULATION-READ"):
            unique_menu_ids = [
                menu_id for menu_id in unique_menu_ids if menu_id != "hq-scheme-simulation"
            ]
        if not self._roles_have_permission(role_ids, "PERM-P2-DATA-COCKPIT-READ"):
            unique_menu_ids = [
                menu_id for menu_id in unique_menu_ids if menu_id != "hq-data-cockpit"
            ]
        return unique_menu_ids

    def _roles_have_permission(self, role_ids: list[str], permission_id: str) -> bool:
        role_set = set(role_ids)
        permission = next(
            (
                item
                for item in self._permission.get("permissions", [])
                if item.get("id") == permission_id
            ),
            None,
        )
        if permission and "ROLE_SYSTEM_ADMIN" in role_set:
            return True
        return bool(permission and set(permission.get("roles", [])).intersection(role_set))

    def principal_level(self, user: AuthUserRecord) -> str:
        if "ROLE_COMPLIANCE_DIRECTOR" in user.role_ids:
            return "COMPLIANCE_DIRECTOR"
        hq_roles = {
            "ROLE_SYSTEM_ADMIN",
            "ROLE_COMPLIANCE_MANAGER",
            "ROLE_INSPECTION_LEAD",
            "ROLE_INSPECTOR",
        }
        if any(role_id in user.role_ids for role_id in hq_roles):
            return "COMPLIANCE_DEPARTMENT"
        if "ROLE_BUSINESS_LINE_MANAGER" in user.role_ids:
            return "LINE_HEADQUARTERS"
        if any(role_id.startswith("ROLE_BRANCH") for role_id in user.role_ids):
            branch_role_id = next(
                role_id for role_id in user.role_ids if role_id.startswith("ROLE_BRANCH")
            )
            return self.level_for_role_in_org(branch_role_id, user.org_id)
        return "COMPLIANCE_DEPARTMENT"

    def level_for_role_in_org(self, role_id: str, org_id: str) -> str:
        role = self.roles.get(role_id)
        org = self.orgs.get(org_id)
        if role and role.role_level != "BRANCH_OFFICE":
            return role.role_level
        if org and org.org_level == "REGIONAL_BRANCH_COMPANY":
            return "BRANCH_COMPANY"
        if org and org.org_level == "BRANCH_OFFICE":
            return "BRANCH_OFFICE"
        return role.role_level if role else "BRANCH_OFFICE"

    @staticmethod
    def _business_lines_for_org(raw: dict[str, Any], org_level: str) -> tuple[list[str], str]:
        explicit = list(raw.get("business_line_ids", []))
        if explicit:
            return explicit, raw.get("business_line_source", "explicit")
        if org_level in {"BRANCH_OFFICE", "REGIONAL_BRANCH_COMPANY"}:
            return ["BL-WEALTH"], "inferred_default_p0"
        return [], "none"

    @staticmethod
    def _parent_confidence(parent_assignment_basis: str | None) -> str:
        if not parent_assignment_basis:
            return "confirmed"
        if parent_assignment_basis.startswith("explicit"):
            return "high"
        if parent_assignment_basis.startswith("inferred_city"):
            return "medium"
        if parent_assignment_basis.startswith(
            "inferred"
        ) or parent_assignment_basis.startswith("fallback"):
            return "low"
        return "unknown"

    @staticmethod
    def frontend_org_type(org_level: str) -> str:
        mapping = {
            "GROUP": "root",
            "HQ_DEPARTMENT": "dept",
            "BUSINESS_LINE_HQ": "dept",
            "SUBSIDIARY": "dept",
            "REGIONAL_BRANCH_COMPANY": "branch",
            "BRANCH_COMPANY": "branch",
            "BRANCH_OFFICE": "sub-branch",
        }
        return mapping.get(org_level, "dept")

    @classmethod
    def _load_permission_contract(cls) -> dict[str, Any]:
        permission = cls._load_yaml(PERMISSION_PATH)
        p1_permission = cls._load_yaml(P1_PERMISSION_PATH)
        p2_permission = cls._load_yaml(P2_PERMISSION_PATH)

        active_p1_permissions = [
            item
            for item in p1_permission.get("candidate_permissions", [])
            if str(item.get("id", "")).startswith("PERM-P1-")
        ]
        active_p2_wave1_permissions = [
            item
            for item in p2_permission.get("candidate_permissions", [])
            if str(item.get("id", "")).startswith(
                (
                    "PERM-P2-NOTIFICATION-",
                    "PERM-P2-ISSUE-",
                    "PERM-P2-WORKFLOW-",
                    "PERM-P2-UNIFIED-REVIEW-",
                    "PERM-P2-ASSESSMENT-SCHEDULE-",
                    "PERM-P2-ASSESSMENT-SIMULATION-",
                    "PERM-P2-DATA-COCKPIT-",
                ),
            )
        ]
        existing_permission_ids = {
            item.get("id")
            for item in permission.get("permissions", [])
            if isinstance(item, dict)
        }
        permission.setdefault("permissions", []).extend(
            item
            for item in [*active_p1_permissions, *active_p2_wave1_permissions]
            if item.get("id") not in existing_permission_ids
        )
        permission["deferred_permissions"] = p1_permission.get("deferred_permissions", [])
        permission["p1_personas"] = p1_permission.get("personas", [])

        menu_mapping = permission.setdefault("menu_mapping", {})
        menu_mapping.setdefault(
            "p1_hq_assessment",
            {"roles": [], "permitted_menu_ids": []},
        )
        menu_mapping["p1_hq_assessment"]["roles"] = [
            "ROLE_COMPLIANCE_MANAGER",
            "ROLE_COMPLIANCE_DIRECTOR",
            "ROLE_INSPECTION_LEAD",
        ]
        menu_mapping["p1_hq_assessment"]["permitted_menu_ids"] = [
            "hq-indicators",
            "hq-rules",
            "hq-workflow-center",
            "hq-workflow-designer",
            "hq-unified-workbench",
            "hq-scheduler",
            "hq-scheme-simulation",
            "hq-data-cockpit",
            "hq-review",
            "hq-assessment-dashboard",
            "hq-branch-profile",
        ]
        menu_mapping.setdefault(
            "p1_branch_assessment",
            {"roles": [], "permitted_menu_ids": []},
        )
        menu_mapping["p1_branch_assessment"]["roles"] = [
            "ROLE_BRANCH_COMPLIANCE_OFFICER",
            "ROLE_BRANCH_MANAGER",
        ]
        menu_mapping["p1_branch_assessment"]["permitted_menu_ids"] = [
            "branch-reporting",
            "branch-daily-ledger",
            "branch-self-assessment",
            "branch-dashboard",
        ]
        return permission

    @staticmethod
    def _load_yaml(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
        return deepcopy(data if isinstance(data, dict) else {})

    @staticmethod
    def _b64encode(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    @staticmethod
    def _b64decode(raw: str) -> bytes:
        padding = "=" * (-len(raw) % 4)
        return base64.urlsafe_b64decode(raw + padding)

    @staticmethod
    def _sign(payload: str) -> str:
        digest = hmac.new(LOCAL_TOKEN_SECRET, payload.encode("ascii"), hashlib.sha256).digest()
        return SeedAuthStore._b64encode(digest)


auth_store = SeedAuthStore()
