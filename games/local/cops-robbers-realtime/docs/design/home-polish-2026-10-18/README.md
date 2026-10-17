# 首页与分享调整 · 2026-10-18

沿用街区、警察和小偷素材，保持竖屏为主并适配横屏。主操作仍为开始游戏 → 选关 → 游玩；设置、装扮与帮助使用原页面。

- 根据用户截图修正“别跑”标题：取消多层位移阴影，保留细描边。
- [更新效果图](concept.png)：头像靠左上，设置在其下方。实际实现按设备刘海、状态栏安全区加 4px 放置，不以右侧胶囊底部作为左侧控件起点；中央标题仍避让胶囊。
- 首页“分享游戏”生成不带关卡、开发参数和邀请凭证的入口；选关、暂停及结算页“分享当前关卡”保留关卡、角色、规则和先手。
- 从暂停、胜负页分享后返回原页；浏览器历史中的每个分享页保存自己的内容和返回来源，分享期间不推进对局。
- 无服务包在 HTML 阶段隐藏好友 PK、全站榜及对应容器；不加载竞赛客户端，不发出后端请求。全屏按钮移除。

## 实际验证

环境为本机 Chromium，手机尺寸和触屏模拟；宿主胶囊、SDK 安全区、广告回调均为测试夹具。不是手机真机验证。

- 三款游戏安全区：390×844、320×568、844×390、568×320，以及普通浏览器和 iframe，共 18 组。检查左上图标紧贴 cutout、主要控件可触达、游玩及暂停/返回。
- 实时版：320×740、390×844、844×390，触屏下令、手势取消、通关/真实超时、暂停恢复、存档、分享返回、旧分享历史恢复、iframe。
- 三款无服务/配置服务构建：离线零 API 请求、旧邀请/房间存档不复活；在线夹具只使用配置地址。实际全站服务未发布。
- 共享安全区与关卡/分享单测 20 项；服务配置相关 4 项；开发模式静态检查、5 项单测、三款独立/Shell 入口与公共触屏操作共 26 项浏览器检查。

命令：`node platforms/h5/tests/safe-area.browser.mjs`、`node scripts/competition-service.browser.mjs`、`node games/local/cops-robbers-realtime/tests/publishing.browser.mjs`、`DEV_MODE_GAME_IDS=cops-robbers,cops-robbers-realtime,xiangqi-five node scripts/test-game-dev-mode.mjs`（PowerShell 使用 `$env:DEV_MODE_GAME_IDS`）。

[手机首页](actual/home-mobile.png) · [模拟宿主首页](actual/home-host.png) · [运行验证记录](actual/verification.json) · [安全区记录](actual/safe-area.json)

效果图使用 imagegen，以用户提供的首页为参考保留美术；第二版只将头像移到画布左上约 8px，设置随之上移。代码以真实安全区为准，并保留 44px 以上触控热区。
