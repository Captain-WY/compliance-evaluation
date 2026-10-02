import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def resolve_workspace_root() -> Path:
    return Path(__file__).resolve().parents[3] / "resources" / "compliance"


WORKSPACE_ROOT = resolve_workspace_root()
CONTRACT_ROOT = WORKSPACE_ROOT / "docs" / "ai-first" / "contracts"


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping YAML in {path}")
    return data


@lru_cache
def load_p0_contracts() -> dict[str, dict[str, Any]]:
    return {
        "api": _load_yaml(CONTRACT_ROOT / "p0-api-contract.yaml"),
        "entity": _load_yaml(CONTRACT_ROOT / "p0-entity-model.yaml"),
        "test": _load_yaml(CONTRACT_ROOT / "p0-test-acceptance.yaml"),
    }


@lru_cache
def load_p1_contracts() -> dict[str, dict[str, Any]]:
    return {
        "api": _load_yaml(CONTRACT_ROOT / "p1-api-contract.yaml"),
        "entity": _load_yaml(CONTRACT_ROOT / "p1-entity-model.yaml"),
        "permission": _load_yaml(CONTRACT_ROOT / "p1-permission-contract.yaml"),
        "test": _load_yaml(CONTRACT_ROOT / "p1-test-acceptance.yaml"),
    }


def load_p0_contract_summary() -> dict[str, Any]:
    contracts = load_p0_contracts()
    api_contract = contracts["api"]
    entity_contract = contracts["entity"]
    test_contract = contracts["test"]
    apis = api_contract.get("apis", [])
    entities = entity_contract.get("entities", [])
    scenarios = test_contract.get("acceptance_scenarios", [])
    return {
        "contractId": api_contract.get("contract_id"),
        "status": api_contract.get("status"),
        "frozen": api_contract.get("frozen"),
        "frozenAt": api_contract.get("frozen_at"),
        "apiPrefix": api_contract.get("global_conventions", {}).get("api_prefix"),
        "counts": {
            "apis": len(apis),
            "entities": len(entities),
            "acceptanceScenarios": len(scenarios),
        },
        "apiIds": [item["id"] for item in apis],
        "entityIds": [item["id"] for item in entities],
        "acceptanceScenarioIds": [item["id"] for item in scenarios],
    }


def load_p1_contract_summary() -> dict[str, Any]:
    contracts = load_p1_contracts()
    api_contract = contracts["api"]
    entity_contract = contracts["entity"]
    permission_contract = contracts["permission"]
    test_contract = contracts["test"]
    endpoints = api_contract.get("endpoints", [])
    entity_groups = entity_contract.get("entity_groups", {})
    entity_ids = [
        entity
        for group in entity_groups.values()
        for entity in group.get("entities", [])
    ]
    permissions = permission_contract.get("candidate_permissions", [])
    deferred_permissions = permission_contract.get("deferred_permissions", [])
    scenarios = test_contract.get("acceptance_scenarios", [])
    return {
        "contractId": api_contract.get("artifact_id"),
        "status": api_contract.get("status"),
        "frozenBy": api_contract.get("frozen_by"),
        "frozenAt": api_contract.get("frozen_at"),
        "apiPrefix": api_contract.get("api_policy", {}).get("base_prefix"),
        "counts": {
            "apis": len(endpoints),
            "entities": len(entity_ids),
            "permissions": len(permissions),
            "deferredPermissions": len(deferred_permissions),
            "acceptanceScenarios": len(scenarios),
        },
        "apiIds": [item["id"] for item in endpoints],
        "entityIds": entity_ids,
        "permissionIds": [item["id"] for item in permissions],
        "deferredPermissionIds": [item["id"] for item in deferred_permissions],
        "acceptanceScenarioIds": [item["id"] for item in scenarios],
    }
