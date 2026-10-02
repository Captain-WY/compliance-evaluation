# 历史参考与归档

原 `compliance-evaluation` 和 `sld-cms` 的源代码、未提交改动、前端 mock 原型、文档及原 Git 历史已独立归档。它们不进入新项目 Git，也不作为构建或运行依赖。

本机参考位置由忽略的 `.local/archive-index.json` 记录。交付机器上的源归档为 `E:/weiyu/merge-archives/compliance-evaluation/2026-10-02/sources`；M0 备份另行保留在 `E:/weiyu/merge-backups/compliance-evaluation/2026-10-02-m0`。

源归档对 4,509 个文件完成清单校验。后续开发可以对照原 `frontend_backup` 理解页面效果，但当前真实 API 和合并后代码是开发入口。新机器无需这些档案即可初始化和启动项目。

切换完成后，原工作目录（含原 `.git` 和本机开发文件）整体移至同一归档根目录的 `working-directories/`。旧合并计划和基线资料另存 `merge-reference/`；新项目不再包含这些旧目录。
