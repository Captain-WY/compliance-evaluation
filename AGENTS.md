# compliance-evaluation 开发入口

本项目正在按已批准的v2计划合并为一个React前端、一个FastAPI后端。当前任务只完成合并、启动和简单回归，不展开功能优化。

## 当前约定

- 生产代码位于顶层frontend、backend、deploy。原compliance-evaluation、sld-cms目录在切换前只读，完成后保存在仓库外本地档案，不进入Git。
- 一个API进程，案件case_business、合规compliance_business、公共platform_common各自独立database；Casdoor独立认证库。
- 公共身份、权限、字典由公共层维护，不能以用户名猜测权限。跨库引用使用服务/ID映射，不设置跨库外键。
- 第一层菜单固定为案件管理、合规检查、合规考核、系统管理；保留原业务页面及多角色边界。
- 新环境不迁移旧业务数据；保留适配后的基础种子，初始化须幂等。不要操作无关容器或删除未知数据卷。
- 真实env、测试密码、私钥、历史档案和原型都不提交。必要运行YAML放backend/app/resources，应用不得依赖本机档案路径。
- 以docs/development/merge-progress.md记录检查点。原有非阻塞问题进入docs/known-issues.md，不把历史失败当已通过。
- PowerShell文件操作使用LiteralPath，递归移动/删除前验证绝对路径范围；文本明确UTF-8。

合并期间文件责任：backend由后端执行者、frontend由前端执行者、deploy及bootstrap/start/stop由部署执行者维护，主任务负责集成smoke和文档。改他人文件前先协调。
