# 星轨弹珠 · Orbit Breaker

移动端竖屏弹珠肉鸽，运行层完全使用 **Cocos Engine 3.8.8**：Scene、Node、Camera、Sprite、Label、Graphics、Button、触屏输入与帧循环均由引擎承担。旧 Canvas 游戏渲染器已移除；HTML 仅承载启动/失败状态、全屏宿主与无障碍按钮镜像。玻璃素材离屏烘焙一次后作为 Cocos 纹理复用，不使用 Canvas 帧循环。

这是官方 Cocos 源码的 Web 构建，**不是 Creator 编辑器导出工程**。固定官方提交、源码压缩包、依赖锁、编译器和产物摘要见 [引擎说明](vendor/cocos/README.md)。正常构建离线校验已提交的 1.50 MB 引擎；运行时无 CDN 请求。原生平台工程和 TapTap 真机 SDK 验收尚未执行。

## 游玩与平衡

保留六个逐关解锁星域、无尽模式、双模式独立检查点、好友同种子挑战与开发试玩。按住场地拖动瞄准，松手连发；回收放弃本轮剩余伤害并推进珠群。最低一行仍可清理，再次越过警戒区结束。

目标现在是三种尺寸、多色透明玻璃珠、珍珠及六边形水晶。圆面和棱面分别使用连续扫掠碰撞；玻璃最多 4°、水晶最多 8° 的邻近目标折射只在出射半面内生效。碰撞速度短促增加后衰减，拖尾保留真实碰撞拐点，球体压缩回弹不改变物理轮廓。实际碰撞计数推进音阶；碎裂音独立于接触声节流。系统减少动态设置关闭拖尾、粒子和缩放反馈。

每 **5 轮**选择一次强化，底部局部面板保留上方战场。球数最多 36；每轮击碎 10 颗只赠 1 球；强化各有上限，重击三阶分别在第 5/20/40 轮开放，满级奖励不再出现。无尽耐久在第 40 轮之后平滑增长，避免固定能力封顶后无限无压力。无广告固定种子模拟中：固定直射 8–23 轮，危险目标优先 131–178 轮，搜索反弹路线 194–237 轮；这属于规则模拟，不代表普通玩家必然达到该轮数。

## 通用激励广告

默认无广告 SDK 时显示“广告暂未就绪”，不发模拟奖励，不自动插屏。玩家在回合间或失败后主动选择补给：

- 晶体共鸣：本局命中有 8% 概率额外造成 1 点伤害，不被暴击或连锁放大，每局一次。
- 应急清行：危险时清除最靠近底部的两排目标，不加分、不加球、不再下降，每局一次。

完整观看且 SDK 返回 `status: 'completed'` 才发奖；取消、失败、重复、迟到、退出及换局不发奖。奖励次数与局内状态保存。挑战和试玩禁用；使用广告增益的成绩不生成同场分享。广告结束停留在补给页，玩家主动返回，后台不会自动恢复对局。

在游戏模块加载前配置即可使用公共 `platforms/h5/platform-ads.js` 的 TapTap H5 支持：

```js
globalThis.SmallGamesPublishingConfig = {
  adMode: 'host',
  adsEnabled: true,
  platform: 'taptap-h5',
  adUnitId: '实际广告位ID',
};
```

需由宿主提前加载真实 TapTap SDK 并提供 `globalThis.tap.createRewardedVideoAd`。同一适配器也支持 `wechat` / `douyin` / `bilibili`。可注入 `SmallGamesRewardAds.offer()` 宿主接口，或显式 `adMode:'host', provider:{show(request),cancel(),dispose()}`；provider 负责真实完成回调，游戏负责资格、暂停、次数和防重。平台 SDK、账号及广告位未配置时不能声称真实广告已验收。

## 构建与验证

仓库工具链：Node 24.21.0 / pnpm 12.6.0。

```sh
pnpm --filter @coffeeeeffoc/ball-roguelite dev
pnpm --filter @coffeeeeffoc/ball-roguelite test
pnpm --filter @coffeeeeffoc/ball-roguelite build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/ball-roguelite test:browser
pnpm --filter @coffeeeeffoc/ball-roguelite test:balance
# 可选：从固定官方源码重建引擎
node games/local/ball-roguelite/scripts/build-cocos-engine.mjs --rebuild
```

开发地址 `http://localhost:4420/`；正式输出 `dist/`；Shell ID `ball-roguelite`。关卡配置在 `levels.mjs`，纯规则在 `core.mjs`，Cocos 呈现在 `render.mjs`，生命周期在 `main.mjs`，平台音效与领奖端口独立。构建从公共源复制广告、分享能力，不维护平台适配副本。

存储 key 仍为 `ball-roguelite:save:v1`；外层 schema 2 保留双模式槽及设置，核心检查点 schema 2 兼容旧 schema 1。旧超限能力归入新上限，现有目标 HP 同比例折算，避免迁移瞬间难度突变。飞行中退出恢复发射前检查点；存储不可用时会话内继续。新分享使用 `orbit-v2`；旧 `orbit-v1` 链接明确提示按新规则重试，不比较旧规则成绩。

设计图、引擎来源、平衡模拟和生产浏览器截图见 [Cocos 改版记录](docs/design/cocos-crystal/README.md)。验证使用 Linux Chromium 手机触屏模拟，不等同手机真机、原生包或线上部署验收。
