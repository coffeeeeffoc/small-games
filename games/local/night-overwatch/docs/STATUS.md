# 当前状态 · 2026-09-28

第二轮：在 M1 完整护送流程上打磨操作、敌我识别、地图与机载火控反馈。引擎继续使用本机 Cocos Creator 3.8.8；没有替换渲染器，没有新增依赖或外部素材服务。

## 本轮改动

- Actions/HUD：中文显示「按住左键开火 / 松开即停」，重炮显示「单击左键开火 / 每次一发」；触控显示按住或点按。帮助同步使用鼠标左键、空格等完整名称。
- 友方使用方框、红色「友方」名称与识别文字；敌方使用菱形和「敌方」名称。独立红色误伤警报、红色准星/开火区不会被装填消息覆盖，实际误伤后提醒停火。目标标签避让；小地图与固定工具栏不接受穿透射击。
- MAP 为 230×144 的任务区域，约为原可射击区域的 5 倍；周边地形继续向画面外延伸。16 节点、257.06 单位路线连接盘山路、河桥、村落和东岭撤离营地，两个待命点、9 次有限敌情。连续行驶约 128 秒，撤离窗口 185 秒。
- World：起伏地形、山岩、松林、农田、房屋门窗/坡顶、河道与桥梁、通信塔、营地；车辆增加圆轮/轮毂、玻璃、车厢、炮塔/炮管。按材质合并静态几何，车型网格共享，保留原 glTF 导入和后备模型。
- 机载界面：夜航 07 火控席、稳定北向传感器画框、自动盘旋飞机示意、航向与高度、战区小图、分区进度、低音引擎循环。玩家仍负责火控。
- Effects：发射时冻结飞机位置与目标落点；可见弹头、尾迹、落点缩圈和弹着倒计时。速射/爆破/重炮分别使用 0.2/0.55/1.05 秒飞行时间；按下时立即反馈，落地时播放独立爆炸声。热成像白热变灰，日光火球变烟尘；冲击波、碎片、残骸烟有固定数量和寿命上限。
- Platform：战斗工具栏、出动、帮助、暂停、旋屏和结算均有全屏入口；进入/退出保留任务状态，核对真实全屏状态后返回结果。音频改为可统一停止的 AudioSource；暂停、静音与退出清理声音。

## 实际验证

| 命令 | 本轮结果 |
| --- | --- |
| `node --test tests/core.test.ts` | 14/14，包括扩展地图边界、友方识别、发射位置/落点/时间快照、原有武器/暂停/护送/伤害规则与默认关通关 |
| `node scripts/typecheck.mjs` | 通过，使用本机 3.8.8 引擎声明 |
| `node scripts/build.mjs web-mobile` | 实际 Creator 构建，3,363,613 bytes，同步 dist |
| `node scripts/build.mjs web-desktop` | 实际 Creator 构建，3,363,948 bytes |
| `node tests/presentation.mjs` | 1366×768、667×375、844×390、568×320；出动/战斗/帮助真实全屏进入退出、进度和暂停保留、友方红字、操作提示、小地图点击拦截、弹着快照、模型/音频加载通过 |
| `node tests/browser.mjs` | 键鼠与纯触控均完整通关：128.03 / 128.08 秒、9/9 清除、零友伤、S 评价；友伤失败、帮助滚动、双指/取消、暂停叠加与旋屏通过 |
| `node tests/lifecycle.mjs` | 合成 blur/focus 清枪与冻结、引擎循环停止、真实全屏进入退出；十次失败→重试，车辆回到 4 个、目标标签无残留 |
| `node tests/smoke.mjs` | 当前同一源码哈希的双目标构建、1920×1080 / 1366×768 画布尺寸与位置、Shell 游戏操作检查、模型和音频通过 |
| 根目录 `pnpm check:games` | 39 个游戏、0 个配置问题 |
| `git diff --check` | 通过 |

最终源码哈希：`c9c04e58e5422bdf6e8592d88b24c0c16f22070af545b4d4a258b0bcb1d1ceba`。各测试从实际包读取 build-info 并核对源码；详细证据在 reports，汇总在 docs/verification.json。

本地 HTTP 首局资源传输 3,371,049 bytes、35 个请求。展示截面约 3.7–3.8 万 triangles、49–50 draw calls；完整通关末帧约 4.1 万 triangles，桌面采样峰值 58 draw calls、近期 FX 事件峰值 11、最多 11 个单位（包括残骸）。计数包括 HUD，属于 Windows Chrome 实测，不是手机性能保证。几何、材质与标签在重试和销毁时释放；FX 复用 Graphics，有 16 弹道、24 爆炸、8 残骸烟上限。

Cocos 对 Chromium 合成不可取消 touchcancel 输出两条 preventDefault 提示，已单独记录；触控取消与重新按下的实际行为通过，游戏错误列表为空。

## 预览、截图与参考

在游戏目录执行 `pnpm build`、`pnpm dev`，预览 http://localhost:4318。桌面目标用 `pnpm build:desktop`、`pnpm dev:desktop`，预览 http://localhost:4319。Creator 构建串行执行。

- `reports/refined-1366-daylight.png`：新地形与路线。
- `reports/refined-1366-friendly-warning.png`：醒目友方识别与红色误伤警报。
- `reports/refined-1366-heavy-impact.png`：重炮火球、碎片和烟尘。
- `reports/refined-1366-vehicle-detail.png`：放大后的车辆、炮台、房屋和地形。
- `reports/refined-667-thermal.png`、`refined-844-thermal.png`、`refined-568-thermal.png`：不同横屏尺寸。
- `reports/desktop-success.png`、`mobile-success.png`、`friendly-fire-failure.png`：通关与失败路径。

2026-09-28 实际读取了 [Spectre Command 官方页面](https://www.crazygames.com/game/spectre-command--ac130-simulator) 并查看其训练画面。借鉴传感器、飞行读数与弹着反馈的表达；没有复制源码、地图、模型、音频或 HUD 构图，也未声称全流程游玩参考游戏。

素材均为原创程序化低模与 PCM 音频；来源见 ASSETS.md / ASSET_MANIFEST.json。没有调用 Hyper3D 或 TypeSafe API，没有付费生成、采购或上传。

## 未验证边界与下一目标

实体 Android/iPhone GPU、Safari、刘海安全区、真实后台/来电、声音听感，以及微信/抖音宿主均未验证；浏览器触控使用 Android UA、DPR 2 与 CDP 多点输入。没有平台 SDK 构建或上线结论。素材已改善但仍是程序化低模，未替换为外部美术成品。

本轮没有实现多人、商城、广告、全套 M2 多地图/扫描技能或平台发布。保留仓库其他未提交工作；没有提交、推送或发布。

下一项验收：在实体手机横屏全屏下完成新路线，重点验证目标辨识、双指瞄准/开火、烟尘遮挡与帧率，再决定是否替换更高质量模型。
