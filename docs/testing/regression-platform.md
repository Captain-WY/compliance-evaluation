# 公共平台及系统管理员回归

日期：2026-10-03。真实 HTTP 执行：`python scripts/regression/platform.py`。

本批 `REG-20261003-SYS-d33698`：**28 项，20 PASS / 5 FAIL / 3 BLOCKED**。五角色登录、非管理员管理接口拒绝、组织人员读取、菜单创建、流程模板创建、统一字典新增修改及两套适配器读回通过。

证据：本机 `.local/regression/platform-results.json`，含逐项请求/响应和状态；账号密码及 token 未记录。只读服务日志已核实以下根因。

## SYS-D01 [P1] 多个管理员写操作因重复开启事务返回 500

- 角色：系统管理员。
- 创建角色：`POST /api/bff/v1/admin/roles/create`，`{"roleCode":"REG-20261003-SYS-d33698","roleName":"REG-20261003-SYS-d33698"}` → HTTP 500。
- 创建隐藏根菜单成功；随后 `POST /api/bff/v1/admin/menus/update`，传该菜单 ID 和名称 → HTTP 500。
- 创建独立流程模板成功；`POST /api/bff/v1/task-templates/create` 传该流程 ID、`task_name` 和 `task_code` → HTTP 500；流程模板 `toggle` → HTTP 500。
- 预期：合法管理员操作成功且能读回。实际日志均为 `sqlalchemy.exc.InvalidRequestError: A transaction is already begun on this Session.`。
- 根因：查询已触发 SQLAlchemy 自动事务，同一个 session 后续再次 `async with session.begin()`。已核实位置：`role_service.py:154`、`menu_service.py:246`、`task_template_service.py:147`、`process_template_service.py:204`，均位于 `backend/app/modules/cases/services/`。
- 影响：角色创建及其修改、停用、菜单绑定测试受阻；任务模板无法建立，流程模板无法停用。本批测试模板使用独立未知业务类型，不挂接真实案件。浏览器新增 `REG-20261003-UI-ROLE` 同样提示“请求失败（HTTP 500）”，截图 `.local/regression/screenshots/admin-role-failure.jpg`。
- 修复验收建议：统一请求事务边界，覆盖上述四类写操作和独立读回，再补角色分配、停用生效、删除链路。

## SYS-D02 [P2] 重复公共字典编码返回内部错误

- 角色：系统管理员。
- 复现：对 `/api/platform/dictionaries` 连续 POST 同一 `namespace=shared`、`dict_type=REGRESSION`、`dict_code=REG-20261003-SYS-d33698`。
- 预期：第二次返回 400/409/422 等可解释的重复值错误；已有记录不变。
- 实际：首次及修改成功，重复请求 HTTP 500；日志为唯一约束 `uk_sys_dicts_type_code_active` 冲突。
- 定位：`backend/app/platform/dictionaries.py:23` 创建路径缺少重复检查/IntegrityError 翻译。数据库阻止了重复记录，但错误未转换为业务提示。

## 代码核查待补验

以下未作为已完成动态回归的独立缺陷计数：

- `frontend/src/modules/cases/features/admin/MenuAdmin.tsx:154` 的“停用”仅提交 ID/名称，未传目标状态；`menu_service.py` 更新路径也没有修改 status。事务修复后应继续验证停用语义及原路由字段保留。
- `backend/app/platform/auth.py` 解析角色时过滤删除状态，未过滤角色 ACTIVE 状态。因本轮没有修改共用账号/种子角色，角色停用后的权限撤销尚未实测。
- 菜单配置仍含旧系统路由；新壳层菜单由代码定义。新增菜单与角色菜单配置对实际导航/权限的生效链路仍待补验。

## 限制及测试数据

- 本轮不删除五个共享角色，不改共享用户归属，不对 Casdoor 操作员执行密码/权限变化。
- 保留新增的隐藏菜单、独立流程模板和字典供复现；ID 见本地 JSON `state`。
- 不把可读取组织镜像等同于 OA 实时同步；外部 OA/EKP 未接入，不作为已通过能力。
- 未执行重启验证。本轮未修改产品代码，无需重复构建；合并任务中的构建/冒烟结果不计入本轮数量。

## 逐项结果

| 用例 | 角色 | 检查内容 | 状态 | 实际/阻塞 |
|---|---|---|---|---|
| SYS-A1 | platform_admin | 登录身份及角色映射 | PASS |  |
| SYS-A2 | hq_business | 登录身份及角色映射 | PASS |  |
| SYS-A3 | branch_business | 登录身份及角色映射 | PASS |  |
| SYS-A4 | department_business | 登录身份及角色映射 | PASS |  |
| SYS-A5 | external_lawyer | 登录身份及角色映射 | PASS |  |
| SYS-A6 | anonymous | 匿名请求拒绝 | PASS |  |
| SYS-A7 | anonymous | 错误密码拒绝 | PASS |  |
| SYS-A8 | hq_business | 拒绝系统角色/菜单/字典管理 | PASS |  |
| SYS-A9 | branch_business | 拒绝系统角色/菜单/字典管理 | PASS |  |
| SYS-A10 | department_business | 拒绝系统角色/菜单/字典管理 | PASS |  |
| SYS-A11 | external_lawyer | 拒绝系统角色/菜单/字典管理 | PASS |  |
| SYS-01 | platform_admin | 角色列表包含五类业务角色 | PASS |  |
| SYS-02 | platform_admin | 创建独立测试角色 | FAIL | HTTP 500: Internal Server Error |
| SYS-03 | platform_admin | 角色修改并读回 | BLOCKED | SYS-02 创建失败 |
| SYS-04 | platform_admin | 测试角色停用并读回 | BLOCKED | SYS-02 创建失败 |
| SYS-05 | platform_admin | 菜单树读取 | PASS |  |
| SYS-06 | platform_admin | 创建独立隐藏测试菜单 | PASS |  |
| SYS-07 | platform_admin | 按页面停用动作请求并核对状态/原字段 | FAIL | HTTP 500: Internal Server Error |
| SYS-08 | platform_admin | 独立测试角色菜单绑定读回 | BLOCKED | SYS-02 失败 |
| SYS-09 | platform_admin | 组织树读取 | PASS |  |
| SYS-10 | platform_admin | 人员及权限范围读取 | PASS |  |
| SYS-11 | platform_admin | 流程模板列表 | PASS |  |
| SYS-12 | platform_admin | 创建独立流程模板 | PASS |  |
| SYS-13 | platform_admin | 任务模板创建与读取 | FAIL | HTTP 500: Internal Server Error |
| SYS-14 | platform_admin | 流程模板停用读回 | FAIL | HTTP 500: Internal Server Error |
| SYS-15 | platform_admin | 统一字典新增修改并跨两个适配器读回 | PASS |  |
| SYS-16 | platform_admin | 重复字典编码友好拒绝 | FAIL | HTTP 500: Internal Server Error |
| SYS-17 | external_lawyer | 律师禁止创建系统流程模板 | PASS |  |
