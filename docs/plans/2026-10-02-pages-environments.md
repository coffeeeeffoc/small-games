# GitHub Pages 三环境实施计划

**Goal:** main、dev、test 分别发布正式、开发、测试内容，更新一个分支时保留另外两个版本。

**Architecture:** 沿用现有构建和官方 Pages Actions；`gh-pages` 仅保存三个分支已验证的静态产物，发布任务串行合并为一个站点。正式版保留根路径，开发与测试版位于 `dev/`、`test/`。移动端 ZIP 超过 Git 单文件限制，只在组装正式站点时重新生成。

**Tech Stack:** GitHub Actions、Git、Python 标准库、现有 pnpm/Vite/Playwright。

1. 修改 CI 与 Pages 的 push 分支；保留 PR 验证且禁止 PR 发布；部署阶段排队，保护三份产物。
2. 增加产物更新/合并脚本和一个可运行回归检查，覆盖首次发布、版本保留、过期文件清理、非法输入和容量限制。
3. 调整现有注册检查与 Pages 冒烟测试，使其验证实际环境子路径。
4. 补充 README 中的路径、首次 main 发布、分支创建与 Pages 权限配置说明。
5. 运行脚本回归、注册检查、格式检查及真实构建的根路径/嵌套路径浏览器验证。发布前拉取最新 main，验证后提交推送，分别报告 Git 同步结果与远端工作流状态。
