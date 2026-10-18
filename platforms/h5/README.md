# H5 分享与广告接入

TapTap 真实激励广告的超时、前后台、预加载及整包验收见 [TapTap 激励广告接入避坑指南](../../docs/operations/taptap-rewarded-ads.md)。尤其要检查所有外层请求超时；广告打开成功后，不能再让加载截止时间覆盖播放和结束页停留。

`publishing.js` 为独立 H5 入口提供浏览器适配，不依赖渠道 SDK、服务器密钥或第三方 UI。奖励结果沿用 Game Host 的 `completed / dismissed / unavailable / failed`；已有 Game Host 的游戏继续使用宿主 `ads.offer`，不要并行启动第二个广告来源。`createSimulationAdProvider` 的 `show` 可以作为现有 `createAdRuntime` 的 managed provider。

```js
import { createH5Publishing } from './publishing.js';

const publishing = createH5Publishing({
  gameId: 'example',
  title: '游戏名',
  // 游戏入口显式开启模拟。线上关闭用 off；真实渠道必须注入已验证的 provider。
  adMode: globalThis.SmallGamesPublishingConfig?.adMode ?? 'mock',
  pause() {
    const previouslyPaused = game.paused;
    game.pause();
    return () => {
      if (!previouslyPaused) game.resume();
    };
  },
});

const shared = await publishing.share({ params: { challenge: 'v1', seed: 123, score: 42 } });
// shared/copy 的文案分别是“已打开系统分享”/“挑战链接已复制”，不发分享奖励。
// unavailable/failed 时 shared.url 仍可供游戏的复制框展示；cancelled 不要再次强制复制。
const outcome = await publishing.rewarded({ placement: 'continue' });
if (outcome.status === 'completed') grantOneContinuation();
// 下一关、结算离开等自然节点；普通重试/开始游戏不能被广告阻断。
await publishing.interstitial({ placement: 'next-level', naturalBreak: true });
// 销毁游戏入口时清理广告弹层、监听与待处理请求。
publishing.dispose();
```

`pause()` 返回恢复函数，必须恢复原有暂停状态；自动前后台暂停仍由游戏管理。横屏旋转容器内的游戏可传 `root` 挂载弹层，使它和游戏一起旋转。`adMode` 在实例创建时固定，默认 `off`；`mock` 始终显示“模拟广告”，不能声称真实广告已接通。`host` 仅使用入口明确注入的 provider，缺失时 unavailable，不回退模拟。模拟激励完整观看后还需点击领取；提前关闭、切后台、Esc、30 秒无人操作均不奖励。所有失败继续正常游戏。共享模拟广告没有外链、支付、强制下载或倒计时后自动奖励。

频控跨广告位生效：默认每 60 秒最多一次、每次入口会话最多 6 次；可调范围保留至少 30 秒间隔、最多 12 次。结算插屏从第三个自然节点开始，每三个节点最多一次，且同时受总频控约束。失败尝试也计入冷却，避免无库存时反复暂停。可选奖励需由玩家明确点击，游戏每局奖励次数由已有游戏规则限制；不能用广告覆盖主重试入口。provider 卡死 45 秒后返回 failed 并恢复玩法；原操作未结束时保持不可用，防止迟到回调发错奖励。

公开链接删除已有 query、凭证及旧 hash query，再加调用者明确提供的有限参数。独立游戏使用普通 URL query；配置 `publicUrl` 为 Shell 地址时，仅接受 `#/games/<合法游戏 ID>` 路由，并将挑战参数写入该路由的 hash query（例如 `#/games/tower-brake?challenge=tower-v1&level=level-1`），外层 query 保持为空。游戏 ID 与 Shell 使用同一套 ASCII 字母/数字/连字符、最多 80 字符规则；非法编码或多余路径段会返回不可用，不生成丢失挑战的链接；普通页面的无关 anchor 被清除。`dev`、token 等参数不会发布。参数只做通用格式限制：游戏必须核验 `challenge` 版本、种子、关卡、成绩上下界，不信任 URL 成绩，不写入正式排行榜，也不把邀请关卡写成普通解锁进度。同题挑战不等于服务端公平竞赛；正式联机、排行榜沿用已有 Competition Service。

## 打包与本地预览

