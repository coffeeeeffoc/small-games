# 克朗棋验收记录

日期：2026-10-10。测试环境：Windows，Node 24.21.0，pnpm 12.6.0，Chromium 140.0.7339.186 手机模拟与原生 CDP 触屏事件；Shell 另用本机 Chrome。此处不包含物理手机或原生小游戏宿主验收。

## 设计对照

- `actual-home-390.png` 对照 `../concept.png` 的主页：保留深绿织纹、黄铜字牌、斜放木盘、单一开始主操作与选关入口。生成图的植物装饰不加入运行界面，避免首屏额外资源和触控遮挡。
- `actual-match-390.png`、`actual-aim-390.png` 对照对局：真实九白九黑一红布局；袋口、基线和棋子与物理坐标一致；底部金色摆位滑轨、首碰预览和回拉力度实际可用。图片只承担木纹，棋子不是贴死在背景上。
- `actual-levels-390.png` 对照选关：六张木牌、实际关卡缩略棋盘、星级与锁定状态来自同一关卡配置。初始只开放第一关，通关后仅解锁下一关。
- `actual-match-320.png` / `actual-match-844.png` 检查小屏与横屏：竖屏上下席位，横屏棋盘在左、操作在右。棋盘、滑轨、暂停按钮可见；无需旋转设备才能游玩。开发模式截图显示统一调试浮钮，暂停在开发模式移到左侧，正式玩家模式仍在右侧。
- 暂停图标为两根等宽等高的 SVG 实心竖条；结算页保留刚结束的棋盘图层，提供下一关、重试、主页操作。

## 通过的验证

1. `pnpm --filter @coffeeeeffoc/carrom-club test`：10项纯规则测试，覆盖高速碰撞、边框反弹、落袋、换手、红后补进/返场、罚子/欠子、合法AI出杆、整局终止、六关物理可达和存档校验。
2. `pnpm --filter @coffeeeeffoc/carrom-club test:browser`：正式构建、390×844/320×640/844×390、摆位、回拉、取消、真实落袋胜利、真实空杆失败、暂停冻结/恢复、AI接杆、下一关解锁、刷新存档、声音偏好、全屏进入/退出以及存储/全屏拒绝降级；零页面异常。详见 `browser-report.json`。
3. `pnpm check:games`：67款游戏，0项配置问题；`pnpm check:dependencies`通过。
4. `pnpm check:dev-mode` 与 `pnpm test:dev-mode`：公共副本一致，5项语义测试通过。
5. `DEV_MODE_GAME_IDS=carrom-club pnpm test:dev-mode:browser`：该游戏独立/Shell的8种开关组合，加公共控件触屏拖动、取消、性能、记忆开关、退出以及同源/跨域iframe，共10项浏览器检查通过。公共乌龙城样本先按原测试要求构建，未改动公共测试语义。
6. `PAGES_GAME_IDS=["carrom-club"] PAGES_SKIP_BUILTINS=1 pnpm --filter @coffeeeeffoc/shell-web test:pages:games`：目录、真实iframe加载/出杆/暂停返回、独立手机触屏、宽度和Runtime隔离通过。保留原sandbox/权限约束。
7. `pnpm test:h5-fullscreen`：21份公共副本一致；独立、同源iframe、旁边有另一个游戏面板、拒绝和不支持分支通过。

## 发布边界

本次为 H5/手机 Web 与 Shell iframe；没有联网匹配、真实广告或原生微信/B站工程。桌面模拟不能证明真机触感、触觉反馈或帧率；声音/震动仍依赖设备支持与用户手势。规则为帮助页明确说明的休闲版，不声称完整赛事裁判规则。

代码提交后按仓库准确 base/head 候选流程验证；候选、正常 pre-push 和远端 CI/Pages 的最终状态分别核对，不能互相代替。运行日志保存在工作区 `.scratch/carrom-release/`，最终提交号与远端状态见交付说明。
