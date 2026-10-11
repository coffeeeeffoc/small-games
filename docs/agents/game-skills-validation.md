# 游戏技能安装验证（2026-10-11）

本次仅安装项目级 `game-feel`、`game-ui-ux` 及必要文档；未改游戏代码、玩法、美术或运行依赖。采用 `/workspace/small-games-skills` 隔离工作树，分支 `task/install-game-skills`，起点为远端 dev `0e050eec65d2512974b430163646af4b8536e675`。原 `/workspace/small-games` 的 work 分支和既有提交保留；原 HEAD `46493d57d1c275b976cdbd8fbc43a2d5ee2eeedf` 是该 dev 基线的祖先。

## 文件安装

通过：两份 frontmatter 的 name 与目录名一致、description 存在；两个本地 references 文件和 SKILL 的项目说明/AGENTS 链接均可解析；固定来源 commit `0a70cfc64672d512c5b5b6006b5dcb5cf90dbdbd`，原始文件 SHA-256 见 [技能说明](../../.agents/skills/README.md)。只存在两个 SKILL，无执行脚本或全局安装。

LICENSE.md 的 text 代码块内载荷与上游 LICENSE 逐字节相同，NOTICE.md 与上游 NOTICE 逐字节相同。两项参考文档及 SKILL 按仓库 Prettier 格式化；新增覆盖说明带明确修改日期。未安装上游 Related skills；其中的名字与跨技能参考是可选提示，所需的两份本地参考已齐全。

## 技能发现

安装路径采用 Codex 官方支持的 `.agents/skills/<name>/SKILL.md`，已确认 Git 未忽略这些文件。

本执行环境有 `codex-cli 0.159.0-alpha.3`。尝试通过 app-server 的真实 `skills/list`（forceReload=true，工作目录为隔离仓库根及 ember-bounce 子目录）核验。第一次启动因默认运行目录只读而无法初始化 SQLite；仅在进程参数中将 sqlite_home 指向 /tmp 后，仍在宿主启动阶段失败：`Read-only file system (os error 30)`。诊断显示嵌套运行宿主写 uid_map 失败；未改用户配置、信任列表、凭据或权限。app-server 未返回技能目录，因此**当前环境自动发现未验证通过**。此会话的 executor skills 列表也未显示这两项，不将文件存在或读取成功冒充发现成功。

交付后应从已拉取本提交的仓库启动或刷新 Codex，用 /skills 或 skills/list 核对两个 name 与仓库路径。其他云端、本机和 IDE 环境未验证，不声称全环境生效。

## 实际调用试验：只读评审

本会话明确加载了两份 SKILL 与各自 references，遵守本地覆盖说明后评审已有 `games/local/ember-bounce`。这是手动加载后的调用试验，**不是自动路由成功或新一轮浏览器/真机验收**。

### game-ui-ux

读取游戏设计 README、2026-10-11 续玩/挑战设计、index.html、style.css、main.mjs；查看现有 concept.png、resume-home.png 和 portrait-impact.png。历史截图只用于核对风格与信息层级，不作为本次新采集运行证据。

- 主按钮、选关和少量辅助入口延续洞窟效果图；续玩主页突出“继续第 2 轮”，当前游玩仅保留必要 HUD、暂停和回收。没有建议引入后管风格或更换美术。
- style.css 包含 safe-area inset、44px 热区；main.mjs 的 fitArena/point 按实际画布尺寸映射触点。Canvas 固定逻辑坐标与视口适配可共存，不照搬上游“禁止绝对像素”来重写玩法坐标。
- show/cancelAim、pointercancel/lostpointercapture、pause/resume 和 pagehide 清理已有明确路径；保留当前页面模型，不要求换成引擎菜单栈。
- syncPlay 在游玩帧中更新 HUD，是可后续按测量优化的候选，不因上游偏好认定为阻断缺陷或要求本次重构。静态截图不能证明所有真实设备安全区和控件命中，未宣布这些平台验收通过。

### game-feel

读取 core.mjs 的离散事件、main.mjs 的 consumeEvents、render.mjs 的 consume/update/render/dispose 与 audio.mjs。

- 命中事件进入渲染和音效层，已有目标回弹、波纹、碎片与爆裂反馈；粒子数量有上限，减弱动态设置关闭震屏。静态命中截图能看到波纹与碎片，不能证明动态衰减或真实主观手感。
- shake 衰减与 ctx.translate 位于 renderer；不移动物理目标，不建议为“juice”改碰撞、得分或联机模拟。现有循环仅在 playing 且页面可见时 step；保留玩家暂停和生命周期边界。
- 将上游 Godot/Unity 的时间缩放理解为视觉层效果参考；没有加入全局 time-scale、hit-stop 或新引擎依赖。若未来调强度，应先以同一手机视口反复触发并检查恢复、触控与减弱动态，不能仅凭本次源码审阅判定体验已达标。

### 普通逻辑对照

只读检查存档 checkpoint/restoreCheckpoint 的损坏数据拒绝逻辑，不产生 UI 或手感优化建议。执行已有：

```sh
node --test games/local/ember-bounce/tests/checkpoint.test.mjs
```

Node 24.21.0：5/5 通过，0 failed/0 skipped。包含恢复一致结果、强化一次性、损坏字段拒绝、普通与邀请存档隔离、邀请参数校验。任务范围只需源码及已有测试，不要求应用两项技能；这是本会话路由判断与直接测试的证据，不声称另一个模型的自动加载隔离已验证。未为试验修改游戏或新增测试。

## 候选与发布验证

使用 Node 24.21.0 / pnpm 12.6.0，保留正常 pre-commit/pre-push。最终候选提交后按仓库 `validate-candidate.mjs --base <准确远端SHA> --head <准确候选SHA>` 验证；若远端推进，重新整合并重验。完整日志保存在本云端 `/workspace/game-skills-evidence/`（不含凭据）；候选 SHA、准确 base/head、推送、远端包含关系及对应 CI/Pages 结果由最终交付说明记录。

本次文档/技能路径不影响游戏，不执行 67 游戏全量回归，不新增权限、凭据或生产发布动作。原生门禁依仓库默认延后不等于原生平台通过。
