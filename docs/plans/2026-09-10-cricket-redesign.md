# 秋声斗蟋：game-cultivation 重设计

日期：2026-09-10。目标：一局可直接操作、有时机判断和即时声画反馈的斗蟋游戏。已实现版本。

## 一局怎么玩

- 三擂连续挑战，每擂 60 秒；斗志归零即退盆。超时比较剩余斗志比例，平局算挑战失败。
- 按住草梗或斗盆蓄力，55–82% 金区松手精准出击。按住约 0.7 秒可进入金区，过度撩拨伤害反而下降。
- 对手抬头、张牙并显示预警进度。D 或「收梗」提供 0.46 秒闪避窗口，扑空后的 1.15 秒可打出 1.6 倍反击。
- 出击与闪避消耗气力，松手恢复。禁止无限闪避；三位对手逐渐缩短预警、提高伤害。
- 支持失败重赛、胜利进入下一擂、三擂结算后重新挑战。进度限本次游戏会话，不写入旧修仙存档。

## 实现边界

`src/domain/cricket.ts` 是纯实时规则，数值集中在该文件。Web 与原生 Canvas 共用规则及场景绘制；原生端用点击切换蓄力/出击。Web 使用本地写实材质，原生 Canvas 与图片加载失败时使用程序绘制材质。原生平台若没有 AudioContext 则静默运行，尚未验证 B 站真机声音。

键盘：空格按住/松开撩拨出击，D 闪避，Esc 暂停。手机：支持真实 touch pointer capture，取消触摸不出击。失焦、切后台及 Host pause 都停止对局并取消蓄力。取消暂停可继续，卸载清除计时器、动画和音频。

环境与反馈：木桌、陶盆、竹笼、茶盏、暖灯；虫体纹理与独立活动的足、须、颚；冲撞退让、侧闪、扬尘；Web Audio 合成虫鸣、空气底噪、敲击、命中和胜负音。声音由首次点击解锁，可静音。不依赖在线媒体或新增运行依赖。

保留 cultivation 的 Game Contract 标识及旧 content schema/migration，使已发布内容仍可装载；旧文字事件不再作为玩法驱动。旧领域/存档适配代码仍有兼容测试，未覆盖旧记录。新版 UI 不提供旧修仙广告轮回。

## 复验

在仓库根目录执行：

```powershell
pnpm --filter @coffeeeeffoc/game-cultivation dev --port 4178
pnpm --filter @coffeeeeffoc/game-cultivation test
pnpm --filter @coffeeeeffoc/game-cultivation lint
pnpm --filter @coffeeeeffoc/game-cultivation build
node scripts/cricket-playtest.mjs
pnpm --filter @coffeeeeffoc/shell-web exec vitest run tests/shell.integration.test.tsx
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm --filter @coffeeeeffoc/shell-web smoke:remote
```

浏览器测试默认使用已安装 Chrome（可通过 PLAYWRIGHT_CHANNEL 改为其他 Playwright channel）；自动开关专用 Vite server，验证三擂胜利、重赛、真实触摸与取消、音频非零采样、静音、暂停与失焦、320/390px 首屏布局。截图保存在 `.scratch/cricket/`。

## 写实素材与生成记录

使用内置 image_gen 工具。选用素材已复制到项目，保留原始文件，无运行时生成。

- `apps/game-cultivation/src/assets/teahouse.png`：斗盆环境背景。
- `apps/game-cultivation/src/assets/cricket-macro.png`：虫体材质；绘制时只映射到体节，足须与颚独立实时绘制。

背景提示词：

> Use case: photorealistic-natural. Asset type: background plate for an interactive Chinese cricket fighting game. Generate ONE landscape image approximately 1400x1000. Authentic close-up cinematic photograph of a worn clay cricket-fighting basin on a dark antique Chinese wooden tea-house table on an autumn night, seen from a high nearly top-down angle. Exact composition for gameplay: basin center at 50% width and 53% height, oval outer rim spans from 8% to 92% width and 17% to 87% height; basin empty flat sandy beige clay floor from 16% to 84% width and 30% to 74% height. Tiny dirt grains, scratches, tactile fired-clay pits, handmade charcoal olive ceramic rim with subtle aged highlights. A partially cropped bamboo cricket cage at lower left outside basin, small dark tea cup at upper right, faint warm lantern spill at upper left. Warm amber lamp side-light, deep olive-black shadows, realistic restrained film grain, crisp macro material textures, shallow atmospheric haze only outside bowl. Center floor is unobstructed for moving game characters. NO insects, NO animals, NO hands, NO people, NO text, NO UI, NO lettering, NO graphics, NO watermark. Real photographed physical materials, not illustration or vector shapes.

虫体提示词：

> Use case: scientific-educational. Asset type: photorealistic transparent game sprite. ONE isolated adult male Chinese fighting field cricket Gryllus bimaculatus, dorsal overhead view, full body horizontal with head facing RIGHT and tail LEFT. True anatomical realism: small glossy dark head, minute eyes on sides of head (NOT large cartoon eyes), textured bronze olive dark wing covers, muscular bent hind jumping legs, six slender spiny legs, fine antennae extending right, twin cerci left. Neutral natural resting alert pose. Warm light from upper left, dark olive and amber-brown natural exoskeleton. Genuine alpha TRANSPARENT background, clean cutout, no background shadow, no floor, no surface, no text, no diagram labels, no border. Subject fills about 85% of landscape canvas with all antennae and feet safely inside frame. Museum-quality macro wildlife photography, real insect proportions, not a cartoon, not a beetle, not a vector icon. This sprite is for compositing at small size on a clay fighting basin.

生成工具实际返回 RGB，因此未把它当透明精灵使用，而是将虫体作为 Canvas 体节纹理。后续透明提取尝试只生成了棋盘格 RGB，未采用。两份采用素材约 4.9 MB；iframe library build 会将其内联为 data URL，测试 CSP 仅增加既有规则允许的 `img-src data:`，未增加网络访问权限。
