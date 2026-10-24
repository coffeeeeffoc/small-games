# 统一 H5 游戏包构建

本文件维护当前批量入口的配置与产物边界。通用产品要求见[游戏开发规范](../game-development.md)，广告接口与多渠道接线见[广告指南](taptap-rewarded-ads.md)，上架资料在各游戏 `publishing/` 中按[统一规范](../game-publishing.md)维护。可扩展多平台不表示当前命令已经支持所有目标。

`pnpm build:games` 按根目录 `game-build.local.mjs` 打包围捕小队、街区追捕与象五子棋的 TapTap H5 版本。带注释的模板见 `infra/builds/games.example.mjs`。三款游戏只保留 H5，原生小游戏目标会在编译前报错。

五款游戏的广告＋统一基础服务使用 `infra/builds/five-taptap-h5.mjs`，通过 `pnpm build:games --config infra/builds/five-taptap-h5.mjs` 构建。AppID、广告位和注意事项见 [TapTap 广告指南](taptap-rewarded-ads.md)。

```sh
pnpm build:games --dry-run
pnpm build:games
pnpm build:games --config path/to/config.mjs
```

配置随 Git 管理，保留各 H5 应用的公开广告位与 Tap 服务信息。JavaScript 配置使用 `export default`，支持注释；显式配置也可为 `.js` / `.json`。默认 `.mjs` 缺失时才读取旧 `game-build.local.json`；语法或导入错误直接终止。

## 六款游戏一键 TapTap H5

```powershell
pnpm build:taptap:h5 --dry-run
pnpm build:taptap:h5
```

配置文件为 `infra/builds/six-taptap-h5.mjs`，默认六款全选、无广告、无后端。可缩减 `games` 只构建所需游戏。Creator 3.8.8 用于浪湾卡丁车和夜航守望的真实 Web Mobile 构建；需要时设置 `COCOS_CREATOR` 为本机 Creator 可执行文件路径。其余四款使用现有 Vite 或静态构建，无新增依赖。

| ID                           | 游戏名称            | 手机方向           | 配置广告后增加的奖励入口       |
| ---------------------------- | ------------------- | ------------------ | ------------------------------ |
| carding-car                  | 浪湾卡丁车          | 横屏，竖持旋转兜底 | 完成比赛后的金币补给，每场一次 |
| vibeJam-myself-history-guess | 此时此地            | 竖屏               | 练习中的场景提示               |
| wulong-city                  | 乌龙城              | 横屏，竖持仍可玩   | 机关指引                       |
| night-overwatch              | 夜航守望            | 横屏，竖持旋转兜底 | 领取补给、增益                 |
| travel-bund                  | 江风入境 · 外滩漫游 | 横屏，竖持旋转兜底 | 摄影任务的到观景点             |
| letters-words2               | 词屿 · 字母叠叠乐   | 竖屏               | 逐字提示                       |

将 `ads` 改为 `[true]` 并在 `targets[0].adUnits` 填写每款自己的经 TapTap MCP 核实的 H5 广告位 ID 即可生成启用版；`[false, true]` 同时生成两种变体。六款的空 ID 即使选择广告开启也会保持隐藏，实际状态记录在构建计划和产物配置中。原有免费操作继续可用。不得把应用 AppID 当作广告位 ID：H5 的应用身份在上传后台关联，广告位属于该应用；原生 `appIds` 不适用于此 H5 配置。

奖励复用现有 TapTap provider，只在严格完成回调后发放；取消、错误、切页不发奖励，长视频播放期间不会被准备超时误取消。普通 Web 没有 TapTap SDK 时不会模拟成功。需在配置正式广告位后完成宿主验收。

五款正式 AppID 对应的广告与基础后端配置使用 `infra/builds/five-taptap-h5.mjs`，需显式指定 `--config infra/builds/five-taptap-h5.mjs`。基础后端提供各游戏独立匿名身份、个人资料读写及能力元数据；尚未实现服务端计分验证的游戏不开放排行榜提交。江风入境仍使用离线配置。插屏仅在预加载完成的自然结算节点尝试，频控及接入注意事项见统一广告指南。

