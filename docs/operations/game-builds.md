# 统一 H5 游戏包构建

`pnpm build:games` 按根目录 `game-build.local.mjs` 打包围捕小队、街区追捕与象五子棋的 TapTap H5 版本。带注释的模板见 `infra/builds/games.example.mjs`。三款游戏只保留 H5，原生小游戏目标会在编译前报错。

```sh
pnpm build:games --dry-run
pnpm build:games
pnpm build:games --config path/to/config.mjs
```

配置随 Git 管理，保留各 H5 应用的公开广告位与 Tap 服务信息。JavaScript 配置使用 `export default`，支持注释；显式配置也可为 `.js` / `.json`。默认 `.mjs` 缺失时才读取旧 `game-build.local.json`；语法或导入错误直接终止。

## 配置

```js
export default {
  version: 2,
  games: ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'],
  targets: [{ platform: 'taptap', type: 'h5', adUnits: {}, tapServices: {} }],
  ads: [false],
  backend: [false],
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
  localBackend: false,
};
```

`games` 显式选择游戏，空数组不会自动全选。目标仅支持 `taptap` / `h5`，重复目标、原生 `appIds` / `release` 和未知字段均拒绝。应用归属由 H5 上传后台关联；可选 `tapServices` 按游戏保存 H5 应用公开的 `appConsoleId`、`appId`、`leaderboardId`。

`ads` 与 `backend` 为布尔数组，按所有组合生成包；目标内可覆盖全局值。广告开启时必须填写所选游戏的 H5 广告位。后端关闭会清空产物的 API 地址，开启时要求公开 HTTPS；`localBackend: true` 只允许本机 H5 的 loopback HTTP。缺失配置会在首款编译前报错。

版本 1 配置继续读取，沿用旧 H5 输出布局。升级版本 2 时将 `adUnits` 放到目标中。

## 输出与验证

版本 2 输出到 `outputs/game-builds/<batch>/taptap-h5/`，批次根的 `builds.json` 汇总交付文件。每款各变体有独立 ZIP 和 JSON 清单，并在游戏内 `dist/h5-packages/<batch>/` 保留副本。历史批次不会覆盖，ZIP 保留 `dist/index.html` 结构，选择单款 ZIP 上传至 TapTap H5 入口。

`--dry-run` 只校验并列出计划，不创建输出。正式构建串行执行，允许未提交源码，不自动上传、提审、部署或提交代码。`qualityChecks: "not-run"` 与 `platformAcceptance: "not-run"` 表示本命令未执行质量和平台验收；仍需实际检查功能、宿主广告和真机表现。

首次执行需使用仓库规定的 Node / pnpm，并运行 `pnpm install --frozen-lockfile`。其他游戏沿用自身构建入口；`games:build` / `build` 是工作区编译命令，不替代这三款的 H5 渠道包交付。
