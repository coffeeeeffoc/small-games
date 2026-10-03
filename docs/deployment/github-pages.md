# GitHub Pages 三环境部署

| 源码分支 | 用途 | 路径                 | 版本信息                            |
| -------- | ---- | -------------------- | ----------------------------------- |
| `main`   | 正式 | `/small-games/`      | `/small-games/deployment.json`      |
| `dev`    | 开发 | `/small-games/dev/`  | `/small-games/dev/deployment.json`  |
| `test`   | 测试 | `/small-games/test/` | `/small-games/test/deployment.json` |

每个版本信息文件记录 `branch` 和完整 `sha`。独立游戏和分享路由也位于各自环境路径下，例如 `/small-games/dev/#/games/merge-front` 与 `/small-games/dev/games/merge-front/index.html`。

## 首次启用

1. 将本次配置提交推送到 `main`。仓库 **Settings → Pages → Source** 保持 **GitHub Actions**。
2. 在 **Settings → Environments → github-pages → Deployment branches and tags** 中允许 `main`、`dev`、`test` 三个分支。2026-10-02 已补齐并核验三个分支的权限；修改 YAML 不会自动修改该权限。
3. 等待 main 的 Pages 工作流成功。它会创建只存构建产物的 `gh-pages` 分支；不要手动编辑该分支，也不要把 Pages Source 改成分支发布。仓库规则需允许 `GITHUB_TOKEN` 向 `gh-pages` 写入，部署任务已声明 `contents: write`。
4. 从包含本次配置的 main 创建并推送 `dev`、`test`，各自成功发布后才会出现对应入口。若分支已存在，把配置合并到各分支。可以在 Actions 的 Pages 工作流中选择对应分支手动运行；其他分支和标签不会发布。

首次必须先发布 main；当产物状态缺失时，dev/test 发布会明确失败，避免用预览版覆盖已有正式站点。main、dev、test 的代码和子模块指针可以分别演进，发布流程不会自动合并源码。

## 发布行为

