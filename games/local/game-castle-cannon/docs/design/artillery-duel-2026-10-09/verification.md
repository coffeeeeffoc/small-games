# 双城炮战验证记录

环境：Windows、Node 24.21.0、pnpm 12.6.0、Chrome、Three.js WebGL2。手机画面来自桌面 Chrome 的尺寸和 CDP 触屏模拟，不是真机。基线远端 dev：`c2d98b038f44012e29e6b7e35b888d103b1397d2`。

## 实现与验收

- A01/A14/A15：真实本地 HTTP/SSE 双客户端匹配，权威弹道、序号去重、拒绝改血量/伪动作，版本/来源/凭证/请求体校验。8 秒机器人补位、取消排队、同局重连与退出胜负。腾讯云部署依用户最新指示暂缓，公网延迟和负载未验证。
- A02/A03/A04/A05/A07：实际触屏拖动调炮、独立望远镜、按住蓄力松手发射、取消不发射、多点趴下、独立装填，以及确定性弹道和线段碰撞。普通炮可到场检修，6 秒内仍可受伤；离开/趴下暂停，近处爆炸重置检修，完成后仍需装填，防止双炮失效而城未毁时无力反击。
- A06/A08/A09/A10/A11/A12/A13：可见路线换位/撤退、抵达后有限渐进治疗、濒死红边、局部破坏/遮挡/范围衰减、支撑坍塌、城毁撤离地堡炮、生命归零结束、同一步双死平局及同规则机器人。
- A16/A17/A18：844×390 横屏、390×844 竖屏旋转兜底、iframe、Shell 嵌入和直接手机入口。设置/帮助/外观/暂停/结算/返回，全屏退出后继续导航；旧存档/外观/设置保留，记录按模式隔离。统一 dev 覆盖独立/Shell 默认关闭、URL、存储、显式关闭，并保留公共移动面板和跨域样本。

## 自动校验

游戏 Vitest 64 条测试，包括保留的旧存档/素材测试及新增对战规则、网络、输入和存档测试。类型检查、lint、生产前端及服务端构建通过。仓库游戏登记和依赖边界通过；统一 dev 静态/单元检查、定向生产浏览器 10 项检查通过；Shell 嵌入、390×844 实际触屏操作和返回通过。发布分类 25 项测试通过，新的游戏行为契约只选择 castle-cannon，不放宽其他共享脚本检查。

`smoke` 的 5 组详细清单见 [actual/verification.json](actual/verification.json)。[concept.png](concept.png) 为设计依据，实际截图来自运行的新版本。

## 画面对照

- [主页](actual/landscape-home.png)、[练习地图](actual/landscape-maps.png)：沿用石木和黄铜风格，突出主要操作。
- [炮战](actual/landscape-shot.png)、[望远镜](actual/landscape-scope.png)、[城墙炮](actual/landscape-wall-gun.png)：远城、近炮、装填/蓄力反馈及拇指操作。保留上一炮真实轨迹，没有必中预览。
- [转移](actual/landscape-moving.png)、[趴下](actual/landscape-crouch.png)、[竖屏](actual/portrait-shot.png)、[iframe](actual/iframe-shot.png)：完整界面旋转与触点映射。暂停为两根等高分离实心竖条。
- [濒死](actual/critical-injury.png)、[治疗](actual/critical-healing.png)、[城毁](actual/critical-exposed-bunker.png)、[地堡炮](actual/critical-bunker-gun.png)：红边不挡操作，地堡采用集成的 Hyper3D 模型。
- [真人战斗](actual/human-blue-battle.png)、[另一侧](actual/human-red-battle.png)、[胜利](actual/human-red-victory.png)：来自两个实际配对客户端。

实际画面复用现有模型和常驻炮位控件，没有逐像素复制概念图的电影光照及装饰。摄像机已调整以避免支撑柱遮挡近景炮身。

## 限制与发布

素材缺口仅新增地堡，Rodin ID `cc9076e8-ca33-4927-9c41-d8572ccf9a91`，[永久来源](https://hyper3d.ai/workspace/rodin/cc9076e8-ca33-4927-9c41-d8572ccf9a91)，源文件和哈希在 `source/`。炮、角色、城楼、山地、树石、材质及音效复用。

标准画质 768×432 3D 渲染，省电 384×216 且关闭阴影；HUD 独立保持清晰。[性能记录](actual/performance-evidence.json) 为这台桌面 RTX 3070 Ti 的 15 秒采样，约 61 FPS，不代表手机性能。

原生发布门禁依仓库当前默认暂缓；未运行微信开发者工具、真机、原生联网桥或公网负载验收。没有修改腾讯云部署。准确候选的正常门禁、dev 推送、CI/Pages 状态在最终交付核对，不将本地通过写成线上发布成功。