每款 ZIP 根目录包含 `dist/index.html`，输出目录为 `outputs/game-builds/<batch>/taptap-h5/`。这些是 H5 包体，不是原生 `game.zip`，也不是宣传素材外层 ZIP。构建检查相对资源、入口和 ZIP 完整性；256 MiB 解压预算仅为本地 ZIP 安全保护，不代表 TapTap 的当前包体额度或平台审核通过。

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

`games` 显式选择游戏，空数组不会自动全选；可选名单以 `scripts/build-games.mjs` 及 `scripts/h5-ad-config.mjs` 的校验为准，上面的六款预设不是全部支持名单，当前也有归途站、神机合阵等后续调用者。目标仅支持 `taptap` / `h5`，重复目标、原生 `appIds` / `release` 和未知字段均拒绝。应用归属由 H5 上传后台关联；原三款可选 `tapServices` 按游戏保存 `enabled` 和 H5 应用公开的 `appConsoleId`、`appId`、`leaderboardId`，与统一后端及广告开关分别控制。

广告配置按 `targets[].adUnits[gameId]` 传入，构建器转为 `H5_ADS_ENABLED` 与 `TAPTAP_<GAME>_AD_UNIT_ID`，由 `prepareH5Ads()` 生成运行配置；游戏只消费公共奖励端口。新增目标沿现有构建描述和校验扩展，不在游戏页面中拼装 SDK／广告位。Cocos 原生自动注入的实际范围及独立转换流程见[广告指南](taptap-rewarded-ads.md#平台扩展与实际支持2026-10-22-核对)，不属于本 H5 配置 schema。

`ads` 与 `backend` 为布尔数组，按所有组合生成包；目标内可覆盖全局值。原三款广告开启时必须填写所选游戏的 H5 广告位；新增六款的空广告位会关闭奖励入口。后端关闭会清空产物的 API 地址，开启时要求公开 HTTPS；`localBackend: true` 只允许本机 H5 的 loopback HTTP。缺失配置会在首款编译前报错。

版本 1 配置继续读取，沿用旧 H5 输出布局。升级版本 2 时将 `adUnits` 放到目标中。

## 输出与验证

版本 2 输出到 `outputs/game-builds/<batch>/taptap-h5/`，批次根的 `builds.json` 汇总交付文件。每款各变体有独立 ZIP 和 JSON 清单，并在游戏内 `dist/h5-packages/<batch>/` 保留副本。历史批次不会覆盖，ZIP 保留 `dist/index.html` 结构，选择单款 ZIP 上传至 TapTap H5 入口。

`--dry-run` 只校验并列出计划，不创建输出。正式构建串行执行，允许未提交源码，不自动上传、提审、部署或提交代码。`qualityChecks: "not-run"` 与 `platformAcceptance: "not-run"` 表示本命令未执行质量和平台验收；仍需实际检查功能、宿主广告和真机表现。

首次执行需使用仓库规定的 Node / pnpm，并运行 `pnpm install --frozen-lockfile`。其他游戏沿用自身构建入口；`games:build` / `build` 是工作区编译命令，不替代 H5 渠道包交付。

## 十三款奖励游戏的 H5 配置

本轮支持名单和可选奖励见[广告接入表](taptap-rewarded-ads.md#十三款可选激励接入2026-10-24)。根 game-build.local.mjs 保留已有配置并加入十三款，新增空广告位保持关闭。一炮拆城未加入。moss-garden 对应源码目录 games/local/game-moss-garden。构建器使用各游戏现有 Creator、Cocos 源码或 Vite 入口，不更换引擎。

先执行 pnpm build:games --dry-run 检查选择、广告有效开关与后端关闭状态，再执行 pnpm build:games。需要只编译一款时缩减配置中的 games；每款 ID 必须由该应用的 MCP 返回。此次新增游戏不支持 backend:true。原有六款/五款预设成员保持原样。

灰烬防线`ashfall-front`新增Creator 3.8.8 Web Mobile H5编译，横屏。它接受统一配置中的单游戏选择和广告开关，不支持`backend:true`；缺广告位时默认关闭。应用998795当前未开通广告，需开通后通过MCP重查，不能复用其他游戏的ID。源码匹配预构建变量为`ASHFALL_FRONT_PREBUILT_DIR`，实际交付和素材见游戏README与publishing/STATUS.md。
