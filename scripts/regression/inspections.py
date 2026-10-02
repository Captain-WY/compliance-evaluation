"""Real HTTP inspection regression; creates only uniquely prefixed business data.

Run: python scripts/regression/inspections.py
Evidence excludes login payloads, access tokens and signed download URLs.
"""
from __future__ import annotations

import json
import argparse
import sys
import uuid
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:8010"
HQ, BR, ADM = "hq_business", "branch_business", "platform_admin"
OTHER = ("department_business", "external_lawyer")


class Regression:
    def __init__(self):
        self.prefix = "REG-20261003-INSP-" + uuid.uuid4().hex[:6]
        self.tokens, self.me, self.results, self.requests, self.ids = {}, {}, [], [], {}
        self.directory = ROOT / ".local/regression"
        self.directory.mkdir(parents=True, exist_ok=True)

    def request(self, method, path, body=None, role=HQ, content_type=None, login=False):
        headers = {}
        if role in self.tokens:
            headers["Authorization"] = "Bearer " + self.tokens[role]
        if body is not None:
            if not isinstance(body, bytes):
                body_bytes = json.dumps(body).encode()
                headers["Content-Type"] = "application/json"
            else:
                body_bytes = body
                headers["Content-Type"] = content_type
        else:
            body_bytes = None
        try:
            with urlopen(Request(BASE + path, data=body_bytes, headers=headers, method=method), timeout=40) as response:
                code, raw = response.status, response.read()
        except HTTPError as error:
            code, raw = error.code, error.read()
        try:
            result = json.loads(raw)
        except ValueError:
            result = {"raw": raw.decode(errors="replace")[:500]}
        if not login:
            safe = json.loads(json.dumps(result))
            def redact(value):
                if isinstance(value, dict):
                    return {k: "[redacted]" if k.lower() in {"downloadurl", "access_token", "token"} else redact(v) for k, v in value.items()}
                if isinstance(value, list):
                    return [redact(v) for v in value]
                return value
            self.requests.append({"n": len(self.requests)+1, "role": role, "method": method, "path": path, "body": "[multipart test PDF]" if isinstance(body, bytes) else body, "http": code, "response": redact(safe)})
        return code, result.get("data", result) if isinstance(result, dict) else result

    def check(self, label, method, path, body=None, role=HQ, expected=(200,), verify=None, defect=None):
        code, result = self.request(method, path, body, role)
        ok = code in expected and (verify is None or verify(result))
        self.results.append({"id": f"INSP-{len(self.results)+1:03d}", "check": label, "role": role, "status": "PASS" if ok else "FAIL", "http": code, "request": len(self.requests), "expected": list(expected), "defect": defect if not ok else None})
        self.save()
        print(("PASS " if ok else "FAIL ") + label + f" HTTP {code}")
        return result

    def outcome(self, label, ok, actual, defect=None, role=HQ):
        self.results.append({"id": f"INSP-{len(self.results)+1:03d}", "check": label, "role": role, "status": "PASS" if ok else "FAIL", "actual": actual, "defect": defect if not ok else None, "request": len(self.requests)})
        self.save()

    def save(self):
        data = {"prefix": self.prefix, "ids": self.ids, "results": self.results, "requests": self.requests}
        (self.directory / ("inspections-" + self.prefix + ".json")).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def upload(self, role, name):
        boundary = "reg" + uuid.uuid4().hex
        # Minimal valid one-page PDF; regression content is synthetic.
        objects = [b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n"]
        pdf, offsets = b"%PDF-1.4\n", [0]
        for obj in objects:
            offsets.append(len(pdf)); pdf += obj
        xref = len(pdf)
        pdf += b"xref\n0 4\n0000000000 65535 f \n" + b"".join(f"{n:010} 00000 n \n".encode() for n in offsets[1:])
        pdf += f"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
        body = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{self.prefix}-{name}.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + pdf + f"\r\n--{boundary}--\r\n".encode()
        code, data = self.request("POST", "/api/files", body, role, "multipart/form-data; boundary=" + boundary)
        self.outcome("上传检查附件 " + name, code == 200 and bool(data.get("fileId")), {"http": code, "fileId": data.get("fileId")}, role=role)
        return data.get("fileId")

    def run(self):
        for account in json.loads((ROOT / ".local/dev-accounts.json").read_text(encoding="utf-8-sig")):
            role = account["role"]
            code, data = self.request("POST", "/api/platform/auth/login", {"username": account["username"], "password": account["password"]}, role=None, login=True)
            assert code == 200, role + " login failed"
            self.tokens[role] = data["access_token"]
            self.me[role] = self.check("真实角色身份 " + role, "GET", "/api/platform/auth/me", role=role, verify=lambda d, r=role: r in d.get("role_codes", []))
        uid, branch = self.me[HQ]["userId"], self.me[BR]["orgId"]
        pid = self.prefix + "-MAIN"
        self.ids["mainPlan"] = pid
        pp = "/api/inspection/plans/" + pid
        file_hq, file_br = self.upload(HQ, "notice"), self.upload(BR, "evidence")
        self.ids.update(hqFile=file_hq, branchFile=file_br)
        payload = {"inspectionPlanId": pid, "title": self.prefix, "inspectCode": self.prefix, "type": "SPECIAL_INSPECTION", "frequency": "AD_HOC", "targetOrgIds": [branch], "leaderUserId": uid, "teamMemberUserIds": [uid], "plannedStartDate": date.today().isoformat(), "plannedEndDate": (date.today()+timedelta(days=30)).isoformat(), "files": [{"attachmentType": "INSPECTION_NOTICE", "fileId": file_hq}] if file_hq else []}
        self.check("总部创建检查计划并验证初始状态", "POST", "/api/inspection/plans", payload, verify=lambda d: d.get("phase")=="PLAN_DRAFT" and d.get("inspectionPlanId")==pid)
        self.check("计划重复编号拒绝", "POST", "/api/inspection/plans", payload, expected=(409,))
        self.check("草稿编辑并读回", "PATCH", pp, {"title": self.prefix+"-updated"}, verify=lambda d: d.get("title")==self.prefix+"-updated")
        for role in (BR, *OTHER):
            self.check("非总部拒绝计划列表 " + role, "GET", "/api/inspection/plans", role=role, expected=(403,))
            self.check("非总部拒绝创建计划 " + role, "POST", "/api/inspection/plans", payload, role=role, expected=(403,))
            self.check("非总部拒绝编辑 " + role, "PATCH", pp, {"title": self.prefix+"-DENIED"}, role=role, expected=(403,))
        for role in OTHER:
            for suffix in ("", "/execution", "/evidence-requirements", "/working-papers", "/report-workspace"):
                self.check("无权角色拒绝检查明细 "+role+suffix, "GET", pp+suffix, role=role, expected=(403,404))
            self.check("无权角色拒绝下载HQ附件 "+role, "GET", f"/api/files/{file_hq}/download", role=role, expected=(403,404), defect="INSP-D02")
        self.check("管理员读取计划", "GET", pp, role=ADM, verify=lambda d:d.get("inspectionPlanId")==pid)
        self.check("目标分支读取草稿", "GET", pp, role=BR, verify=lambda d:d.get("inspectionPlanId")==pid)
        self.check("草稿禁止直接批准", "POST", pp+"/transitions", {"action":"approve"}, expected=(409,))
        self.check("提交审批", "POST", pp+"/transitions", {"action":"submit_approval"}, verify=lambda d:d.get("phase")=="PLAN_SUBMITTED" and bool(d.get("sideEffects",{}).get("createdTaskIds")))
        self.check("分支禁止审批", "POST", pp+"/transitions", {"action":"approve"}, role=BR, expected=(403,))
        self.check("总部批准并产生通知材料待办", "POST", pp+"/transitions", {"action":"approve"}, verify=lambda d:d.get("phase")=="PLAN_APPROVED" and len(d.get("sideEffects",{}).get("createdTaskIds",[]))==2)
        self.check("分支待办收到本计划", "GET", "/api/tasks?keyword="+quote(self.prefix), role=BR, verify=lambda d:len(d.get("items",[]))==2)
        self.check("批准后禁止编辑", "PATCH", pp, {"title":self.prefix+"-DENIED"}, expected=(409,))
        self.check("分支签收关闭通知待办", "POST", pp+"/acknowledgement", {"liaisonName":self.prefix, "liaisonPhone":"02000000000"}, role=BR, verify=lambda d:d.get("ackStatus")=="ACKNOWLEDGED" and bool(d.get("sideEffects",{}).get("closedTaskIds")))
        self.check("分支下载已绑定通知", "GET", f"/api/files/{file_hq}/download", role=BR, verify=lambda d:bool(d.get("downloadUrl")))
        self.check("启动资料收集", "POST", pp+"/transitions", {"action":"launch"}, verify=lambda d:d.get("phase")=="EVIDENCE_COLLECTING")
        self.check("暂停计划", "POST", pp+"/transitions", {"action":"suspend"}, verify=lambda d:d.get("status")=="SUSPENDED")
        self.check("恢复原阶段", "POST", pp+"/transitions", {"action":"resume"}, verify=lambda d:d.get("status")=="IN_PROGRESS" and d.get("phase")=="EVIDENCE_COLLECTING")
        req = self.check("分支材料清单目标正确", "GET", pp+"/evidence-requirements", role=BR, verify=lambda d:len(d.get("items",[]))==1)["items"][0]["requirementId"]
        self.ids["requirement"] = req
        subbody={"requirementId":req,"fileIds":[file_br]}
        for role in OTHER:
            self.check("无权角色拒绝报送 "+role,"POST","/api/inspection/evidence-submissions",subbody,role=role,expected=(403,))
        sub=self.check("分支首次报送", "POST", "/api/inspection/evidence-submissions", subbody, role=BR, verify=lambda d:d.get("status")=="SUBMITTED")["evidenceSubmissionId"]
        self.check("待审材料禁止重复提交","POST","/api/inspection/evidence-submissions",subbody,role=BR,expected=(409,))
        self.check("驳回材料必须填写原因","POST",f"/api/inspection/evidence-submissions/{sub}/review",{"decision":"REJECT"},expected=(422,))
        self.check("总部退回材料","POST",f"/api/inspection/evidence-submissions/{sub}/review",{"decision":"REJECT","feedback":self.prefix+"-补充证据"},verify=lambda d:d.get("status")=="REJECTED")
        sub=self.check("分支退回后重新提交", "POST", "/api/inspection/evidence-submissions", subbody, role=BR, verify=lambda d:d.get("status")=="SUBMITTED")["evidenceSubmissionId"]
        self.ids["approvedSubmission"]=sub
        self.check("分支不能自审","POST",f"/api/inspection/evidence-submissions/{sub}/review",{"decision":"APPROVE"},role=BR,expected=(403,))
        self.check("总部材料通过","POST",f"/api/inspection/evidence-submissions/{sub}/review",{"decision":"APPROVE","idempotencyKey":self.prefix+"-review"},verify=lambda d:d.get("status")=="APPROVED")
        self.check("材料审核幂等重放","POST",f"/api/inspection/evidence-submissions/{sub}/review",{"decision":"APPROVE","idempotencyKey":self.prefix+"-review"},verify=lambda d:d.get("status")=="APPROVED")
        self.check("通过材料禁止再次报送","POST","/api/inspection/evidence-submissions",subbody,role=BR,expected=(409,))
        tasks=self.check("读取材料通过后待办","GET","/api/tasks?keyword="+quote(self.prefix),role=BR)
        evidence_tasks=[t for t in tasks.get("items",[]) if t.get("sourceId")==req]
        self.outcome("资料通过关闭分支材料待办",bool(evidence_tasks) and all(t.get("status")=="DONE" for t in evidence_tasks),evidence_tasks, "INSP-D03",BR)
        wpbody={"paperCode":self.prefix+"-WP", "title":self.prefix+"-底稿", "category":"合规制度", "branchId":branch, "procedure":"抽查制度执行", "executionRecord":"抽查发现缺少复核签字", "result":"ISSUE_CANDIDATE", "fileIds":[file_br]}
        for role in (BR,*OTHER):
            self.check("非总部拒绝底稿创建 "+role,"POST",pp+"/working-papers",wpbody,role=role,expected=(403,))
        wp=self.check("总部建立执行底稿","POST",pp+"/working-papers",wpbody,verify=lambda d:d.get("result")=="ISSUE_CANDIDATE")["workingPaperId"]
        self.ids["workingPaper"]=wp
        self.check("重复底稿编号拒绝","POST",pp+"/working-papers",wpbody,expected=(409,))
        self.check("底稿结果保存","PATCH",f"/api/inspection/working-papers/{wp}/result",{"executionRecord":self.prefix+"-复核完成"},verify=lambda d:d.get("executionRecord")==self.prefix+"-复核完成")
        issuebody={"inspectionPlanId":pid,"branchId":branch,"title":self.prefix+"-发现1","riskLevel":"MEDIUM","description":"缺少复核签字","basisRule":"测试合规制度第1条","sourceWorkingPaperId":wp,"idempotencyKey":self.prefix+"-issue1"}
        issue=self.check("底稿转检查发现","POST","/api/inspection/issues",issuebody,verify=lambda d:d.get("status")=="PENDING_CONFIRMATION")["issueId"]
        self.ids["issue1"]=issue
        self.check("底稿转发现幂等","POST","/api/inspection/issues",issuebody,verify=lambda d:d.get("issueId")==issue)
        self.check("分支发现清单可见本机构记录","GET","/api/inspection/issues?inspectionPlanId="+pid,role=BR,verify=lambda d:any(i["issueId"]==issue for i in d.get("items",[])))
        for role in OTHER:
            self.check("无权角色拒绝事实确认 "+role,"POST",f"/api/inspection/issues/{issue}/confirmations",{"decision":"NO_OBJECTION"},role=role,expected=(403,))
        self.check("分支事实确认","POST",f"/api/inspection/issues/{issue}/confirmations",{"decision":"NO_OBJECTION","comment":self.prefix},role=BR,verify=lambda d:d.get("decision")=="NO_OBJECTION")
        issue2body={**issuebody,"title":self.prefix+"-发现2","idempotencyKey":self.prefix+"-issue2"};issue2body.pop("sourceWorkingPaperId")
        issue2=self.check("创建申诉分支发现","POST","/api/inspection/issues",issue2body)["issueId"]
        self.ids["issue2"]=issue2
        self.check("空申诉理由拒绝","POST",f"/api/inspection/issues/{issue2}/appeals",{"reason":""},role=BR,expected=(422,))
        appeal=self.check("分支提交申诉","POST",f"/api/inspection/issues/{issue2}/appeals",{"reason":self.prefix+"-补充证据","fileIds":[file_br]},role=BR,verify=lambda d:d.get("status")=="SUBMITTED")["appealId"]
        self.ids["appeal"]=appeal
        self.check("禁止重复活跃申诉","POST",f"/api/inspection/issues/{issue2}/appeals",{"reason":self.prefix},role=BR,expected=(409,))
        self.check("分支不能自裁决","POST",f"/api/inspection/appeals/{appeal}/decision",{"decision":"REJECTED","decisionReason":self.prefix},role=BR,expected=(403,))
        self.check("裁决必须有理由","POST",f"/api/inspection/appeals/{appeal}/decision",{"decision":"REJECTED"},expected=(422,))
        self.check("总部驳回申诉","POST",f"/api/inspection/appeals/{appeal}/decision",{"decision":"REJECTED","decisionReason":self.prefix+"-证据不足"},verify=lambda d:d.get("decision")=="REJECTED")
        self.check("已裁决禁止重复裁决","POST",f"/api/inspection/appeals/{appeal}/decision",{"decision":"ADOPTED","decisionReason":self.prefix},expected=(409,))
        self.check("发现状态读回","GET","/api/inspection/issues?inspectionPlanId="+pid,verify=lambda d:{i["status"] for i in d.get("items",[])}=={"FACT_CONFIRMED","APPEAL_REJECTED"})
        plan=self.check("准备结束检查计划阶段读回","GET",pp)
        self.outcome("资料/底稿/事实完成后提供进入报告的合法动作","enter_report_preparation" in plan.get("allowedActions",[]),{"phase":plan.get("phase"),"allowedActions":plan.get("allowedActions")},"INSP-D01")
        self.check("完成事实裁决后进入报告准备","POST",pp+"/transitions",{"action":"enter_report_preparation","idempotencyKey":self.prefix+"-report","optimisticVersion":plan.get("version")},verify=lambda d:d.get("phase")=="REPORTING",defect="INSP-D01")
        self.check("进入报告受阻时生成草稿的实际响应","POST",pp+"/report-versions/generate",{"idempotencyKey":self.prefix+"-draft","format":"DOCX"},expected=(409,))
        final_file=self.upload(HQ,"final-report")
        self.check("进入报告受阻时绑定正式稿的实际响应","POST",pp+"/report-versions",{"idempotencyKey":self.prefix+"-final","fileAssetId":final_file},expected=(409,))
        for label in ("报告草稿生成和内容核对","正式报告发布及整改派发","分支开始整改","分支整改反馈及退回重提","总部整改验收和归档","全部整改完成后检查计划关闭"):
            self.results.append({"id":f"INSP-{len(self.results)+1:03d}","check":label,"status":"BLOCKED","role":BR if "分支" in label else HQ,"blockedBy":"INSP-D01","reason":"新计划停留 EVIDENCE_COLLECTING；未伪造状态或修改历史种子"})
        # Separate disposable plan proves premature completion without damaging the main path.
        bypass_id=self.prefix+"-EARLY-CLOSE"
        bp="/api/inspection/plans/"+bypass_id
        bypass={**payload,"inspectionPlanId":bypass_id,"inspectCode":bypass_id,"title":bypass_id,"files":[]}
        self.ids["earlyClosePlan"]=bypass_id
        self.check("创建提前关闭负向测试计划","POST","/api/inspection/plans",bypass)
        self.check("负向计划提交审批","POST",bp+"/transitions",{"action":"submit_approval"})
        self.check("未获批准前分支禁止签收","POST",bp+"/acknowledgement",{"liaisonName":self.prefix},role=BR,expected=(409,),defect="INSP-D05")
        self.check("负向计划批准","POST",bp+"/transitions",{"action":"approve"})
        self.check("负向计划启动","POST",bp+"/transitions",{"action":"launch"})
        self.check("未报送资料无报告整改时禁止直接完成","POST",bp+"/transitions",{"action":"complete"},expected=(409,),defect="INSP-D04")
        bstate=self.check("提前关闭实际状态读回","GET",bp)
        self.outcome("提前关闭未破坏业务状态",bstate.get("phase")!="CLOSED",{"phase":bstate.get("phase"),"status":bstate.get("status")},"INSP-D04")
        closed_wp={**wpbody,"paperCode":self.prefix+"-CLOSED-WP","title":self.prefix+"-CLOSED-WP"}
        self.check("已关闭计划禁止新增底稿","POST",bp+"/working-papers",closed_wp,expected=(409,),defect="INSP-D06")
        closed_issue={**issue2body,"inspectionPlanId":bypass_id,"title":self.prefix+"-CLOSED-ISSUE","idempotencyKey":self.prefix+"-closed-issue"}
        self.check("已关闭计划禁止新增发现","POST","/api/inspection/issues",closed_issue,expected=(409,),defect="INSP-D06")
        # Test real object retrieval without persisting signed URL credentials.
        code,download=self.request("GET",f"/api/files/{file_hq}/download",role="department_business")
        retrieved=False
        if code==200 and download.get("downloadUrl"):
            try:
                with urlopen(download["downloadUrl"],timeout=20) as response:
                    retrieved=response.status==200 and response.read().startswith(b"%PDF")
            except Exception:
                pass
        self.outcome("无检查权限的部门用户不能读取检查附件字节",not retrieved,{"metadataHttp":code,"actualPdfRetrieved":retrieved},"INSP-D02","department_business")
        # Read-only snapshots of the report/reconciliation surfaces on the new plan.
        self.check("总部报告工作区读取当前阻塞原因","GET",pp+"/report-workspace",verify=lambda d:bool(d))
        self.check("新计划尚未派发整改不得出现整改问题","GET","/api/issues?projectId="+pid,verify=lambda d:d.get("total")==0)
        self.save()

    def followup(self):
        for account in json.loads((ROOT / ".local/dev-accounts.json").read_text(encoding="utf-8-sig")):
            code,data=self.request("POST","/api/platform/auth/login",{"username":account["username"],"password":account["password"]},role=None,login=True)
            assert code==200
            self.tokens[account["role"]]=data["access_token"]
            _,self.me[account["role"]]=self.request("GET","/api/platform/auth/me",role=account["role"])
        cross_id=self.prefix+"-CROSS-ORG"
        cp="/api/inspection/plans/"+cross_id
        self.ids["crossOrgPlan"]=cross_id
        uid=self.me[HQ]["userId"]
        self.check("总部创建异机构隔离测试计划","POST","/api/inspection/plans",{"inspectionPlanId":cross_id,"inspectCode":cross_id,"title":cross_id,"type":"SPECIAL_INSPECTION","frequency":"AD_HOC","targetOrgIds":["WLZQ-RBC-SHENZHEN"],"leaderUserId":uid,"teamMemberUserIds":[uid],"plannedStartDate":date.today().isoformat(),"plannedEndDate":(date.today()+timedelta(days=30)).isoformat()},verify=lambda d:d.get("inspectionPlanId")==cross_id)
        for suffix in ("","/execution","/evidence-requirements","/working-papers","/report-workspace"):
            self.check("南沙分支不能读取深圳检查 "+suffix,"GET",cp+suffix,role=BR,expected=(403,404))
        self.check("南沙分支不能签收深圳检查","POST",cp+"/acknowledgement",{},role=BR,expected=(403,404))
        crossissue=self.check("创建异机构检查发现","POST","/api/inspection/issues",{"inspectionPlanId":cross_id,"branchId":"WLZQ-RBC-SHENZHEN","title":self.prefix+"-深圳发现","riskLevel":"LOW","description":self.prefix})["issueId"]
        self.check("南沙分支不能列出深圳检查发现","GET","/api/inspection/issues?inspectionPlanId="+cross_id,role=BR,verify=lambda d:d.get("total")==0)
        self.check("南沙分支不能确认深圳发现","POST",f"/api/inspection/issues/{crossissue}/confirmations",{"decision":"NO_OBJECTION"},role=BR,expected=(403,404))
        self.check("南沙分支不能申诉深圳发现","POST",f"/api/inspection/issues/{crossissue}/appeals",{"reason":self.prefix},role=BR,expected=(403,404))
        # Anonymous access, and both non-business roles at report/rectification boundaries.
        self.check("匿名拒绝计划明细","GET","/api/inspection/plans/"+self.ids["mainPlan"],role=None,expected=(401,))
        for role in OTHER:
            self.check("无权角色拒绝检查发现列表 "+role,"GET","/api/inspection/issues?inspectionPlanId="+self.ids["mainPlan"],role=role,expected=(403,))
            if role=="department_business":
                self.check("部门角色整改列表不暴露记录","GET","/api/rectifications",role=role,verify=lambda d:d.get("total")==0 and d.get("items")==[])
            else:
                self.check("无权角色拒绝整改列表 "+role,"GET","/api/rectifications",role=role,expected=(403,))
        # Verify writes survived a new independent login/read. This is not a restart test.
        self.check("重新登录读回材料审核结果","GET","/api/inspection/plans/"+self.ids["mainPlan"]+"/execution",verify=lambda d:any(s.get("evidenceSubmissionId")==self.ids["approvedSubmission"] and s.get("status")=="APPROVED" for s in d.get("evidenceSubmissions",[])))
        self.check("重新登录读回底稿及发现关联","GET","/api/inspection/plans/"+self.ids["mainPlan"]+"/working-papers",verify=lambda d:any(p.get("workingPaperId")==self.ids["workingPaper"] and p.get("convertedIssueId")==self.ids["issue1"] for p in d.get("items",[])))

    def report(self):
        counts=Counter(i["status"] for i in self.results)
        lines=["# 合规检查真实 API 业务回归", "", "日期：2026-10-03。环境：本地合并系统，API `http://127.0.0.1:8010`。只登记问题，未修改产品。", "", f"本批 `{self.prefix}`：{len(self.results)} 项，**PASS {counts['PASS']} / FAIL {counts['FAIL']} / BLOCKED {counts['BLOCKED']}**。FAIL 按下列六项缺陷归并；后续增补若出现其他失败，见逐项清单。", "", "## 范围与执行记录", "", "- 五种真实 Casdoor 角色登录；总部计划、审批、分支签收、资料退回重提/审核、底稿、发现、事实确认、申诉裁决及权限拒绝。", "- API 验证状态、ID、列表读回、幂等和待办变化；没有用 200 替代全部业务断言。", "- 只创建本批前缀业务数据及其关联记录；没有改共享角色、账号、种子、历史数据，没有重启服务。", "- `python scripts/regression/inspections.py`：首次 91aeda 批因脚本把 evidenceSubmissionId 写成 submissionId 而中断；该不完整批不计入本报告。修正测试脚本后重新执行完整 5201e7 批。", "- `python scripts/regression/inspections.py --resume .local/regression/inspections-REG-20261003-INSP-5201e7.json --followup`：补测跨机构和重新登录读回。", "- 未执行浏览器、构建、类型检查、容器重启或重启后持久化验证。重新登录读回不能替代重启验证。", "- 原始脱敏请求/响应：`.local/regression/inspections-"+self.prefix+".json`；密码、token、签名下载地址不写入证据。", "", "## 本批业务 ID", "", "| 对象 | ID |", "|---|---|"]
        lines += [f"| {k} | `{v}` |" for k,v in self.ids.items()]
        defects=[
            ("INSP-D01","P1","新建检查计划无法从资料/执行推进到报告", "总部完成资料审核、底稿转发现、分支事实确认及总部申诉裁决后，计划仍为 IN_PROGRESS/EVIDENCE_COLLECTING。GET plan 返回 allowedActions=[suspend,terminate,complete]；POST transitions {action:enter_report_preparation,idempotencyKey:<新值>,optimisticVersion:6} 返回409 INVALID_STATE。", "应提供合法的执行、事实确认和报告推进路径。实际新建计划没有进入 FACT_CONFIRMATION/ADJUDICATION 的路径。生成草稿和绑定正式PDF也返回409。", "backend/app/modules/compliance/domain/dictionaries.py:692（完整运行时状态表）、inspection_plan_store.py:817；后者仅接受 FACT_CONFIRMATION/ADJUDICATION。", "报告生成、正式发布、整改派发、整改反馈/复核/归档及正常计划关闭六项受阻。"),
            ("INSP-D02","P1","无检查权限的部门账号可以下载检查附件", "department_business GET /api/inspection/plans/<mainPlan> 返回403；同账号 GET /api/files/<hqFile>/download 返回200并获得签名URL。用该URL实际 GET 成功返回200及%PDF文件字节。", "无该计划查看权限的角色应被拒绝附件访问。实际下载成功；external_lawyer 同资源返回403。", "backend/app/modules/compliance/domain/evidence_store.py:400 只对具有 PERM-BRANCH-INSPECTION-HANDLE 的用户进行组织检查；api/routes/files.py:79 调用该检查后直接签发URL。", "检查材料保密边界失效。证据未保存签名URL。"),
            ("INSP-D03","P2","材料审核通过后分支提交待办仍待处理", "EVSUB状态APPROVED后，branch_business GET /api/tasks?keyword=<prefix> 返回 TASK-BR-EVIDENCE-<mainPlan>-WLZQ-RBC-GZ-NANSHA，status=PENDING；再次报送返回409 SUBMISSION_ALREADY_APPROVED。", "完成材料报送和审核后该提交待办应关闭。实际待办仍提示提交，但提交操作已被禁止。", "backend/app/modules/compliance/domain/evidence_store.py:344-398 审核只更新submission，未关闭材料任务；api/routes/inspection.py:269 对应审核路由。", "分支待办无法清零，形成不可执行任务。"),
            ("INSP-D04","P1","资料收集阶段可以绕过报告整改直接完成检查", "独立 EARLY-CLOSE 计划 create→submit_approval→approve→launch；未提交任何材料，POST transitions {action:complete} 返回200；GET读回COMPLETED/CLOSED、progress=100。", "完整检查闭环应在所需报告/整改条件满足后结束。实际空检查可直接声明完成。当前旧运行时表显式允许该跳转，是完整业务闭环的缺口。", "backend/app/modules/compliance/domain/dictionaries.py:734-749；inspection_plan_store.py:495-519 无业务完成性守卫。", "关闭统计可包含未开展检查，且不能证明完成报告/整改。"),
            ("INSP-D05","P2","未批准的计划可以由分支提前签收", "独立 EARLY-CLOSE 计划停留 APPROVING/PLAN_SUBMITTED 时，branch_business POST acknowledgement {liaisonName:<prefix>} 返回200 ACKNOWLEDGED。", "应在批准通知下发后签收。实际审批未完成即可写签收；批准后新建通知待办可能与已有签收不一致。", "backend/app/modules/compliance/domain/inspection_plan_store.py:562-573 acknowledgement_phases 包含 PLAN_SUBMITTED。", "签收时间和审批/下发顺序不可信。"),
            ("INSP-D06","P2","已关闭检查仍允许新增底稿及发现", "对读回COMPLETED/CLOSED的 EARLY-CLOSE 计划，HQ POST /plans/<id>/working-papers 返回200、新底稿ID；POST /api/inspection/issues 返回200、新发现PENDING_CONFIRMATION。", "检查关闭后应阻止新增业务材料，或先执行明确重开流程。实际可以继续改变已关闭检查的发现集合。", "backend/app/modules/compliance/domain/evidence_store.py:632；issue_store.py:84；创建路径未校验计划生命周期。", "已关闭检查内容可继续变化，出现关闭计划内未确认发现。")]
        for did,priority,title,repro,expected,location,impact in defects:
            lines += ["",f"## {did} [{priority}] {title}","", "- 最小复现和实际："+repro, "- 预期对比："+expected, "- 代码定位："+location, "- 影响/受阻下游："+impact]
        lines += ["", "## 逐项结果", "", "`请求#` 对应本批 JSON 的 requests[n]；每条记录含角色、方法、路径、请求体和脱敏响应。无请求编号的 BLOCKED 项未被计为通过。", "", "| 用例 | 状态 | 角色 | 验证内容 | 预期 / 实际摘要 | 请求# / 缺陷 |", "|---|---|---|---|---|---|"]
        for item in self.results:
            actual=("HTTP "+str(item["http"])+"；期望 "+str(item.get("expected"))) if "http" in item else json.dumps(item.get("actual",item.get("reason","")),ensure_ascii=False)
            if len(actual)>300: actual=actual[:300]+"…"
            lines.append(f"| {item['id']} | {item['status']} | {item.get('role','')} | {item['check']} | {actual.replace('|','/')} | {item.get('request','—')} / {item.get('defect') or item.get('blockedBy','—')} |")
        (ROOT / "docs/testing/regression-inspections.md").write_text("\n".join(lines)+"\n",encoding="utf-8")


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--resume")
    parser.add_argument("--followup",action="store_true")
    parser.add_argument("--report-only",action="store_true")
    args=parser.parse_args()
    r=Regression()
    if args.resume:
        saved=json.loads(Path(args.resume).read_text(encoding="utf-8"))
        r.prefix,r.ids,r.results,r.requests=saved["prefix"],saved["ids"],saved["results"],saved["requests"]
    try:
        if args.followup:
            r.followup()
        elif not args.report_only:
            r.run()
    finally:
        r.save()
        r.report()
        print(json.dumps({"prefix":r.prefix,"counts":dict(Counter(i["status"] for i in r.results))},ensure_ascii=False))
    sys.exit(1 if any(i["status"]=="FAIL" for i in r.results) else 0)
