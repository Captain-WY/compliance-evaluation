"""Basic HTTP regression against the real local Docker environment.

Run normally to create prefixed test data; run --verify-existing after restart.
Credentials/tokens are never included in the report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/smoke-state.json"


def unwrap(value):
    return value.get("data", value) if isinstance(value, dict) else value


def rows(value):
    value = unwrap(value)
    if isinstance(value, list):
        return value
    for key in ("items", "records", "list", "categories", "indicators"):
        if isinstance(value, dict) and isinstance(value.get(key), list):
            return value[key]
    raise AssertionError("Expected list response")


class Smoke:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.results = []
        self.tokens = {}

    def request(self, method, path, body=None, role="platform_admin", expected=(200, 201), raw=False, content_type=None):
        headers = {}
        if role in self.tokens:
            headers["Authorization"] = "Bearer " + self.tokens[role]
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=45) as response:
                status, data = response.status, response.read()
        except HTTPError as error:
            status, data = error.code, error.read()
        if status not in expected:
            raise AssertionError(f"{method} {path}: HTTP {status}, expected {expected}")
        if raw:
            return data
        result = json.loads(data) if data else None
        if status < 400 and isinstance(result, dict) and result.get("code", 0) not in (0, 200, "0", "200", None):
            raise AssertionError(f"{method} {path}: business error code {result['code']}")
        return result

    def check(self, label, callback):
        try:
            callback()
            self.results.append({"check": label, "status": "PASS"})
            print("PASS " + label)
        except Exception as error:
            # Exception messages in this script describe routes/status, never payloads.
            self.results.append({"check": label, "status": "FAIL", "error": str(error)})
            print("FAIL " + label + ": " + str(error))

    def login(self):
        accounts = json.loads((ROOT / ".local/dev-accounts.json").read_text(encoding="utf-8-sig"))
        for account in accounts:
            result = unwrap(self.request("POST", "/api/platform/auth/login", {
                "username": account["username"], "password": account["password"]
            }, role=None))
            self.tokens[account["role"]] = result["access_token"]
            self.request("GET", "/api/platform/auth/me", role=account["role"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    parser.add_argument("--verify-existing", action="store_true")
    args = parser.parse_args()
    env = dict(line.split("=", 1) for line in (ROOT / "deploy/local/.env").read_text(encoding="utf-8-sig").splitlines() if "=" in line and not line.startswith("#"))
    smoke = Smoke(args.base_url or "http://127.0.0.1:" + env.get("FRONTEND_PORT", "3010"))
    smoke.check("service health and dependencies", lambda: smoke.request("GET", "/api/ready", role=None))
    smoke.check("anonymous rejected", lambda: smoke.request("GET", "/api/platform/auth/me", role=None, expected=(401,)))
    smoke.check("five real Casdoor logins and shared identities", smoke.login)
    if "platform_admin" not in smoke.tokens:
        return 1
    state = json.loads(STATE.read_text(encoding="utf-8")) if args.verify_existing else {"prefix": "MERGE-SMOKE-" + uuid.uuid4().hex[:10]}

    def business_data():
        if not args.verify_existing:
            state["draft"] = unwrap(smoke.request("POST", "/api/bff/v1/cases/drafts/save", {"draft_data": {"case_name": state["prefix"]}}))["draft_id"]
            STATE.write_text(json.dumps(state), encoding="utf-8")
        assert any(r["draft_id"] == state["draft"] for r in rows(smoke.request("POST", "/api/bff/v1/cases/drafts/list", {"pagination": {"page": 1, "size": 100}}))), "Case draft missing"
    smoke.check("case draft saved and read back", business_data)

    def inspection():
        if not args.verify_existing:
            me = unwrap(smoke.request("GET", "/api/platform/auth/me"))
            uid = me.get("id") or me["userId"]
            smoke.request("POST", "/api/inspection/plans", {
                "title": state["prefix"], "inspectCode": state["prefix"], "type": "SPECIAL_INSPECTION", "frequency": "AD_HOC",
                "targetOrgIds": ["WLZQ-RBC-GZ-NANSHA"], "leaderUserId": uid, "teamMemberUserIds": [uid],
                "plannedStartDate": date.today().isoformat(), "plannedEndDate": (date.today() + timedelta(days=28)).isoformat()
            })
        assert state["prefix"] in json.dumps(smoke.request("GET", "/api/inspection/plans")), "Inspection plan missing"
    smoke.check("inspection plan saved and read back", inspection)

    def assessment():
        if not args.verify_existing:
            # Existing source category, initialized by the merged seed.
            smoke.request("POST", "/api/assessment/indicators", {"indicatorName": state["prefix"], "categoryId": "AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE"})
        assert state["prefix"] in json.dumps(smoke.request("GET", "/api/assessment/indicators")), "Assessment indicator missing"
    smoke.check("assessment indicator saved and read back", assessment)

    def dictionary():
        payload = {"namespace": "shared", "dict_type": "MERGE_TEST", "dict_code": state["prefix"], "dict_label": state["prefix"]}
        if not args.verify_existing:
            state["dictionary"] = unwrap(smoke.request("POST", "/api/platform/dictionaries", payload))["id"]
            payload["dict_label"] += "-updated"
            smoke.request("PATCH", "/api/platform/dictionaries/" + state["dictionary"], payload)
        result = rows(smoke.request("GET", "/api/platform/dictionaries?namespace=shared&dict_type=MERGE_TEST"))
        assert any(r["id"] == state["dictionary"] and r["dictLabel"].endswith("-updated") for r in result), "Dictionary update missing"
        for path in ("/api/v1/dicts?type=MERGE_TEST", "/api/system/dictionary-admin/items?dictType=MERGE_TEST"):
            assert state["prefix"] + "-updated" in json.dumps(smoke.request("GET", path)), "Shared dictionary missing in business reader"
        STATE.write_text(json.dumps(state), encoding="utf-8")
    smoke.check("common dictionary create update and both business readers", dictionary)

    def file_roundtrip():
        content = (state["prefix"] + " attachment roundtrip").encode()
        if not args.verify_existing:
            boundary = "smoke" + uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode())
            state["file"] = unwrap(smoke.request("POST", "/api/platform/files", body, content_type="multipart/form-data; boundary=" + boundary))["id"]
            STATE.write_text(json.dumps(state), encoding="utf-8")
        result = smoke.request("GET", "/api/platform/files/" + state["file"], raw=True)
        assert hashlib.sha256(result).digest() == hashlib.sha256(content).digest(), "File checksum mismatch"
    smoke.check("file upload download checksum", file_roundtrip)
    smoke.check("lawyer cannot open system management", lambda: smoke.request("POST", "/api/bff/v1/admin/dicts/types/list", {}, role="external_lawyer", expected=(403,)))
    smoke.check("branch cannot list HQ inspection plans", lambda: smoke.request("GET", "/api/inspection/plans", role="branch_business", expected=(403,)))
    smoke.check("lawyer cannot administer dictionary", lambda: smoke.request("POST", "/api/platform/dictionaries", {"dict_type": "DENIED", "dict_code": "DENIED", "dict_label": "DENIED"}, role="external_lawyer", expected=(403,)))
    if state.get("file"):
        smoke.check("other branch cannot download private file", lambda: smoke.request("GET", "/api/platform/files/" + state["file"], role="branch_business", expected=(403, 404)))
    def logout():
        smoke.request("POST", "/api/platform/auth/logout", {})
        smoke.request("GET", "/api/platform/auth/me", expected=(401,))
    smoke.check("logout revokes session", logout)
    STATE.write_text(json.dumps(state), encoding="utf-8")
    report = ROOT / (".local/smoke-restart-results.json" if args.verify_existing else ".local/smoke-results.json")
    report.write_text(json.dumps(smoke.results, indent=2, ensure_ascii=False), encoding="utf-8")
    return int(any(r["status"] == "FAIL" for r in smoke.results))


if __name__ == "__main__":
    sys.exit(main())
