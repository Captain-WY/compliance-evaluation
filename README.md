# compliance-evaluation

面向证券业务场景的合规与案件管理平台，由原合规检查及合规考核系统、案件管理系统合并而成。使用一个 React 前端、一个 FastAPI 后端和统一登录入口，通过左侧四个一级菜单组织业务；案件、合规和公共数据分别存储。

**当前为开发版本。** 本地 Docker 部署和基本读写已验证；五类角色业务回归仍有待修复问题，不能视为完整业务验收或生产就绪。

## 业务模块与角色

| 一级菜单 | 业务范围 |
| --- | --- |
| 案件管理 | 线索上报与转案、案件台账和详情、阶段任务、审批协作、卷宗、费用与财务、报送、外聘律所及律师门户 |
| 合规检查 | 计划与立项、材料报送、实施监控、底稿与问题、事实确认及申辩、裁决与整改跟踪 |
| 合规考核 | 指标、方案与规则、调度下发、数据填报、复核、成绩档案和日常履职台账 |
| 系统管理 | 公共字典、角色、菜单、流程模板、组织与权限范围、合规受保护字典 |

以上描述代码及页面覆盖的业务范围，各流程实际通过情况以[五角色回归报告](docs/testing/role-regression-report.md)为准。

| 角色 | 默认可见模块 |
| --- | --- |
| 系统管理员 `platform_admin` | 四个模块 |
| 总部业务 `hq_business` | 案件管理、合规检查、合规考核 |
| 分支机构 `branch_business` | 案件上报、分支检查与考核入口 |
| 业务部门 `department_business` | 案件上报记录、线索上报、协查任务 |
| 外聘律师 `external_lawyer` | 案件管理中的律师工作台 |

菜单用于展示入口；服务端还需校验操作权限、机构范围及案件或任务关系。

## 技术架构

| 层次 | 当前实现 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite 6、Tailwind CSS 4；共享登录上下文和 HTTP transport，保留业务模块适配器 |
| 后端 | Python 3.12、FastAPI、SQLAlchemy 2 异步会话、Alembic 分库迁移 |
| 认证和授权 | Casdoor 提供身份认证，公共库及 Casbin 策略管理应用权限 |
| 数据与依赖 | PostgreSQL 18、Redis 7、MinIO；Casdoor 使用独立认证数据库 |
| 本地部署 | Docker Compose；Nginx 提供前端并将 `/api` 转发到唯一后端 |

业务库为 `case_business`、`compliance_business`，公共库为 `platform_common`。跨库引用通过 ID 和应用层查询补全。Elasticsearch 为可选部署项，AI、搜索及外部系统对接的现状见[已知问题](docs/known-issues.md)。

## 本地启动

准备 Git、Docker Desktop（Linux containers）、PowerShell；基本测试脚本需要 Python 3.12+。完整容器构建不要求宿主机安装 Node.js，首次构建需要访问镜像和软件包仓库。

```powershell
git clone git@github.com:Captain-WY/compliance-evaluation.git
cd compliance-evaluation
./scripts/dev/bootstrap.ps1
./scripts/dev/start.ps1
./scripts/dev/smoke.ps1
```

- 前端默认地址：<http://localhost:3010>。
- API 文档默认地址：<http://localhost:8010/docs>。
- Casdoor 默认地址：<http://localhost:8000>。
- 测试账号和随机密码：本机 `.local/dev-accounts.md`；端口以该文件及 `deploy/local/.env` 为准。
- 初始化创建开发数据库，保留适配后的基础种子，不迁移旧业务数据和附件。重复启动保留已有凭据和数据。

```powershell
# 使用已构建镜像启动
./scripts/dev/start.ps1 -NoBuild
# 停止本项目服务，保留命名卷
./scripts/dev/stop.ps1
```

依赖启动、日志及账号说明见[本地部署](docs/deployment/local.md)。开发配置仅绑定本机地址。

## 代码目录

```text
frontend/src/
  app/                   统一路由、左侧导航及页面容器
  platform/              登录上下文、HTTP transport、开发提示
  modules/               cases、compliance-shared、inspections、assessments、system
backend/
  app/main.py            唯一 FastAPI 入口
  app/core/              配置、三库连接及模型注册
  app/platform/          公共身份、权限、字典及文件
  app/modules/           cases 与 compliance 业务实现
  app/adapters/          保留业务的兼容及持久化适配
  app/resources/         构建必需的 YAML 等运行资源
  migrations/            common、cases、compliance 三套迁移
deploy/local/            Docker Compose 和容器配置
scripts/dev/             初始化、启停、基本测试与发布检查
scripts/regression/      五角色业务回归脚本
docs/                    当前架构、开发、部署、测试及问题记录
```

## 开发方式与验证

原项目采用先完成 mock 前端、再补齐后端的方式。合并后继续以前端页面及归档原型作为业务和视觉参考，开发前先核对字段、API、权限和状态流转；真实保存必须由后端持久化并可重新读取。原型中的占位交互不等于已实现能力。

本地前端开发建议使用与 Docker 构建一致的 Node.js 24，命令及后端事务约定见[开发指南](docs/development/guide.md)。AI 助手从 [AGENTS.md](AGENTS.md) 进入；[CLAUDE.md](CLAUDE.md) 复用同一套规范。

| 验证记录 | 范围与结论 |
| --- | --- |
| [合并基本回归](docs/testing/smoke-report.md) | 部署、基础接口、角色入口及部分重启读回；属于合并阶段证据 |
| [五角色业务回归](docs/testing/role-regression-report.md) | 2026-10-03 登记 18 项确认缺陷、2 项能力缺口、1 项规则待确认，未通过完整业务验收 |
| [导航验收](docs/testing/navigation-regression.md) | 统一左侧菜单、页面容器及角色边界；构建通过，保留 32 项原有类型诊断 |

修复工作从[问题台账](docs/testing/role-regression-issues.md)开始。历史通过项不覆盖后续发现的缺陷。

## 文档与历史参考

[文档索引](docs/README.md)汇总当前有效入口。两个原项目的代码、文档、Git 历史和 `frontend_backup` 均保存在仓库外本地目录，详情见[归档与参考说明](docs/development/reference-guide.md)。这些档案不提交到新仓库，也不是构建或启动依赖。