Vite 入口可直接相对导入公共源，会被打入本游戏产物。静态游戏使用本地 URL `./publishing.js`：`build.mjs` 从 `platforms/h5/publishing.js` 复制到产物根，开发服务器将 `/publishing.js` 映射到同一公共源。不要让公开站点引用 `/../../../platforms/`，也不要手工维护游戏副本。已接入入口：tower-brake、cage-rescue、ball-roguelite、three-choose-two、flick-arena、game-moss-garden、ember-bounce、chase-thief、retreat-rally、tiny-signals、orbit-atelier、wulong-city、surprise-kept、homebound-station、waterline-station、rescue-team、out-of-frame、fold-the-world、two-sided-box。各游戏只启用适合自身循环的分享/广告能力；接入公共发布适配不等于全部启用广告。

验证命令：`node --test platforms/h5/tests/publishing.test.mjs`。测试覆盖公开参数清理、取消/复制失败、频控、前后台、完整观看、销毁、超时及暂停恢复。浏览器触屏、各游戏独立发布路径、真实系统分享由游戏回归补充；SDK fixture 或桌面浏览器均不能替代渠道真机验收。

国内发布配置与支持边界见 [国内渠道发布](../README.md)。

## 不同平台的激励视频提供方

`platform-ads.js` 是显式渠道的公共 AdProvider，可传给已有 Game Host 广告运行能力或 `createH5Publishing({ adMode: 'host', provider })`。不改变已有游戏的默认来源。

```js
import { createPlatformAdProvider } from './platform-ads.js';
const provider = createPlatformAdProvider({
  platform: 'taptap-h5',
  adUnitId: '后台返回的竖屏广告位ID',
});
const result = await provider.show({ opportunityId: 'example:hint', kind: 'rewarded' });
// Game Host 管理暂停和奖励；provider 只校验观看结果。退出奖励机会时清理：
provider.dispose();
```

| 运行渠道    | 宿主  | 接入区别                                                          |
| ----------- | ----- | ----------------------------------------------------------------- |
| `taptap-h5` | `tap` | H5 商业广告；load 后 show，只认 isEnded=true                      |
| `wechat`    | `wx`  | 微信小游戏宿主；load 后 show                                      |
| `douyin`    | `tt`  | 抖音小游戏宿主；multiton=false，直接 show，等待销毁完成才释放单例 |
| `bilibili`  | `bl`  | B 站小游戏宿主；load 后 show                                      |

SDK 方法保持原接收者。缺广告位、SDK 或不支持的渠道返回 unavailable；无填充、拒绝、抛错或超时返回 failed；关闭不完整返回 dismissed；不会读其他渠道或自动弹模拟广告。广告位不能跨平台使用。仅实现提示所需的激励视频，插屏和 Banner 不在此接口范围。

Tap 原生小游戏的 `taptap` 不属于此 H5 接入：其原生构建、登录、广告联盟与 `platforms/taptap` 的支持声明保持独立。本接口不转换 DOM 游戏为原生小游戏；已有 native Game Host 继续使用各自适配。

静态入口构建时复制公共源到 `platform-ads.js`，开发服务器映射同一个源，勿维护手写副本。当前实际消费者包括 cops-robbers 和经 `rewarded-host.js` 接入的 xiangqi-five；后续游戏复用时同时登记实际消费者。TapTap H5 的 provider 在 SDK 显示成功后停止自身打开计时，并通知请求的 `onShown`；象五子棋 host 将通知传至游戏层以停止外层计时。其他 Game Host 或 `createH5Publishing` 包装器需核对自己的超时契约，不能只替换 provider 就认定长广告已修复。

`deploy-taptap.ps1` 是可复用 H5 ZIP 上传脚本，接收 `-ZipPath / -DeveloperId / -AppId / -ScreenOrientation / -DryRun`。上传或预演前通过官方 `package-management get-available-package-types` 确认目标应用包含 `h5`，查询失败、结构无效或只有 `mini_app` 时停止，不上传。随后调用 `taptap-cli upload-h5-package`，保留 ZIP SHA 对应的幂等键和标有 `packageType: 'h5'` 的回执。成功回执对应的相同上传直接复用。CLI 方向为 `1=竖屏、0=横屏`，与小游戏 MCP 的 `1/2` 不同。它只上传并创建 H5 版本，不修改在审资料或提交审核；游戏入口负责先构建和验证包。H5 ZIP 不适用于普通「小游戏包体」上传框，不能靠改 ZIP 目录转换为 Tap 小游戏。

验证：`node --test platforms/h5/tests/platform-ads.test.mjs platforms/h5/tests/deploy-taptap.test.mjs`。脚本测试使用本地 CLI 替身，无实际账号写入；Windows PowerShell 专属检查在其他系统跳过。依据 [官方 H5 广告说明](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)、[官方广告示例](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/ads/docs.ts)，CLI 参数依据本机官方 `2026.9.24` 帮助，2026-10-14 核查。
