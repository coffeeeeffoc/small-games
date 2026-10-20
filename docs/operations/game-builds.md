# 统一游戏包构建

当前 `game-build.local.mjs` 引用五款广告＋统一基础服务的 `infra/builds/five-taptap-h5.mjs`；AppID、广告位、能力范围和注意事项统一见 [TapTap 广告指南](taptap-rewarded-ads.md)。日常选择游戏、平台、包类型和公开 AppID 后，统一执行 `pnpm build:games`。配置文件为仓库根 `game-build.local.mjs`，随 Git 管理版本；带逐项注释的模板是 `infra/builds/games.example.mjs`。使用 JavaScript 的 `export default`，支持 `//`、`/* … */` 和尾逗号，无需 TypeScript 编译或额外依赖。`cops-robbers`、`cops-robbers-realtime`、`xiangqi-five` 支持下文列出的原生及 H5 目标；另六款仅接入 TapTap H5，见下节。

```powershell
pnpm build:games --dry-run
pnpm build:games
# 也可指定另外一份配置
pnpm build:games --config path/to/config.mjs
```

日常基于最新已提交的 `game-build.local.mjs` 手动调整，先预检、再本地试打；结果符合预期后将配置随代码提交。不合适时，在文件已纳入 Git 后，可用 `git restore -- game-build.local.mjs` 撤销未暂存的修改，恢复到暂存区版本（没有暂存改动时即最近提交版本）。仓库已有配置，不要重新复制模板覆盖 AppID 和已验证选项；仅文件缺失时才从模板复制。

显式 `--config` 也支持 `.js` 和旧 `.json`。默认优先 `.mjs`，仅文件不存在时读取旧 `game-build.local.json`；语法错误或导入失败直接报错，不回退到另一份配置。配置模块由 Node 执行，应保持为本地配置对象。

`--dry-run` 加载配置、校验整批并列出每个包，不启动编译、不创建输出。所有构建串行执行。缺失目标要求的发布 AppID、广告位或服务地址，或者组合不受支持，均在第一款编译前报错；新增六款 H5 的空广告位会关闭奖励入口。构建允许已有未提交源码，不自动提交、上传、提审或部署。

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

五款正式 AppID 对应的广告与基础后端配置使用 `infra/builds/five-taptap-h5.mjs`，也是 `pnpm build:games` 的当前默认值。基础后端提供各游戏独立匿名身份、个人资料读写及能力元数据；尚未实现服务端计分验证的游戏不开放排行榜提交。江风入境仍使用离线配置。插屏仅在预加载完成的自然结算节点尝试，频控及接入注意事项见统一广告指南。

每款 ZIP 根目录包含 `dist/index.html`，输出目录为 `outputs/game-builds/<batch>/taptap-h5/`。这些是 H5 包体，不是原生 `game.zip`，也不是宣传素材外层 ZIP。构建检查相对资源、入口和 ZIP 完整性；256 MiB 解压预算仅为本地 ZIP 安全保护，不代表 TapTap 的当前包体额度或平台审核通过。

## 配置版本 2

下面示例选择三款 TapTap 原生发布包，无广告、无后端。空 AppID 必须替换为该游戏真实的公开 MiniApp ID，不能使用商店数字 ID、其他平台的 ID 或 AppSecret。

```js
export default {
  version: 2,
  // 只打这里选择的游戏。
  games: ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'],
  targets: [
    {
      platform: 'taptap',
      type: 'minigame', // 原生小游戏；H5 是另一个可同时选择的目标。
      release: true, // 缺任意一款 AppID 就报错。
      appIds: {
        'cops-robbers': '',
        'cops-robbers-realtime': '',
        'xiangqi-five': '',
      },
      adUnits: {},
    },
  ],
  ads: [false], // [false, true] 同时生成无广告、有广告两种。
  backend: [false], // [false, true] 同时生成离线、在线两种。
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
  localBackend: false,
};
```

