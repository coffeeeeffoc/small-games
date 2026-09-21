# 浪湾卡丁车发布体验改进 · 2026-09-21

## 本轮判断与实现

原版本有完整三圈竞速与漂移，但首局只堆操作说明、路线纪录未成为明确目标，未接入好友服务时仍邀请玩家创建房间。

- 新增五步驾驶指导，观察真实起步、持续转向、蓄出火花、释放漂移与触发氮气；暂停清空蓄力不会误领教学完成。教学完成存储在本机，H/触控按钮可重学或收起。联机比赛不显示这套本地教学。
- 复用现有每路线最快五场记录，开赛前显示个人纪录目标，完赛显示金/银/铜牌及比开赛前纪录快/慢多少秒。
- H5 竖屏提示横过手机；统一准备页的游戏名。默认配置可直接开跑。
- 未配置 endpoint 时明确显示“好友赛待开放”，隐藏创建/加入操作，解释可关闭面板进行单机竞速。保留此前已有的 Bilibili EditBox blur 修改和 keyboard 测试文件。

没有新增服务、依赖或经济系统。未部署公网联机；微信/B站两台真机邀请与性能不计为已验证。

## 验证

- `pnpm --filter @coffeeeeffoc/carding-car test`：79/79 通过；新增规则回归覆盖教学真实达成、暂停不误判、无氮气冷却变化不计入完成、纪录时间差。
- `pnpm --filter @coffeeeeffoc/carding-car typecheck`：通过。
- `pnpm --filter @coffeeeeffoc/carding-car build`：Cocos Creator 3.8.8 当前源码 H5 构建通过。
- `node games/local/carding-car/tests/driving-coach.mjs`：核对当前构建源码 hash 后，用真实键盘完成五步，检查本机完成记忆、H 重学、390×844 竖屏与 844×390 横屏提示、模拟生产域名的未配置联机页面。
- `pnpm --filter @coffeeeeffoc/carding-car test:browser`：真实键盘/多指触控、取消、暂停、重赛、360/390 竖屏、成绩持久化与损坏数据恢复通过。三圈 164.84 秒，30 次加速、0 次护栏碰撞、0 次复位，浏览器采样 FPS 中位数和 P10 均为 60。此完整跑圈基于本轮首个构建，之后仅调整未配置联机显示、联机不显示本地教学与格式；最终构建再跑上述教学/入口 smoke。
- `git diff --check -- games/local/carding-car`：通过。

证据（Git 忽略）：`reports/browser.json`、`reports/driving-coach.json`、`reports/coach-menu.png`、`reports/coach-drift.png`、`reports/coach-complete.png`、`reports/coach-portrait.png`、`reports/coach-offline.png`、`reports/finish.png`。

浏览器驾驶沿只读快照给出的建议路线施加真实输入，并非陌生玩家成绩；浏览器模拟与 FPS 不代替真机验收。最终产品分数交由独立复评 agent，不用实现者自评分代替验收。
