# 克朗棋验收记录

日期：2026-10-11。Linux 云环境，Node 24.21.0、pnpm 12.6.0、Chromium 151.0.7922.173。手机视口与原生 CDP 触控输入，不是物理手机或原生小游戏宿主验收。

## 积分与好友房间

设计依据为 `../friends-2026-10-11/concept.png`。沿用深绿桌毡、木盘和黄铜控件，主页增加好友对战入口；独立房间页提供创建、输入房号/邀请、准备、复制邀请和退出。双端各自底线朝下，黑方触屏坐标与滑轨反向映射。席位同时显示积分和本色入袋数，红后成功补进显示加 3 分；结算比较双方积分，同分清台方胜，练习保留目标和杆数评星。

`actual-home-390.png`、`actual-match-390.png`、`actual-aim-390.png` 对照生成效果图；`friends-*.png` 来自真实 HTTP 服务与独立身份的双浏览器流程。原有选关、暂停、胜负和小屏/横屏截图继续保留。暂停仍为两根 SVG 实心竖条。未添加效果图中的额外角度按钮，继续直接回拉操控。

## 触控与性能

未命中目标时角度增益为 1；命中真实首个目标球时降低到 0.22，并对短回拉限幅。青蓝实线箭头、深描边、目标环与浅色虚线同时提供颜色和形状区别。保留 1.75 CSS px 死区与静止后短暂偏移过滤。

正式构建触控回归覆盖：未命中时保持 4px 横移转向 4–8°，真命中时同等微调小于 1.2°；停止后不漂移；松手前偏移不改变实际出杆角度；回到起点、取消、多指和失焦不误发。暂停恢复、真实落袋胜利、杆数失败、AI 接杆、解锁和存档均通过。视口 390×844、320×640、844×390，详情见 `browser-report.json`。

摆位不再使完整 HUD 失效；棋盘尺寸与棋子精灵缓存，静止时按需绘制。预热后连续 120 次独立绘制，新增渐变和画布尺寸读取均为 0；主界面 30 次摆位及松手测试中，事件栈内存档写入为 0，随后合并为 1 次写入，预热帧无渐变重建和画布布局读取。后台/退出前刷新待保存数据。此证据说明已移除所定位热点，不能等同于真机帧率保证。

## 验证命令与证据

- `pnpm --filter @coffeeeeffoc/carrom-club test`：物理、计分、犯规退分、红后逆转、平分、六关可达、旧存档、目标感知瞄准、房间协议、幂等恢复、邀请脱敏和联网构建配置。
- `pnpm --filter @coffeeeeffoc/carrom-club build` 后 `pnpm --filter @coffeeeeffoc/carrom-club test:browser`：生产制品的手机触控、全流程及性能热点检查，记录在 `browser-report.json`。
- Runtime 的 `tests/carrom.test.ts`：服务端权威出杆、错误席位/输入拒绝、确定性、红后积分、认输与超时结算；`tests/carrom-deployment.test.ts` 验证实际部署目录可以导入规则并执行物理。
- 设置 `CARROM_TEST_DATABASE_URL` 指向隔离的 `competition_test` 数据库，运行 `pnpm --filter @coffeeeeffoc/runtime-api exec vitest run tests/carrom.integration.test.ts`：实际 HTTP 独立身份、成员授权、双方准备、并发重复序号、同步、续局与退出。
- 启动上述隔离 Runtime，设置 `CARROM_TEST_API_URL=http://127.0.0.1:43002/api/competition/v1`，运行 `node games/local/carrom-club/tests/friends-browser.mjs`：自动构建并启动 43010 静态端，双手机视口实际触控，记录在 `friends-browser-report.json`。API 须允许该本地 Origin。覆盖重试按钮取消/拖出热区不提交、触屏点击去重、带邀请参数刷新保留未确认出杆、续局更新 URL 并刷新保持新房、退出清理邀请参数。
- `DEV_MODE_GAME_IDS=carrom-club node scripts/test-game-dev-mode.mjs`：独立/Shell 四种开关共 8 项，加固定手机触控和跨域 iframe 场景，共 10 项通过，0 错误。只构建 Shell 必要依赖及乌龙城固定测试样本，未运行全量 `build:pages`。
- 公共开发模式副本与单测、游戏注册、依赖边界，以及 Runtime typecheck/lint 均通过。发布分类测试严格限定新增核心输入，不放宽其他部署变更。

## 发布边界

本次交付 H5/手机 Web、Shell iframe 与现有 Runtime API 的联网好友规则。腾讯同源站点仍须部署含新规则的 Runtime；GitHub Pages 等分离静态站点须设置公共 competition API 地址及服务端 Origin 白名单。单独推送或静态发布不代表线上 Runtime 已更新。原生微信/B站工程、真机帧率及触觉反馈不在本次实测范围。

代码提交后对准确 base/head 执行候选验证，再保留正常 pre-push 推送；远端 CI/Pages 状态单独核对。候选日志保存在工作区 `/workspace/scratch/carrom-release/`，最终提交与远端状态见交付说明。
