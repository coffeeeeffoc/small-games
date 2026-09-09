# 独立 Game 通过 Git submodule 接入

按 2026-09-10 的迁移要求，tower-defense-game、xiangqi-five、office-slacking 保留各自仓库，在 `games/*` 作为 Git submodule 纳入 pnpm workspace。这是 ADR-0001 对独立仓库 Game 的例外；现有平台包仍使用普通 workspace 目录。

三个 Game 都提供 `dev`、`test`、`build`，自行维护 pnpm 锁文件和 GitHub Actions Pages 发布。父仓库记录明确 commit，递归检出后使用根锁文件统一安装。依赖变更需更新独立锁文件和根锁文件；子仓库先推送，父仓库再提交可获取的版本指针。父仓库不会自动追踪子仓库最新提交。

Web Shell 构建将三个 Game 的静态产物复制到自己的 `public/games/`，以同源 iframe 展示，退出时销毁 iframe。独立入口、CSS、React/Three.js 版本互不干扰，部署不依赖 Pages 在线可用性。这里运行的是固定提交的可信代码，iframe 用于文档隔离，并非远程不可信制品的安全沙箱。

这些 Game 保留自身会话与存储，当前不接入 Game Host 的云存档、广告和 Runtime 版本选择。ADR-0002 的远程制品校验和沙箱装载流程保持独立。B 站原生 Shell 不支持这些 DOM/WebGL 游戏，后续接入需独立适配；象五子棋静态模式提供同屏对弈，好友房间仍需 Node 服务。

每次子仓库 push / PR 编译并测试，仅 main 或 main 上手动触发会部署对应 Pages，避免功能分支覆盖正式站点。使用独立仓库权限的官方 Pages Actions，不需要额外 PAT。
