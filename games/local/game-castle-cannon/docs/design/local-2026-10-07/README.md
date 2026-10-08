# 一炮拆城：本地资产与连续射击修复

日期：2026-10-08。[原图与实际游戏对照](comparison.html)。references/approved-_.png 是用户提供的认可原图；其他 _-reference.png 是建模输入，均不作为运行画面。

## 工作区与基线

最初基线为 695b8043cd2d8b5c35e161719830d5ce7d30d871，随后正常同步 origin/dev 到 415c285f91d2f39cfd799b9a17087d7793c4f1c2。原目录未提交文件和二进制 diff 已备份到 C:/Users/15211/.codex/backups/castle-cannon-20261007-01a116f1。本轮在独立本地 worktree F:/playground/playground-ai/castle-cannon-art-local 完成，不改动原目录的并行 TapTap/Cocos 等工作，不合入旧草稿分支。

## 近景到实际场景

先生成炮车、门、石材并放入现有游戏，用 actual/close-cannon-_、close-gate-_ 保存第一轮近景；随后增加步兵、炮兵、杉树、山体、岩岸与瞭望台。最终近景是 final-cannon-initial.png、final-gate-initial.png，全景开局、破门、炮击峰值、特效结束分别见 final-\*.png。

炮车保留独立车架转向和炮身俯仰；城门完整与破坏后的左右门叶来自同一模型。步兵位置、人数、伤亡及推进来自实际战局。沿用静态颜色/深度缓存与士兵实例化；缓存来自实时场景绘制，没有效果图背景。

石材使用崩角网格与 PBR 表面，木铁分别使用色彩、法线、金属/粗糙度贴图。正常画质改为 1280×720，保留公开省电模式；暖方向光、冷环境光、HDR 太阳反射与距离雾共同照明。门区、步兵路线和墙端一起调整。爆破弹由真实命中点驱动亮核、光晕、18 块飞石和烟尘，结束后留下持久缺口。

**美术差距仍然存在**：全景城池布局未与原图完全重合，远城细节、自然坡地与崖壁的衔接、烟尘层次、角色细腻度及电影感光照仍较简化。final-\* 是本轮实际结果，不代表原图美术验收通过；不以测试通过或资产数量替代视觉判断。

## 本地 Hyper3D 与来源

本机 OAuth 起初在真实连接时返回 authenticationRequired；用户在本机完成授权后，连接、上传、生成、拆分和下载均成功。没有复制云端令牌，没有自动充值。本轮成功生成 9 件模型，炮车和门另做 BANG Basic 拆分。BANG High 返回账户未开通高分辨率权限，随后使用 Basic，没有升级账户。工具未提供余额查询，本轮未收到 credits 不足错误。

每件模型的永久结果页、输入图、提示词、目标面数、文件大小及 SHA-256 见 [source/manifest.json](source/manifest.json)。运行时使用 src/models/_-rodin.json 和 public/castle-cannon-art/rodin/_.jpg；无新运行依赖，沿用 GameHost 图片加载与量化网格格式。可选贴图失败仍可继续游戏。

原始 GLB 保存在上述本机备份目录的 art-source/，没有将原始大体积中间文件或签名 URL 加入仓库。导入器验证 SHA-256，再机械量化与打包。游戏目录内复现：

```powershell
$env:NODE_PATH='F:/playground/playground-ai/small-games/node_modules/.pnpm/sharp@0.34.5/node_modules'
node scripts/art/import-rodin.mjs cannon 'C:/Users/15211/.codex/backups/castle-cannon-20261007-01a116f1/art-source/cannon-parts.glb'
```

## 连续射击根因与修复

旧三维拾取在第一发摧毁目标后，非目标区域退回固定规则坐标，两个明显不同的拖动点都得到 (230,100)。炮身还受到较窄的转角限制，瞄准、飞行和伤害之间没有保留同一真实命中点。

现在拾取结果携带世界命中点与目标 ID，输入、会话、规则、炮身、弹道和特效共用；目标破坏后的地面、墙面和天空仍可连续瞄准。明确打空不会借二维邻近坐标错误伤害其他模块；二维降级入口仍沿用原规则。转向使用最短角插值，跨越 ±π 后能停止更新；调度从 33ms 改为 16ms，保留 GPU 单帧在途限制。关卡 HP、装填、伤害、推进和成长数值未改。

新增失败后通过的回归覆盖：第一炮破门、装填结束、连续五次自由拖动、实际准星和炮身均移动、第二炮损伤另一座塔且出现命中特效。鼠标和原生 CDP 触屏均使用真实时钟，不编辑战局。结果见 actual/aim-evidence.json。

## 验证与复现

本机 Windows / Node 24.21.0 / pnpm 12.6.0 / 已安装 Chrome。桌面浏览器的移动视口与 CDP 触屏不等于实体手机或微信宿主验收。

```powershell
pnpm --filter @coffeeeeffoc/game-castle-cannon lint
pnpm --filter @coffeeeeffoc/game-castle-cannon typecheck
pnpm --filter @coffeeeeffoc/game-castle-cannon test
pnpm --filter @coffeeeeffoc/game-castle-cannon build
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:SIEGE_EVIDENCE_DIR='docs/design/local-2026-10-07/actual'
pnpm --filter @coffeeeeffoc/game-castle-cannon test:input
$env:SIEGE_NORMAL_QUALITY='1'
pnpm --filter @coffeeeeffoc/game-castle-cannon smoke
pnpm check:dev-mode
pnpm test:dev-mode
$env:DEV_MODE_GAME_IDS='castle-cannon'
pnpm test:dev-mode:browser
```

生产开发模式浏览器检查还需构建公共触屏样本 @coffeeeeffoc/wulong-city，并准备 Shell 选定游戏产物。一次缺少该样本的运行在 8 个本游戏断言通过后失败；补齐真实构建后 10 项全通过，没有删除公共样本。Shell 选定检查覆盖独立/嵌入入口、返回目录与 390×844 触屏。

完整游戏回归保留三关、两类弹药、先拆塔的损失优势、存档恢复、正常解锁、无操作失败、重试、暂停恢复、进入/退出全屏、横竖屏切换及拖动取消。旧回归脚本在旋转后读取尚未稳定的按钮坐标，导致“继续”触点未命中；改用 Playwright 原生 tap/click 等待可操作位置，战斗拖动仍使用 CDP，未注入 DOM 事件或战局状态。

固定截图复现（游戏目录）：

```powershell
$env:SIEGE_CAPTURE_DIR='docs/design/local-2026-10-07/actual'
$env:SIEGE_CAPTURE_PREFIX='final'
node scripts/capture-impact.mjs
$env:SIEGE_ART_VIEW='cannon' # 或 gate；仅 dev=1 可用
$env:SIEGE_CAPTURE_PREFIX='final-cannon'
node scripts/capture-impact.mjs
```

固定峰值截图单独使用 Playwright Clock 等待实际 GPU 完成，不改战局；峰值/结束来自同一发炮弹、同一相机，不能用此受控取帧数据声称实时性能。真实时钟输入记录独立保存。美术审查机位必须显式开启开发模式，dev=0 会忽略 artView。

本轮资源偏向近景质量：27 张 PBR 图片约 14 MB，主 JS gzip 约 3.4 MB。低端手机首载、持续帧率、原生平台素材包限制仍需实体设备检查。最终准确 base/head 的增量验证与 GitHub CI 状态以交付记录为准，不把本地测试当作部署成功。
