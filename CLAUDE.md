# Claude Code 项目入口

本项目使用 [AGENTS.md](AGENTS.md) 作为统一工程规范，Claude Code 与其他开发工具遵循同一套约定。本文件只提供阅读顺序和工作提示，避免维护两份相互冲突的规则。

## 阅读顺序

1. [README](README.md)：业务模块、技术架构、启动方式和当前验证状态。
2. [AGENTS.md](AGENTS.md)：架构、权限、页面保真、事务、归档与验收规则。
3. [开发指南](docs/development/guide.md)：按当前目录开发、联调和执行检查。
4. 当前任务相关代码、[问题台账](docs/testing/role-regression-issues.md)及专项报告；部署任务另读[本地部署](docs/deployment/local.md)。

## 工作提示

- 先检查工作区与当前任务边界，保留未提交修改。重要阶段保存本地检查点，不把整个历史文档库一次性读入上下文。
- 使用当前 PowerShell 和 Docker 脚本；前后端主入口为 `frontend/src/app/` 与 `backend/app/main.py`。
- 原工程只读参考通过[归档说明](docs/development/reference-guide.md)查找。旧系统中的 WSL、dev_manager、独立端口、证书路径和阶段计划均不直接套用。
- mock 原型帮助判断业务意图和页面效果；写入、鉴权、状态流转及文件链路必须有真实服务证据。
- 交付说明写清改动、已执行检查、失败与未验证项。遵循 AGENTS.md 的提交前检查，区分本地提交和远端推送。