- 所有 PR、main/dev/test 推送均先检测 Pages 影响范围。文档、已知独立服务和其他平台应用的变更不执行重任务、不发布，但仍返回成功的 `build` 检查；未知路径或无法取得比较基线时保守执行全量验证。PR 仅验证和上传临时产物，没有发布或写仓库权限。
- 验证在 `pages-validate.yml` 中执行：Cocos 制品准备完成后，Pages 构建与逻辑测试并行；构建上传 `pages-build` 后，发布冒烟和游戏浏览器回归独立执行。发布必须等待所选验证全部成功，失败、取消或意外跳过都不能绕过门禁。
- 发布冒烟检查全部游戏入口及静态资源依赖，并在真实 Chromium 中验证懒加载、大厅、代表性分享路由、iframe、手机直开和 Runtime 隔离。游戏浏览器回归保留桌面嵌入、手机触屏和原有玩法断言。
- PR 和 dev 的单游戏变更只执行该游戏的包测试及浏览器回归，子模块指针变更也按对应游戏选择。Shell、共享包、素材、注册表、根脚本和构建配置等变更执行全量。main/test 的相关推送、手动运行始终全量；每日北京时间 02:00 在默认分支执行全量验证，定时运行不发布。
- dev 以 `gh-pages/dev/deployment.json` 中最近已验证并保存的 SHA 为比较基线，累计覆盖此前被取消或失败运行的改动；后续仅改文档也不会漏掉尚未验证的代码。无法读取基线或找到该提交时执行全量。
- Turbo 缓存将仓库级素材、平台适配、脚本和 Runtime 规则纳入输入；两款 Cocos 的构建任务始终校验并复制本次下载的制品，避免旧 Turbo 缓存覆盖新的已验证输出。Cocos 制品自身仍使用源码 hash 缓存。
- 每次构建只检出触发分支。发布阶段在同一 `pages-publish` 队列中执行，先读取最新 `gh-pages`，只替换当前分支目录，再打包整个站点。目录替换会移除该版本已经删除的旧资源。
- 同一源码分支的新运行会取消过时的验证阶段，避免长回归拖延新提交。定时验证使用独立并发组。已排队或正在执行的发布不随验证取消；跨分支发布仍使用 `pages-publish` 的 `queue: max`，保存与发布一起完成。
- 合并后的 Pages artifact 上传成功后，先保存已验证产物，再调用 GitHub Pages API。部署版本使用 `gh-pages` 产物提交 SHA，避免三个源码分支同 SHA 时复用旧部署。发布后会读取线上所有已有环境的 `deployment.json` 并核对版本，最多等待缓存刷新 5 分钟；不一致则任务失败。[上游同 SHA 部署问题](https://github.com/actions/deploy-pages/issues/383)。
- 若部署或线上核验失败，`gh-pages` 中仍保留新产物；重跑失败任务或下次发布可恢复。`gh-pages` 是持久构建状态，不等同于线上已成功部署的证明。
- Android 的 `/small-games/mobile/update.json` 和 `web.zip` 始终只包含正式版。ZIP 在发布任务中从 main 产物重新生成，不进入 Git；dev/test 没有单独的移动下载包。原生 mobile 工作流仍只随 main 推送运行。

## 本地验证与容量

```powershell
python scripts/test-pages-deploy.py
pnpm test:game-config
pnpm check:games
pnpm build:pages
$env:PAGES_BASE_PATH = '/small-games/dev/'
pnpm test:pages:smoke
# 只验证受影响的独立游戏；不设置 PAGES_GAME_IDS 或置空时执行全部游戏。
$env:PAGES_GAME_IDS = '["merge-front"]'
pnpm test:pages:games
Remove-Item Env:PAGES_GAME_IDS
Remove-Item Env:PAGES_BASE_PATH
```

`pnpm test:pages` 保留完整验证入口，依次执行发布冒烟和游戏回归；`pnpm test:pages:selection` 验证范围选择与静态制品检查规则。`PAGES_GAME_IDS` 是注册表 ID 的 JSON 数组，未知 ID 或格式错误会立即失败，`[]` 仅保留内置游戏和宿主检查。

游戏回归按加载、交互、手机加载和手机交互输出开始日志与耗时，并持续更新 `.scratch/game-integration/report.json`；失败时也保留已完成结果和当前阶段。CI 上传该目录及发布冒烟的 `.scratch/pages-host` 诊断，便于定位慢点。

构建使用相对资源路径，不需要为三个环境改写 Vite base 或重复生成代码。CI 会在触发分支对应的子路径跑浏览器测试。

三个环境共用一个 Pages 站点及容量；合并产物超过 1 GiB 时发布脚本失败，防止持续累积不可部署内容。源码产物的单文件必须小于 100 MiB；移动 ZIP 不受 Git 单文件限制，因为不存入产物分支。持续增长的 `gh-pages` 历史也会增加仓库大小，应按实际容量再考虑外部资源存储。

2026-10-02 使用同一实际构建模拟三个环境，合计 **1,008,535,427 字节（约 962 MiB）**，已经接近官方标示的 1 GB 站点限制；本地 1 GiB 预算检查不能代替首次远端部署验收。后续素材增长前需处理容量，例如把移动下载包移至独立分发存储。

这些路径共用同一 origin，浏览器 localStorage/IndexedDB 存档不会因路径不同自动隔离；本次分离的是构建内容与访问路径，没有新增后端或账号/存档隔离。

`queue: max` 使用 GitHub 官方排队功能。actionlint 1.7.12 尚未支持该字段；本地检查只忽略这一项旧 schema 警告，不能因此删除排队配置，否则多个分支同时发布会互相取消待运行任务。

参考：[官方 Pages Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[发布队列](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Pages 容量](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[Git 单文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。
