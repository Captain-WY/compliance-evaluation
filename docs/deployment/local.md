# 本地 Docker 部署

## 初始化和启动

准备 Docker Desktop 的 Linux containers 模式及 PowerShell。首次启动需要网络下载官方镜像和依赖包。

```powershell
./scripts/dev/bootstrap.ps1
./scripts/dev/start.ps1
```

bootstrap 幂等生成 `deploy/local/.env`、`.local/casdoor-init.json` 和 `.local/dev-accounts.md/json`。已有配置不会在重复启动时轮换密码。start 等待依赖健康、准备 MinIO bucket、初始化 Casdoor 测试身份、执行数据库迁移和种子，最后启动前后端。健康等待有超时，失败时保留日志和数据供诊断。

| 服务 | 默认地址 |
|---|---|
| 前端 | http://localhost:3010 |
| API / Swagger | http://localhost:8010/docs |
| Casdoor | http://localhost:8000 |
| MinIO 控制台 | http://localhost:9001 |

首次配置遇端口占用会选用可用端口，实际以 `.local/dev-accounts.md` 及 `deploy/local/.env` 为准。本次交付 MinIO 控制台使用 9002。宿主端口仅绑定 `127.0.0.1`，数据库和 Redis 留在 Compose 内部网络。

## 测试账号

五种本地角色由初始化脚本生成。实际用户名和随机密码见本机 `.local/dev-accounts.md`；机器测试读取同目录 JSON，不将 token 或密码写入测试报告。

| 角色 | 用途 |
|---|---|
| `platform_admin` | 系统管理、公共字典及业务管理验证 |
| `hq_business` | 总部案件、检查和考核 |
| `branch_business` | 分支机构业务及范围验证 |
| `department_business` | 业务部门案件上报与协作 |
| `external_lawyer` | 外聘律师参与案件及权限拒绝验证 |

访问前端登录页，用上述本地账号密码登录。后端向本地 Casdoor 获取真实 token，并校验签名、issuer、audience 和有效期；应用权限来自公共库。登出将当前 token 标记失效。

开发账号不是生产账号。部署文件仅服务本地开发，新环境不迁移原业务记录或附件。

## 常用命令

```powershell
./scripts/dev/start.ps1 -DependenciesOnly
./scripts/dev/start.ps1 -NoBuild
./scripts/dev/smoke.ps1
./scripts/dev/smoke.ps1 -VerifyExisting
./scripts/dev/stop.ps1
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml ps
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml logs --tail 100 backend
```

smoke 需要 Python 3.12+，仅使用标准库。普通运行创建 `MERGE-SMOKE-` 前缀测试记录；`-VerifyExisting` 在重启后读取上次记录。停止脚本保留命名卷，禁止在日常启停中添加 `-v`。

镜像支持通过 `.env` 配置 Python、Nginx 和 Casdoor 官方镜像来源。本次使用 Python 3.12，避免依赖原项目的大型临时镜像。原工程目录与本机归档不参与 Docker build。
