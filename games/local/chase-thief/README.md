# 小贼哪里跑

沿着起伏弯曲的老城街道，一路追着同一个橙衣小偷跑下去。真实 Cocos 3D 城市无尽跑酷：骑楼街、居民巷、集市连续变化，建筑与道具从远处进入、掠过身侧并回收。

## 运行

仓库工具链：Node 24.21.0、pnpm 12.6.0。

```sh
pnpm --filter @coffeeeeffoc/chase-thief dev
```

打开 `http://127.0.0.1:4417/`。也可在游戏目录运行 `node build.mjs`、`node server.mjs --host 0.0.0.0 --port 4417`。独立静态入口 `/games/chase-thief/index.html`；大厅入口 `#/games/chase-thief`。构建产物无外部 CDN 依赖，服务器只暴露发行资源。

## 玩法

- 自动前进，左右滑动换道，上滑跳跃、下滑滑铲。方向键 / WASD、空格同样可用；设置可开启触控按钮。
- 没有倒计时、终点抓捕或追丢失败。小偷保持在前方，远近变化营造追逐感；纪录由距离、追回的掉落物与连续动作组成。
- 跳过矮栏、滚桶和真实凹陷的沟壑；滑过低横杆；绕开高箱堆和装货推车。双车道障碍与整排矮栏/横杆交替，整排必须跳跃或滑铲。每波保留空道或明确可通过的动作。
- 起跑 13 m/s，约 67 秒加速至 21 m/s；障碍间距 24 米。手机滑动达到阈值即执行，不必等抬手。沟壑从近沿到远沿均须保持跨越，不能在坑里落地。
- 分路口提前选左右，中央分隔带不可穿过；有障碍的一侧拾取回报更多，另一侧更稳妥，两条路随后汇合。
- 轻碰撞扣一点耐力并短暂减速；三次碰撞结束本局，未跳过沟壑直接结束。重试免费。暂停、设置、后台切换均冻结玩法。
- 三个出发街区直接可选，选中立即刷新场景预览，随后仍会经过其他街区。骑楼街有廊柱店招，居民巷有灰墙阳台和晾衣，集市有彩棚果蔬与货车；五类实体障碍各有三街区、两种装饰变体，沟壑继续使用真实凹陷路面，操作和碰撞规则不变。声音、震动、减弱镜头动态及触控按钮设置保存在本地。

## 实现与素材

`assets/scripts/core/` 为纯 TypeScript 路线、固定步长模拟和存档；`World.ts` 使用 Cocos Scene / Camera / MeshRenderer 生成连续街区，`Hud.ts` 使用 Canvas / Graphics / Label 绘制菜单；输入、音效、生命周期由 Cocos 管理。HTML 只承担加载及公共开发工具接入。

当前 Web 使用固定官方 **Cocos Engine 3.8.8** 源码构建，提交 `411f98df047c25902f93440d4b22925c2fb65461`，完整来源及 SHA-256 见 `vendor/cocos/provenance.json`。`build.mjs` 验证真实引擎后编译 TypeScript，产出 `dist/build-info.json`。这不是 Creator 编辑器导出制品。

```sh
node scripts/build-cocos-engine.mjs --check
# 重新编译官方引擎，需要网络、npm、curl、tar：
node scripts/build-cocos-engine.mjs --rebuild
# 生成可交接的 Creator 3.8.8 工程：
node scripts/prepare-creator.mjs
```

Creator 工程生成在忽略的 `.creator-project/`，打开 `assets/scenes/main.scene`；共享 `Entry.ts` 与同一套玩法源码。当前环境没有 Creator 编辑器，尚未完成编辑器导出、微信/抖音小游戏和物理手机验收，不能把浏览器证据当作这些平台的结果。Creator 导出前还需配置目标平台、检查资源导入及目标设备性能。

建筑立面与图标由 AI 生成，13 类道具和 13 骨角色由原创 Blender 脚本制作。`art-source/city-kit.blend` 保存可编辑模型、骨架及顶点组；运行时采用各部件绑定单骨骼的层级节点动画，未使用自动平滑蒙皮。重新生成：`blender -b --python scripts/create-art.py`。来源与规格见 [素材清单](assets/ASSETS.md)。

## 兼容与开发模式

旧 `chase-thief.progress.v1` 只读取设置及历史抓捕纪录，原键不改写；无尽纪录独立保存在 `chase-thief.progress.v2`。旧挑战链接明确提示规则已更新，不把旧用时当成无尽成绩。此前限时玩法、分享成绩协议和模拟插屏已退役；目前无广告奖励或付费续跑。

复用公共 `dev-mode.js`。`?dev=1` 启用开发面板，`?dev=0` 显式关闭。`__chase.snapshot()` 是只读画面语义诊断；修改时钟、无敌和街区试玩仅在开发模式提供，都会隔离个人纪录。存储损坏时不覆盖原数据，存储被禁用时仍可玩。

## 验证与交付

```sh
pnpm --filter @coffeeeeffoc/chase-thief build
pnpm --filter @coffeeeeffoc/chase-thief test
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/chase-thief test:browser
```

测试覆盖 2,000 处分段连接、10,000 个障碍波次、正常策略跑过 2 公里、15 组最高速 3 公里通行、1 小时有界模拟、沟壑网格挖空及整段判定、整排动作、即时滑动和取消、分岔提交、碰撞保护、暂停、存档迁移与试玩隔离。浏览器流程包含真实滑动/点按、鼠标单次触发、三种竖屏尺寸、正常失败重试、存档恢复、后台暂停与长距离场景回收。浏览器中间输出在仓库 `outputs/chase-thief/browser/`，选定证据保存在下方验收目录。

当前验证范围和证据见 [验收记录](docs/design/endless-city-2026-10-22/verification/README.md)，设计过程见 [方案](docs/design/endless-city-2026-10-22/plan.md)。历史设计目录仅保留旧版本证据。

上架文案、图标、概念宣传图、宣传视频、实际截图及实际录屏集中在 [publishing/STATUS.md](publishing/STATUS.md)。素材准备不代表已上架。

## 可选奖励（2026-10-24）

暂停页可完整观看后获得五秒普通碰撞保护，每局一次；复用 protection，仅游玩时间递减，沟壑仍须跳跃。辅助局不保存本地纪录，也不显示新纪录；免费重试和街区选择不变。

通过现有全局 `SmallGamesRewardAds.offer` 领取，仅 `completed` 生效；不可用、取消、失败不消耗次数。请求绑定当前局面和令牌，重开、导航、pagehide、销毁取消，普通隐藏/失焦不取消观看；没有播放总超时，完成后仍暂停，需主动继续。H5 公共模块由构建注入，不复制 SDK，不修改源指纹规则。

设计与验证边界见 [奖励说明](docs/design/rewards-2026-10-24.md)。
