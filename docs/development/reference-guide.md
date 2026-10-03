# 原项目归档与参考说明

原 `compliance-evaluation` 和 `sld-cms` 的代码、文档、前端 mock 原型、原 Git 历史及合并前未提交文件，均保存在新仓库之外。本机定位索引为忽略的 `.local/archive-index.json`。

## 本机目录

| 位置 | 保存内容与用途 |
| --- | --- |
| `E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/sources/` | 按清单保存的两个原项目源码快照，包含原文档、frontend_backup 和原 Git 文件；用于完整性核验及只读参考 |
| `E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/source-manifest.json` | 快照中每个文件的相对路径、大小和 SHA-256 |
| `E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/working-directories/` | 合并结束时移出的原工作目录，包含旧 .git、依赖目录等本地内容 |
| `E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/merge-reference/` | 合并规划、基线、执行脚本与历史过程资料 |
| `E:/weiyu/merge-backups/compliance-evaluation/2026-10-02-m0/` | 两个原项目的 Git bundle、M0 快照、恢复样本及基线交付资料 |

每个项目在 `sources/<项目名>/` 和 `working-directories/<项目名>/` 下均独立保存。源码快照排除了清单声明的 node_modules、虚拟环境及部分缓存；完整原工作目录另行保留。清单中的捕获位置是合并前路径，校验文件应使用当前 `sources/` 作为基准目录。

这些目录与当前 Git 工作区分离，适合作为本地历史参考。原项目 `.git` 留在档案内用于恢复历史，当前应用目录只使用新仓库自己的 Git；没有为清理工作区而销毁原历史。归档和 M0 备份目前位于同一 E 盘，属于本地恢复资料，不等同于异地备份。

## 2026 年 10 月 3 日复核

重新按清单核验全部文件大小及 SHA-256，并检查实际文件集合：

| 项目 | 快照文件数 | docs 下文件数 | frontend_backup 下文件数 |
| --- | ---: | ---: | ---: |
| 原合规检查及考核 | 3,367 | 886 | 131 |
| 原案件管理 | 1,142 | 340 | 120 |
| 合计 | 4,509 | 1,226 | 251 |

结果：缺失 0、内容变化 0、额外文件 0。两套原工作目录的 Git、docs 和 frontend_backup 均存在；两个 Git bundle 的 `git bundle verify` 均返回 0。合并过程参考目录另有 142 个文件。

本机审计结果保存在 `.local/archive-audit-20261003.json`。Git bundle 验证确认其格式及所需历史可用；本轮没有重新执行完整恢复演练，也没有逐文件哈希核验原工作目录中的依赖和缓存。

## 如何查阅

- **页面和交互**：查看 `sources/<项目名>/frontend_backup/`，再与当前 `frontend/src/modules/` 的组件及 API 适配对照。
- **合规契约与业务语义**：按需查看原合规项目 `docs/ai-first/`、`docs/design/`、`docs/sit/`，确认其版本和历史阶段。
- **案件业务设计**：按需查看原案件项目 `docs/design/v1/`、`docs/adr/`、`frontend/FRONTEND_GUIDELINES.md`；旧文档中的部分交叉链接已经失效，不据此假定文件仍存在。
- **原提交历史或未提交工作**：先查看原工作目录及 M0 快照；恢复操作应在另外的临时目录执行，保留归档原件。
- **合并决策及基线**：查看 `merge-reference/` 和 M0 交付资料；当前工程规则仍以根目录 AGENTS.md 为准。

旧文档描述的产品目标、API 和状态规则可作为设计输入；其旧端口、独立服务、固定证书路径、工具专属规定、生产能力声明和阶段完成状态不直接继承。

## 本轮吸收与调整

| 原资料中的内容 | 合并后的处理 |
| --- | --- |
| 合规系统以前端为事实源、先核对契约再实现 | 保留业务与视觉参考，要求核对当前 API、权限、状态机和验收条件；不恢复已归档的全套工作包门禁 |
| 合规系统区分真实动作与 mock 展示、验证文件引用和重启读回 | 纳入 AGENTS.md 和开发指南，禁止把静默模拟或成功提示作为持久化证据 |
| 案件系统字典驱动、模板生成实例、财务并发控制 | 适配到公共字典库、当前业务模块和实际会话提交方式 |
| 案件系统分层、异步访问、软删除、审计和前端状态处理 | 保留为开发要求，按当前模型及模块差异应用，不宣称所有遗留代码均已达标 |
| 精简入口、证据落盘、阶段检查点 | README 负责项目入口，AGENTS.md 负责规范，CLAUDE.md 引用共享规则，docs/README.md 汇总专题 |
| 旧启动命令、旧目录、工具绑定、生产级与全量通过声明 | 以当前脚本、代码和专项验证记录替换 |

## Git 与构建边界

原项目目录、frontend_backup、历史文档归档和 `.local/` 均不提交；Git 排除规则和 `scripts/dev/check_release.py` 负责检查。Docker 构建上下文仅包含当前 backend、frontend、deploy 所需内容。

新机器无需本机档案即可初始化和启动。应用需要的 YAML、JSON 等运行资源应保存在 `backend/app/resources/`，不得通过绝对路径或运行时扫描读取旧工程。当前数据库和附件卷与源代码档案分开维护，本次归档不表示迁移了旧业务数据。
