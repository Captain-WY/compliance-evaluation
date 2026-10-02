# compliance-evaluation

案件管理、合规检查、合规考核和系统管理的统一开发项目。采用一个 React 前端、一个 FastAPI 后端，使用 Casdoor 登录和 Casbin 权限策略。项目处于开发阶段，本次合并以启动和基本回归为验收范围。

## 本地启动

需要 Docker Desktop（Linux containers）、PowerShell；基本测试脚本需要 Python 3.12+。首次构建需要可访问镜像和软件包仓库的网络。

```powershell
git clone git@github.com:Captain-WY/compliance-evaluation.git
cd compliance-evaluation
./scripts/dev/bootstrap.ps1
./scripts/dev/start.ps1
./scripts/dev/smoke.ps1
```

默认前端为 <http://localhost:3010>，API 文档为 <http://localhost:8010/docs>。若端口已占用，以启动脚本输出和 `deploy/local/.env` 为准。测试账号角色见 [本地部署](docs/deployment/local.md)，实际随机密码由初始化脚本写入本机 `.local/dev-accounts.md`，不提交。

```powershell
# 停止服务，保留数据库和附件
./scripts/dev/stop.ps1
```

初始化使用全新开发数据库，不迁移原系统业务数据或附件；保留适配后的基础字典和权限种子。不要将本地开发配置直接用于公网部署。

## 目录

| 目录 | 用途 |
|---|---|
| `frontend/` | 统一入口和原业务页面 |
| `backend/app/modules/cases/` | 案件业务 |
| `backend/app/modules/compliance/` | 检查和考核业务 |
| `backend/app/platform/` | 公共身份、权限、字典和文件 |
| `backend/app/resources/` | 随项目发布的运行资源 |
| `deploy/local/` | 自包含 Docker Compose 部署 |
| `scripts/dev/` | 初始化、启停、基本测试和发布检查 |

案件数据库 `case_business`、合规数据库 `compliance_business` 和公共数据库 `platform_common` 分开维护，Casdoor 使用独立认证库。原项目代码、旧文档和前端原型保存在仓库外本机档案中。

## 开发入口

- [项目规范](AGENTS.md)
- [架构与分库](docs/architecture/overview.md)
- [本地部署](docs/deployment/local.md)
- [基本回归报告](docs/testing/smoke-report.md)
- [已知问题和后续范围](docs/known-issues.md)
- [历史参考说明](docs/development/reference-guide.md)
