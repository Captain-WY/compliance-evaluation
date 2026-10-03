# 合并项目开发指南

本文将原合规系统的前端事实梳理、接口与验收对齐方法，以及原案件系统的分层、字典、事务和页面状态约定，整理为当前项目可直接使用的开发流程。工程约束统一以根目录 [AGENTS.md](../../AGENTS.md) 为准。

## 从页面需求到真实业务

1. 找到当前页面及对应服务；需要对照时查阅归档 `frontend_backup`，确认入口、字段、操作与视觉效果。
2. 对照实际 API 和数据模型，列出本次涉及的角色、组织范围、资源关系、状态条件及输入输出。旧前端并不是可以直接照搬的后端契约。
3. 将差异控制在本次功能范围内，同时调整模型或迁移、服务、API、前端适配和必要验证。较大变更先记录设计与验收条件。
4. 验证正常路径及关键拒绝路径。持久化不能只看成功提示，要刷新读回；涉及内存工作集时还要验证重启读回。
5. 更新相关问题状态和验证记录，保存提交检查点。后续工作读取结论与证据路径即可，无需重新阅读全部历史日志。

原项目的 AutoBE、专用浏览器工具和阶段工作包不是当前开发的硬依赖。保留可验证的契约与证据要求，采用当前环境实际可用的工具。

## 代码落点与接口边界

| 任务 | 当前落点 |
| --- | --- |
| 统一菜单、页面容器、旧路由兼容 | `frontend/src/app/` |
| 登录状态、token、HTTP 错误处理 | `frontend/src/platform/` |
| 案件页面及 API 适配 | `frontend/src/modules/cases/` |
| 检查与考核业务页面 | `frontend/src/modules/compliance-shared/`；模块入口为 `inspections/`、`assessments/` |
| 系统管理组合入口 | `frontend/src/modules/system/` |
| FastAPI 注册、数据库与配置 | `backend/app/main.py`、`backend/app/core/` |
| 公共能力 | `backend/app/platform/` |
| 业务服务与模型 | `backend/app/modules/cases/`、`backend/app/modules/compliance/` |
| 合规运行时及兼容处理 | `backend/app/adapters/` |
| 迁移与基础种子 | `backend/migrations/`、`backend/app/seed.py` 及模块种子实现 |

公共 API 使用 `/api/platform/auth`、`/api/platform/dictionaries`、`/api/platform/files`。案件保留 `/api/bff/v1/*` 及部分 `/api/v1/*`，合规保留 `/api/inspection/*` 等业务路径。具体方法、字段和响应以当前路由、DTO 和运行中的 `/docs` 为准，不套用旧文档“所有接口统一为 /api/v1”的描述。

当前仍有不同模块的响应封装。共享 transport 处理登录状态和通用错误，模块适配器处理业务结构；日期、ID、金额、空值和枚举转换应集中在适配层。服务端查询沿用所在模块的数据管理方式；采用 React Query 的页面，写入后更新或失效对应查询。

## 业务规则的保留方式

- **字典驱动**：继续从公共库获取业务字典，保留 namespace 和稳定编码。页面显示名与状态编码分离；受保护项、编辑策略和版本号不能在前端绕过。
- **流程模板与实例**：区分模板配置与案件任务、考核流程的运行实例。修改模板时明确对已生成实例的影响，不默认追改历史记录。
- **状态流转**：检查及考核前置条件由服务端检查。打开任务、读通知、签收、审批和完成是不同事件，分别处理状态与副作用。
- **事务与并发**：同库关联修改应有明确提交和回滚边界。案件会话依赖已有请求结束提交行为，进入服务前先检查会话是否已开启事务；不要机械添加嵌套 begin。预算扣减及回调需处理行锁或等效控制、幂等与失败回滚。
- **跨库操作**：公共引用通过 ID 解析，必要时批量查询。业务库和公共库不能依靠同一个 Session 获得跨库原子事务；先说明部分失败如何重试或补偿。
- **软删除与审计**：对已有这些字段的模型保留过滤与审计行为，字段差异以实际模型为准。
- **外部依赖**：优先复用已有 provider 或适配层，避免在页面和路由中散落对象存储、搜索和智能服务调用。尚未接入的外部能力应显式失败或禁用。

这些是后续实现和修复的要求，不表示当前全部代码已经满足。现存例外及缺陷以[问题台账](../testing/role-regression-issues.md)为修复入口。

## 开发和验证命令

默认在仓库根目录运行以下命令，完整启动说明见[本地部署](../deployment/local.md)。

```powershell
./scripts/dev/start.ps1
./scripts/dev/start.ps1 -NoBuild
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml ps
```

前端宿主机开发建议 Node.js 24，与当前 Docker 构建一致：

```powershell
cd frontend
npm ci
npm run build
npm run typecheck
npx tsx --test src/app/navigation.test.ts
# 已有 Docker 前端占用 3010 时，显式使用另一端口
npm run dev -- --port 3011 --strictPort
```

Vite 将 `/api` 代理到 `http://127.0.0.1:8010`。若初始化为后端选用了其他端口，在运行 Vite 前设置 `API_PROXY_TARGET` 为该实际地址。前端本地预览仍使用已运行的统一后端和依赖服务。

回到仓库根目录后，可执行：

```powershell
# 基本回归会创建 MERGE-SMOKE 前缀的开发测试记录
./scripts/dev/smoke.ps1
# 后端重启后，读取上一次基本回归留下的记录
./scripts/dev/smoke.ps1 -VerifyExisting
# 容器内后端测试
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml exec -T backend pytest -q
```

五角色业务回归脚本在 `scripts/regression/`。这些脚本会创建或推进业务测试数据，执行前阅读对应脚本及[回归计划](../testing/role-regression-plan.md)，不要在不明环境中直接全量运行。文档整理或其他低风险改动不需要重跑会写数据的业务回归。

迁移使用 `backend/alembic.ini` 中的 `common`、`cases`、`compliance` 配置段。启动脚本按三段分别执行 `alembic -n <配置段> upgrade head` 及种子初始化；不要使用归档中的单链 `alembic upgrade head`。迁移文件须放到所属数据库目录，并在开发环境验证升级与重复启动。

## 文档和证据

README 说明项目与使用方式；AGENTS.md 是统一规范；CLAUDE.md 提供工具入口；`docs/README.md` 是文档索引。专项设计、部署说明、测试结果分别放在对应目录，入口只保留短摘要和链接。

问题记录包含角色、复现步骤、预期与实际结果、影响、验证方式及证据路径。修复后更新同一问题，区分已修复、待复验和受阻。日志、截图、响应样本和临时检查点保存在忽略的 `.local/`，公开文档不包含凭据或完整敏感响应。

提交前运行 `git diff --cached --check` 与 `python scripts/dev/check_release.py`。本机档案、原型、生成账号和测试大文件不进入 Git；运行所需的结构化资源必须保存在当前项目中。
