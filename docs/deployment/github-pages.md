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

- 复用现有 Cocos 产物校验、游戏测试、构建、Shell 测试和 Pages 浏览器冒烟测试。PR 仅验证和上传临时产物，没有发布或写仓库权限。
- 每次构建只检出触发分支。发布阶段在同一 `pages-publish` 队列中执行，先读取最新 `gh-pages`，只替换当前分支目录，再打包整个站点。目录替换会移除该版本已经删除的旧资源。
- 同一源码分支的新推送仅替换尚未开始的旧运行；已开始的发布完成后再运行下一次，避免中途取消破坏保存/发布顺序。跨分支发布使用 `queue: max`，三次发布不会争抢同一个待运行名额。
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
pnpm test:pages
Remove-Item Env:PAGES_BASE_PATH
```

构建使用相对资源路径，不需要为三个环境改写 Vite base 或重复生成代码。CI 会在触发分支对应的子路径跑浏览器测试。

三个环境共用一个 Pages 站点及容量；合并产物超过 1 GiB 时发布脚本失败，防止持续累积不可部署内容。源码产物的单文件必须小于 100 MiB；移动 ZIP 不受 Git 单文件限制，因为不存入产物分支。持续增长的 `gh-pages` 历史也会增加仓库大小，应按实际容量再考虑外部资源存储。

2026-10-02 使用同一实际构建模拟三个环境，合计 **1,008,535,427 字节（约 962 MiB）**，已经接近官方标示的 1 GB 站点限制；本地 1 GiB 预算检查不能代替首次远端部署验收。后续素材增长前需处理容量，例如把移动下载包移至独立分发存储。

这些路径共用同一 origin，浏览器 localStorage/IndexedDB 存档不会因路径不同自动隔离；本次分离的是构建内容与访问路径，没有新增后端或账号/存档隔离。

`queue: max` 使用 GitHub 官方排队功能。actionlint 1.7.12 尚未支持该字段；本地检查只忽略这一项旧 schema 警告，不能因此删除排队配置，否则多个分支同时发布会互相取消待运行任务。

参考：[官方 Pages Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[发布队列](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Pages 容量](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[Git 单文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。