- `games` 是显式选择，无默认全选。
- `targets` 每项描述一个平台和包类型；同一平台可以同时有 H5、原生目标，不能重复同一组合。
- `type: "h5"` 目前仅支持 `platform: "taptap"`。H5 的平台身份由上传后台关联，不接受原生 `appIds` / `release`。
- `type: "minigame"` 表示 Cocos 原生小游戏，默认 `release: true`。需要无 AppID 的预览时显式设置 `release: false`；预览包不标记为正式上传包。
- `appIds` / `adUnits` 按游戏 ID 配置，可以保留未选游戏的配置；仅检查 `games` 中所选游戏的必填值。不从其他目标、Shell 本地配置或环境变量偷偷回退。AppSecret 等未知字段拒绝。当前 TapTap 后台可在该应用的 **应用配置 → MiniApp ID** 查看；部分版本入口为 **开放能力 → 小游戏基本信息**（[官方说明](https://developer.taptap.cn/minigameapidoc/dev/api/navigate/tap.navigateToMiniProgram/)）。
- `ads` / `backend` 为布尔数组，形成笛卡尔积；每目标可以覆盖这两个数组。均为 `[false]` 时每游戏每目标一个包；均为 `[false, true]` 时是四个包。
- 原三款及原生目标的广告开启必须配置本目标对应的真实广告位；新增六款 H5 的空 ID 自动关闭入口。仅传入广告位不代表宿主播放验收。TapTap H5 与原生的广告位必须分别配置。
- 后端关闭会从产物配置中移除 API 地址。开启时要求有效 HTTPS 地址；`localBackend: true` 仅用于 H5 的本机 HTTP 验证，不能放宽原生地址要求。当前支付宝适配器不支持这套在线竞赛服务，开启会报错。

同时打 H5，在 `targets` 中增加：

```json
{ "platform": "taptap", "type": "h5", "adUnits": {} }
```

增加微信目标时添加如下对象，并填写每款独立的真实 `wx...` AppID：

```json
{
  "platform": "wechat",
  "type": "minigame",
  "release": true,
  "appIds": { "cops-robbers": "", "cops-robbers-realtime": "", "xiangqi-five": "" },
  "adUnits": {}
}
```

支持的原生目标与交付形式：

| `platform` | 交付                                           | 后续步骤                                                                  |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `taptap`   | 官方转换生成的原始 ZIP，同时保留工程和 receipt | 发布模式的 ZIP 可选作原生包体上传文件；平台解析、登录、审核及真机需另验收 |
| `wechat`   | Creator 原生工程                               | 导入微信开发者工具，按平台流程预览/上传                                   |
| `bilibili` | 官方扩展生成的工程                             | 导入 B 站开发者工具；首次运行需安装 B 站扩展                              |
| `douyin`   | Creator 原生工程                               | 导入抖音开发者工具                                                        |
| `alipay`   | Creator 原生工程                               | 导入支付宝开发者工具                                                      |
| `kuaishou` | Creator 微信源工程，标记 `conversion-source`   | 必须经快手官方工具转换，不能直接上传本源码目录                            |

百度、QQ、OPPO、vivo 等尚无这条 Cocos 构建链的实现，直接报不支持；增加配置字段不能自动获得平台支持。

## 输出与上传

每批输出到 `outputs/game-builds/<batch>/`，`builds.json` 汇总目标；每目标的目录形如 `taptap-h5/`、`taptap-minigame/`、`wechat-minigame/`。每款各变体有独立文件名与 JSON 清单。历史批次保留，原生下一变体覆盖 Creator 临时构建目录前，会先保存上一变体。

TapTap 原生发布包例：

```text
outputs/game-builds/<batch>/taptap-minigame/
  cops-robbers-taptap-minigame-release-ads-off-service-off.zip
  cops-robbers-taptap-minigame-release-ads-off-service-off.json
  cops-robbers-taptap-minigame-release-ads-off-service-off.receipt.json
  cops-robbers-taptap-minigame-release-ads-off-service-off/
```

上传其中单款 `.zip`，不压缩整个批次目录。ZIP 原样复制官方产物，校验根目录 `game.js`、`game.json`、`project.config.json`、CRC、逐文件清单和转换记录 SHA-256。官方说明：[Cocos 转换产物](https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/)。

原生清单的 `delivery` 为 `upload-zip`、`preview-zip`、`developer-project` 或 `conversion-source`，仅原生发布 ZIP 有 `uploadFile`。`platformAcceptance: "not-run"`、`realDeviceVerified: false` 与构建成功独立。没有完整批次 `builds.json` 的目录可能来自中途失败，应检查日志，不将其视为整批成功。

H5 保留原 `dist/index.html` ZIP 结构以及游戏内 `dist/h5-packages/<batch>/` 副本，上传到 TapTap H5 入口。版本 1 配置仍完全走原 H5 路径，原来的 `outputs/game-builds/<batch>/matrix.json` 布局不变；不要只给版本 1 增加 `targets`，应升级 `version: 2` 并将 `adUnits` 移到各目标。

## 构建命令职责

| 命令                | 用途                                                            | 是否日常渠道包统一入口                 |
| ------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `build:games`       | 按本地配置打指定游戏、平台、H5/原生包，归档交付文件             | **是**                                 |
| `minigame:build`    | `shell-minigame` 的单款底层工程生成器；接受游戏/平台参数        | 否；主要供底层开发与旧流程             |
| `minigame:preview`  | 批量生成旧注册表的预览工程，不启动预览服务                      | 否                                     |
| `games:build`       | Turbo 串行编译 `games/*/*` 工作区游戏及依赖；各项目自行决定输出 | 否；没有统一渠道交付格式               |
| `competition:build` | 对已有 H5 产物接入竞赛功能；`--native` 时生成对应工程           | 否；属于竞赛适配步骤                   |
| `artifact:build`    | 质量检查后构建并签名内部制品，写入配置的 S3 存储                | 否；有远端写入，不能当普通本地打包命令 |
| `build`             | Turbo 全工作区构建，包括应用、服务、库和游戏                    | 否；用于整个仓库开发/CI                |
| `build:affected`    | Turbo 仅构建受影响工作区及依赖                                  | 否；用于增量开发/CI                    |

底层命令保留兼容与维护用途，不改名、不用它们替代统一交付入口。Cocos 专用的 `pnpm --dir games/minigames build:taptap` 等仍可单独调试，它们不读取 `game-build.local.mjs`。

## 本机构建条件

使用仓库规定的 Node / pnpm。首次安装依赖和固定版本引擎/插件：

```powershell
pnpm install --frozen-lockfile
node games/minigames/scripts/setup.mjs --taptap
# 需要 B 站目标时
node games/minigames/scripts/setup.mjs --bilibili
```

真实 Creator 3.8.8 构建在 Windows/macOS 执行；Linux 可验证配置和规则，不能在这里伪造 Creator 原生包。构建脚本会验证工程、平台方向、资源及 ZIP，但不会代替游戏功能回归、真实广告、平台登录、后台审核和设备验收。
