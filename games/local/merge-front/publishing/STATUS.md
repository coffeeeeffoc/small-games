# 神机合阵发布资料

- Game ID：merge-front；更新时间：2026-10-25。
- 当前版本：点击直接购买、全区域长按详情、棋盘下方备战手牌与独立底部商店。规则3、内容2、对局v4不变；运行源码指纹 `909297d55a44db864ac0ad6c30a29c4758399c6abe32c76530f7e05e2e2ad6e1`，开发提交身份随所在Git提交固定。
- 目标：横屏手机 Web / H5 基础素材。闭环为三选一开局 → 点击购买/配字/施法 → 触屏拖动布阵/合并 → 开战锁阵 → 攻晶结算 → 收入递增再整备，支持胜负重试、暂停和刷新恢复。
- 证据：[本轮浏览器报告](gameplay/bench-browser-report.json)、[验证说明](../docs/design/shop-synergies-2026-10-23/VALIDATION.md)。19组真实Creator浏览器记录通过；43项自动测试通过。下一步按正式发布渠道要求验收真机与广告，CI/Pages部署结果单独核对。

| 类别 | 状态 | 当前文件与规格 | 最近验证 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [简介](copy/introduction.md)，UTF-8，含点击购买/长按详情 | 2026-10-25，核对当前实现 |
| 一句话推荐语 | 已提供 | [推荐语](copy/tagline.md)，UTF-8 | 2026-10-25，沿用仍适用内容 |
| 开发者的话 | 已提供 | [开发说明](copy/developer-note.md)，UTF-8 | 同上 |
| 图标 | 已提供 | [哪吒图标](icon/nezha-1254-square.png)，1254×1254 PNG，不透明 | 2026-10-23，已打开核对；本轮沿用 |
| 宣传图 | 已提供 | [主视觉](promo/images/round-formation-landscape.png)，1672×941 PNG，插画而非游戏截图 | 同上 |
| 宣传视频 | 已更新 | [交互短片](promo/videos/bench-interaction-1280x720.mp4)，1280×720 H.264，无声，18秒；插画片头+当前真实触屏操作/战斗/攻晶 | 2026-10-25，ffprobe及解码帧核对；片段见bench-edit.json |
| 游戏内截图 | 已更新 | [整备](gameplay/screenshots/bench-planning.png)、[战斗](gameplay/screenshots/bench-battle.png)、[商品详情](gameplay/screenshots/bench-long-press-shop.png)、[场上详情](gameplay/screenshots/bench-long-press-own.png)，1152×540；另含568×320分页/购入与320×568旋转详情 | 2026-10-25，实际Creator Web与人工查看 |
| 游戏内视频 | 已更新 | [实际操作](gameplay/videos/bench-interaction-1152x540.mp4)，1152×540 H.264，无声，30秒 | 2026-10-25，Chromium触屏录屏、规格与解码帧核对 |

逐文件尺寸、SHA-256与字节数见 [清单](media-manifest.json)。图标、插画、场景、水晶及2.5D角色图集沿用，不是骨骼3D。本轮bench-*媒体来自当前真实Creator产物，shop-*与round-formation-*保留为历史媒体。

主流程采用种子18合法开局，录屏包含购买、长按、配字及拖动交互，也保留无效操作的真实反馈；第三轮展陈用种子37通过生产AI和合法购买生成。小屏多页手牌同样由合法回合/购买累积。宣传片拼接不同对局，均未虚构单位、战果或加速。详见 [剪辑表](promo/videos/bench-edit.json)。

手机浏览器模拟不等同于物理设备和微信/抖音/B站真机。八类基础资料已备齐，尚未提交渠道审核；真实广告填充、原生渠道打包和真机验收未执行。既有可选H5激励接线继续生效，空广告位关闭奖励入口且免费玩法可用，见[接入表](../../../../docs/operations/taptap-rewarded-ads.md#十三款可选激励接入2026-10-24)。
