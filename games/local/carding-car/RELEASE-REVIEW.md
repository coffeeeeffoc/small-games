# 浪湾卡丁车发布体验改进 · 2026-09-21

## 好友联机弹窗紧凑化

- 创建/加入和邀请确认改为 620×390 居中卡片，较原 960×540 面积减少约 53%；房间列表使用 880×470，保留八人名单与房主操作空间。
- 深色实心卡片、全屏柔和遮罩、紧凑标题与表单间距；打开时隐藏后方车库面板，遮罩拦截底层入口点击。输入框仍为 46 高、按钮为 42 高，未修改原生 EditBox 生命周期。
- 当前源码通过类型检查、80 项规则测试、H5/微信/B站构建。双客户端联机回归覆盖 844×390、1280×585 的遮罩/关闭/重开、创建、触摸邀请加入、准备开赛、重连及退出；邀请回归覆盖输入、改配置、复制邀请、过期邀请与取消，均无页面错误。
- 截图与运行记录：`reports/multiplayer/entry-844.png`、`entry-1280.png`、`room.png`、`validation.json`，以及 `reports/loading-invitation/validation.json`。这是浏览器输入与构建验证，不替代微信/B站实体手机验收。

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

## 第二轮 · 教学中断后恢复（2026-09-21）

沿 `KartController.clear → RaceManager/driveKart → DrivingCoach.observe → HUD` 检查后，发现首局教学会在失去蓄力后继续要求“松手加速”：暂停、触控取消、刹车、撞墙都可能清空火花，此时按提示松手不会有漂移加速，也无法推进教学。

本轮仅修改 `DrivingCoach`：等待释放时一旦蓄力消失，只有真实有效释放才前进一步；其余情况返回“蓄出蓝色火花”，保留已经完成的起步与转向步骤。复用现有物理和教学，不新增练习关或系统。

- 针对性回归先在旧逻辑上失败，修复后通过：暂停不会误领完成；真实 `driveKart` 蓄力经过刹车、碰撞或输入取消后，提示返回蓄力，重新过弯、释放与氮气可以完成五步。
- 当前全量规则测试 **80/80**、类型检查、Prettier 和 `git diff --check` 通过。
- 当前 Cocos Creator 3.8.8 H5、微信和 B 站构建通过。微信主包 2,001,998 字节、总包 20,013,762 字节；B 站主包 2,002,646 字节、总包 20,014,410 字节，均通过脚本的包体限制检查。
- 当前 H5 构建 hash：`8ddd764efa332a72f63295458469cf9d3bdf993a9ddd8a7be65e1364c167547b`。`tests/driving-coach.mjs` 先核对当前源码 hash，再用真实键盘完成起步与蓄力、P 暂停、确认提示返回 3/5、恢复后以真实鼠标转向/键盘输入重新蓄力并完成五步。重载保留完成记录，H 可重学，390×844/844×390 旋转提示和无联机配置入口检查通过，未出现页面异常。
- 本轮浏览器证据为 `reports/driving-coach.json` 与 `reports/coach-*.png`；原生构建日志为 `reports/round2-wechat-console.log`、`reports/round2-bilibili-console.log`（均为 Git 忽略产物）。预览：`http://127.0.0.1:4198/`。

本轮没有重复完整三圈测试，也没有将历史独立评分当作本轮验收。`adb devices -l` 本轮未发现设备；微信/B 站真机输入、低端机性能和两机好友赛仍未验收。下一轮由新的评审 agent 按核心玩法 30%、首局 20%、移动体验 20%、重玩 15%、稳定性 15% 独立评分。
