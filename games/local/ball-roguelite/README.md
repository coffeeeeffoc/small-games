# 星轨弹珠 · Orbit Breaker

移动端竖屏弹珠肉鸽，运行层完全使用 **Cocos Engine 3.8.8**：Scene、Node、Camera、Sprite、Label、Graphics、Button、触屏输入与帧循环均由引擎承担。旧 Canvas 游戏渲染器已移除；HTML 仅承载启动/失败状态、视口宿主与无障碍按钮镜像。玻璃素材离屏烘焙一次后作为 Cocos 纹理复用，不使用 Canvas 帧循环。

这是官方 Cocos 源码的 Web 构建，**不是 Creator 编辑器导出工程**。固定官方提交、源码压缩包、依赖锁、编译器和产物摘要见 [引擎说明](vendor/cocos/README.md)。正常构建离线校验已提交的 1.50 MB 引擎；运行时无 CDN 请求。原生平台工程和 TapTap 真机 SDK 验收尚未执行。

## 游玩与平衡

八个逐关解锁星域、无尽模式、双模式独立检查点、好友同种子挑战与开发试玩。弹珠从顶部中央向下发射：按住场地瞄准，松手相对发射口的位置决定角度和初速度。距离越远越快，力度条与文字即时反馈，虚线用实际物理求解器预览第一处碰撞。目标从底部逐轮上升，越过顶部警戒线结束。

重力为 360 px/s²，初速度随距离在 260–900 px/s 内变化，速度上限 1120 px/s；碰撞保留 98.6% 速度，低速碰撞下限 120 px/s。物理固定 240Hz，圆形与六边形连续扫掠避免高速穿透。原有小角度折射保留，能在两颗错位目标之间形成真实的连续往返；单球回归场景在两秒内至少 20 次交替碰撞，验证接触有时间间隔，不能靠重叠重复扣血。球之间互不碰撞。

保持蓝紫星云与彩色玻璃珠、珍珠和六边形水晶。0.12 秒短拖尾保留真实反弹拐点，同一段叠影取最高透明度，配合少量圆形残影和速度拉伸。命中压缩、裂纹、最多 48 片玻璃碎片及随碰撞升阶的音效继续使用；系统减少动态时关闭拖尾、粒子和缩放，不改变物理规则。

紫色吸收器先扣耐久，未击碎时会吞掉这颗本轮弹珠，包括穿透弹；永久球数不减少。击碎后弹珠继续反弹。角度与力度都影响切入路线。三种策略、三个种子的 [72 次当前规则模拟](docs/design/gravity-drop/campaign-report.json) 中八关均有通关策略，专家关固定竖射仍失败；这是自动策略证据，不是玩家成功率。

每 **5 轮**选择一次强化；全模式上限 **22 球**。无尽每四波出现加球点，击碎不额外赠球；关卡模式单轮击碎 12 颗最多赠 1 球。原有关卡耐久与成长曲线保持，玩法变化来自角度、力度与重力。

球碰到珠子后继续受重力影响并反弹；没有碰到珠子则直接下落。接触容器底部立即回收，不再参与碰撞；底部仅留下短暂下沉光效，不会飞回顶部。手动收回或超过 24 秒时，剩余弹珠向下快速落底，放弃剩余伤害。全部落底或被吸收后才上升珠群，顶部准备下一轮弹珠；暂停冻结整个过程。

顶部直接返回入口先弹二次确认，取消保留当前对局；确认后保存已完成回合，飞行/召回中的本轮从发射前恢复。全局齿轮打开音效、振动和帮助，暂停仅负责继续。首页及游玩中均可重新开局，重开确认只重置当前模式，不改另一模式与纪录。按本轮需求移除全屏按钮，公共适配文件继续保持同步。

## 通用激励广告

默认无广告 SDK 时显示“广告暂未就绪”，不发模拟奖励，不自动插屏。玩家在回合间或失败后主动选择补给：

- 晶体共鸣：本局命中有 8% 概率额外造成 1 点伤害，不被暴击或连锁放大，每局一次。
- 应急清行：危险时清除最靠近顶部的两排目标，不加分、不加球、不再下降，每局一次。

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

存储 key 仍为 `ball-roguelite:save:v1`；外层 schema 2 保留双模式槽及设置，核心检查点 schema 4 兼容旧 schema 1/2/3。旧超限能力归入新上限，现有目标 HP 同比例折算，避免迁移瞬间难度突变。飞行中退出恢复发射前检查点；存储不可用时会话内继续。新分享使用 `orbit-v4`；旧 `orbit-v1/v2/v3` 链接提示按新规则重试。旧检查点保留棋盘、强化、已用奖励和进度，发射口归中；其 `initialSeed` 清空，避免旧规则中途存档产生新规则的可比较挑战。

本次方案、布局图、平衡模拟和生产浏览器截图见 [重力落珠改造记录](docs/design/gravity-drop/README.md)。引擎来源与历史风格见 [星云游乐场](docs/design/prism-carnival/README.md)。验证使用 Windows Chromium 手机触屏模拟，不等同手机真机、原生包或线上部署验收。

## 上架基础资料

文案、图标、宣传图/视频及实际游戏截图/录屏统一登记在 [publishing/STATUS.md](publishing/STATUS.md)。基础资料来自手机尺寸的浏览器运行，尚未提交平台审核。
