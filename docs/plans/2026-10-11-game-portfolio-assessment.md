# 游戏产品评估与分类（2026-10-11）

本轮覆盖磁盘与 Shell 登记的 **67 款**游戏：63 款本地游戏、4 款子模块游戏。用户列出的 **26 款全部保留并暂定潜力低 / 暂缓投入**；其他 **41 款按用户意向暂定有趣 / 有潜力**，不因本次初评擅自下调。重复标点和名称空格按登记标题归一化。

静态人工初评：逐款阅读目录登记与可用README；本次未进行全量真机、用户留存或付费验证。平台为推荐目标，分享/对战为适合方向，不代表渠道或功能已经上线。

本文件以静态产品初评为基线，七款候选的“本轮已落实”记录实际完成的改造；原生渠道真机、真实广告与线上留存仍需后续验证，不将候选标为正式上线。最终 CI 与发布结果以交付记录为准。爆款需要真实获客、留存、分享和收入数据支撑，本次没有足够证据分配“爆款”或“毫无潜力”。分类是仓库内人工维护的静态判断，不调用运行时 AI 分类 API。

## 使用方式

Shell 保留全部游戏入口，支持全部游戏 / 本轮优先 / 暂缓投入分组。按可玩性、推荐平台、玩法类型、拓展方向多选；同一组采用 OR，不同组及关键词之间采用 AND。每个标签计数保留其他组条件，忽略本组条件；顶部为最终匹配数。搜索、视图和筛选写入 URL，刷新、浏览器后退以及退出游戏后可恢复。清空搜索只清搜索，清空筛选只清标签与分组，重置全部同时清空。评估详情可在简洁或卡片模式展开。

数据来源：[game-assessments.json](../../apps/shell-web/src/game-assessments.json)。推荐平台不等于已构建成功；分享、同题、对战标签表示适合方向，不把本地 AI 或模拟匹配视为真实联网。卡片明确标识“本次未进行全量真机验证”。

## 本轮优先与发布顺序

1. **转塔留一脚刹车、打破笼子接住人**：移动竖屏，低学习门槛，优先提升危险可读性、连续成功反馈和同局挑战。
2. **星轨弹珠、熔光弹珠**：移动竖屏，优先回合节奏、局内恢复、连锁反馈及同种子分享。
3. **三块选两块、苔光花园**：移动竖屏，优先拖放/格子触控、解题反馈与每日同题，保持模式成绩隔离。
4. **弹指擂台**：移动竖屏，优先物理走位反馈、同屏对战、种子挑战与公平结果。

后续候选：克朗棋已有权威好友房，不重复造联机；围捕小队、街区追捕、词屿、乌龙城可继续验证成熟循环。浪湾卡丁车的 Cocos 资源、构建与低端手机性能验证是单独工作，本轮不宣称已优化或发布。Web 优先的声学沙盒、鲁班锁、三维谜盒、炮战等保持大屏精确交互，不为平台数量牺牲交互。

广告只适合结果页、章节间等自然停顿和玩家主动选择的奖励机会。不得插入瞄准/拖放/实时对抗过程；提示、重试或基本进度不能只靠观看广告解锁。模拟广告与真实渠道广告都需频次、关闭和奖励完整观看校验。生产后端、原生渠道与环境变量接入以各实现文档和实际验收为准。

## 全量索引

| 游戏                                                | ID                             | 初评          | 主平台 / 方向       | 本轮     |
| --------------------------------------------------- | ------------------------------ | ------------- | ------------------- | -------- |
| [三分钟修仙](#game-cultivation)                     | `cultivation`                  | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [秋声斗蟋](#game-cricket)                           | `cricket`                      | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [打工人摸鱼记](#game-office)                        | `office`                       | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [电子斗蛐蛐](#game-arena)                           | `arena`                        | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [忙碌的电工](#game-building-power)                  | `building-power`               | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [克朗棋 · Carrom Club](#game-carrom-club)           | `carrom-club`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [转塔留一脚刹车](#game-tower-brake)                 | `tower-brake`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [追贼别撞墙](#game-chase-thief)                     | `chase-thief`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [星扣工坊](#game-orbit-atelier)                     | `orbit-atelier`                | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [苔光花园](#game-moss-garden)                       | `moss-garden`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [星轨弹珠](#game-ball-roguelite)                    | `ball-roguelite`               | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [熔光弹珠](#game-ember-bounce)                      | `ember-bounce`                 | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [天下岔路](#game-tianxia-chalu)                     | `tianxia-chalu`                | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [声纹疑案](#game-voiceprint-case)                   | `voiceprint-case`              | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [回声实验室 · Echo Lab](#game-echo-lab)             | `echo-lab`                     | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [迷境漫游](#game-maze-wander)                       | `maze-wander`                  | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [街区突围](#game-urban-breakout)                    | `urban-breakout`               | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [归途站](#game-homebound-station)                   | `homebound-station`            | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [浪湾卡丁车](#game-carding-car)                     | `carding-car`                  | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [神机合阵](#game-merge-front)                       | `merge-front`                  | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [合成守夜人](#game-night-merge)                     | `night-merge`                  | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [潮汐猎手](#game-fishing)                           | `fishing`                      | 潜力低 / 暂缓 | 移动端小游戏 / 横屏 | 保留     |
| [月森守卫](#game-tower-defense-game)                | `tower-defense-game`           | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [象五子棋](#game-xiangqi-five)                      | `xiangqi-five`                 | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [工位偷闲 · 第一人称](#game-office-slacking)        | `office-slacking`              | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [围捕小队](#game-cops-robbers)                      | `cops-robbers`                 | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [街区追捕](#game-cops-robbers-realtime)             | `cops-robbers-realtime`        | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [来电之间](#game-h5-security)                       | `h5-security`                  | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [词了个词 · 单词消消乐](#game-letters-words)        | `letters-words`                | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [词屿 · 字母叠叠乐](#game-letters-words2)           | `letters-words2`               | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [万象旅团](#game-multi-battle)                      | `multi-battle`                 | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [雨停之前](#game-puzzle)                            | `puzzle`                       | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [去野 · 大理漫游记](#game-travel)                   | `travel`                       | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [江风入境 · 外滩漫游](#game-travel-bund)            | `travel-bund`                  | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [外滩 · 空中漫游](#game-travel-bund-25d)            | `travel-bund-25d`              | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [外滩·一江入梦](#game-travel2)                      | `travel2`                      | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [橘风速递](#game-vibejam-myself-delivery)           | `vibeJam-myself-delivery`      | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [此时 · 此地](#game-vibejam-myself-history-guess)   | `vibeJam-myself-history-guess` | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [零域 · NULL RANGE](#game-vibejam-myself-nullrange) | `vibeJam-myself-nullrange`     | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [折叠世界](#game-fold-the-world)                    | `fold-the-world`               | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [一笔造关](#game-one-stroke-course)                 | `one-stroke-course`            | 潜力低 / 暂缓 | 移动端小游戏 / 横屏 | 保留     |
| [抱紧了！杂技探险队](#game-hold-tight-acrobats)     | `hold-tight-acrobats`          | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [乌龙城](#game-wulong-city)                         | `wulong-city`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [气球搬家公司](#game-balloon-movers)                | `balloon-movers`               | 潜力低 / 暂缓 | 移动端小游戏 / 横屏 | 保留     |
| [天气指挥部](#game-weather-command)                 | `weather-command`              | 潜力低 / 暂缓 | 移动端小游戏 / 横屏 | 保留     |
| [镜头外发生了什么](#game-off-camera)                | `off-camera`                   | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [小城救援队](#game-rescue-team)                     | `rescue-team`                  | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [一分钟拆对墙](#game-precision-demolition)          | `precision-demolition`         | 潜力低 / 暂缓 | 移动端小游戏 / 竖屏 | 保留     |
| [Afterimage Arena](#game-afterimage-arena)          | `afterimage-arena`             | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [Ghost Shift Manager](#game-ghost-shift-manager)    | `ghost-shift-manager`          | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [夜航守望](#game-night-overwatch)                   | `night-overwatch`              | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [Rule Thief](#game-rule-thief)                      | `rule-thief`                   | 潜力低 / 暂缓 | Web端 / 横屏        | 保留     |
| [水位联动站](#game-waterline-station)               | `waterline-station`            | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [同频归航](#game-tiny-signals)                      | `tiny-signals`                 | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [子弹花园 · Bullet Garden](#game-bullet-garden)     | `bullet-garden`                | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [一滴墨，决定一切](#game-ink-is-everything)         | `ink-is-everything`            | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [Out of Frame · 框外静止](#game-out-of-frame)       | `out-of-frame`                 | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [回声编织 · Echo Weaver](#game-echo-weaver)         | `echo-weaver`                  | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [双面机关盒](#game-two-sided-box)                   | `two-sided-box`                | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [榫间 · 鲁班锁](#game-luban-workshop)               | `luban-workshop`               | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [惊喜别穿帮](#game-surprise-kept)                   | `surprise-kept`                | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 后续验证 |
| [收兵再冲](#game-retreat-rally)                     | `retreat-rally`                | 有趣 / 有潜力 | 移动端小游戏 / 横屏 | 后续验证 |
| [一炮拆城](#game-castle-cannon)                     | `castle-cannon`                | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [重力方舱](#game-tetracube)                         | `tetracube`                    | 有趣 / 有潜力 | Web端 / 横屏        | 后续验证 |
| [打破笼子接住人](#game-cage-rescue)                 | `cage-rescue`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [弹指擂台](#game-flick-arena)                       | `flick-arena`                  | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |
| [三块选两块](#game-three-choose-two)                | `three-choose-two`             | 有趣 / 有潜力 | 移动端小游戏 / 竖屏 | 优先优化 |

<a id="game-cultivation"></a>

## 三分钟修仙 · `cultivation`

- **标签**：潜力低 / 暂缓投入（用户指定）；动作、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：吐纳、探索、渡劫有完整三分钟循环，携带机缘形成取舍。
- **不足 / 风险**：短局承载摇杆、蓄力、瞄准与多技能，首局学习负担较高。
- **下一步**：若重启，只保留一项攻击与一次闪避，验证首局渡劫到达率。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-cultivation/README.md](../../games/local/game-cultivation/README.md)；静态初评，未全量真机验证。

<a id="game-cricket"></a>

## 秋声斗蟋 · `cricket`

- **标签**：潜力低 / 暂缓投入（用户指定）；动作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：蓄势与收梗闪避有明确时机对抗，三擂结构紧凑。
- **不足 / 风险**：与电子斗蛐蛐题材和核心节奏重叠，三擂复玩变化有限。
- **下一步**：合并验证素材，先测蓄力金区和敌方前摇是否一眼可懂。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-cricket/README.md](../../games/local/game-cricket/README.md)；静态初评，未全量真机验证。

<a id="game-office"></a>

## 打工人摸鱼记 · `office`

- **标签**：潜力低 / 暂缓投入（用户指定）；潜行、叙事。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：工位潜入题材易理解，周一迟到具有生活共鸣。
- **不足 / 风险**：登记仅开放周一首关，一周内容循环尚不完整。
- **下一步**：保留首关，先验证三十秒内能否理解躲避巡查的目标。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[apps/shell-web/src/registry.ts](../../apps/shell-web/src/registry.ts)；静态初评，未全量真机验证。

<a id="game-arena"></a>

## 电子斗蛐蛐 · `arena`

- **标签**：潜力低 / 暂缓投入（用户指定）；动作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：距离、蓄势、回气与闪避实际影响五擂胜负。
- **不足 / 风险**：与秋声斗蟋重复，回气和体力惩罚可能盖过爽快出手。
- **下一步**：明确两作差异后再投入，先测命中反馈与失败原因。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-arena/README.md](../../games/local/game-arena/README.md)；静态初评，未全量真机验证。

<a id="game-building-power"></a>

## 忙碌的电工 · `building-power`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、模拟调度。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：天气、功耗与住户需求让错峰供电有真实决策。
- **不足 / 风险**：需要同时读需求、时间和瓦数，娱乐反馈弱于调度信息。
- **下一步**：将首关压缩为两户一次救急，强化住户反馈再测理解率。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-building-power/README.md](../../games/local/game-building-power/README.md)；静态初评，未全量真机验证。

<a id="game-carrom-club"></a>

## 克朗棋 · Carrom Club · `carrom-club`

- **标签**：有趣 / 有潜力（用户暂定）；物理操作、竞技。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：Web端、APP端。
- **优点**：回拉击球贴合触屏，红后补进与六关练习兼顾手感和深度。
- **不足 / 风险**：精细瞄准依赖小屏稳定性，红后与犯规规则需要渐进解释。
- **下一步**：优化松手容错与首杆引导，验证房间重连、结算和好友邀请。
- **拓展方向**：好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/carrom-club/README.md](../../games/local/carrom-club/README.md)；静态初评，未全量真机验证。

<a id="game-tower-brake"></a>

## 转塔留一脚刹车 · `tower-brake`

- **标签**：有趣 / 有潜力（用户暂定）；短局街机、动作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：转塔与一次刹车易上手，连穿三层补刹车形成风险回报。
- **不足 / 风险**：被上层遮住的危险区影响公平感，八塔复玩目标较少。
- **本轮已落实**：连穿倍率得分与目标分比较；固定路线分享挑战隔离正常解锁；下一关自然断点接入频控模拟广告，保留免费续关。
- **下一步**：继续验证小屏落点预告与连穿风险回报，补真实用户首局完成率、复玩率及原生渠道验收。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/tower-brake/README.md](../../games/local/tower-brake/README.md)、[games/local/tower-brake/docs/design/publishing/README.md](../../games/local/tower-brake/docs/design/publishing/README.md)、[games/local/tower-brake/docs/design/publishing/browser-report.json](../../games/local/tower-brake/docs/design/publishing/browser-report.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-chase-thief"></a>

## 追贼别撞墙 · `chase-thief`

- **标签**：有趣 / 有潜力（用户暂定）；短局街机、动作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：滑动换道、跳跃、滑铲符合手机直觉，稳三段换冲刺。
- **不足 / 风险**：三街区的障碍组合和目标变化有限，动作窗口需实测。
- **下一步**：突出追近瞬间与连续闪避，按同路线计分邀请好友挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/chase-thief/README.md](../../games/local/chase-thief/README.md)；静态初评，未全量真机验证。

<a id="game-orbit-atelier"></a>

## 星扣工坊 · `orbit-atelier`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、物理操作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：圆周拖动与解环反馈直接，24张星盘有可达性验证。
- **不足 / 风险**：多圆环交叠时选中对象与缺口识别可能困难。
- **下一步**：扩充触控热区和选中反馈，按操作数分享同盘挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/orbit-atelier/README.md](../../games/local/orbit-atelier/README.md)；静态初评，未全量真机验证。

<a id="game-moss-garden"></a>

## 苔光花园 · `moss-garden`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、休闲观景。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：Web端。
- **优点**：30关唯一解、撤销与解释提示适合安静碎片时间。
- **不足 / 风险**：规则与经典区域逻辑题接近，大棋盘依赖准确点格。
- **本轮已落实**：同关异步挑战可比较好友自报提示次数、调整次数和用时；挑战不越级解锁且隔离原存档；扩大非棋盘按钮触控区，结算接频控模拟广告。
- **下一步**：验证大棋盘误触率和首次规则理解，维护每日花圃的新鲜度；分享目标为自报数据，平台广告和认证排名仍需验收。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-moss-garden/README.md](../../games/local/game-moss-garden/README.md)、[games/local/game-moss-garden/docs/design/publishing-2026-10-11/design.md](../../games/local/game-moss-garden/docs/design/publishing-2026-10-11/design.md)、[games/local/game-moss-garden/docs/design/publishing-2026-10-11/publishing-browser.json](../../games/local/game-moss-garden/docs/design/publishing-2026-10-11/publishing-browser.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-ball-roguelite"></a>

## 星轨弹珠 · `ball-roguelite`

- **标签**：有趣 / 有潜力（用户暂定）；物理操作、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：七列弹射、六类叠加强化和双模式检查点形成持续成长。
- **不足 / 风险**：高球数会拉长等待；强度叠加可能掩盖瞄准策略。
- **本轮已落实**：六连击奖励下轮加球（最多三颗）；保存初始种子并支持分享、重试及目标成绩比较；挑战隔离普通存档，下一关使用频控模拟广告。
- **下一步**：继续测高球数等待时长和强化平衡，验证同种子挑战的分享回流；旧存档无种子不能冒充可复现挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/ball-roguelite/README.md](../../games/local/ball-roguelite/README.md)、[games/local/ball-roguelite/docs/design/publishing/README.md](../../games/local/ball-roguelite/docs/design/publishing/README.md)、[games/local/ball-roguelite/docs/design/publishing/browser-report.json](../../games/local/ball-roguelite/docs/design/publishing/browser-report.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-ember-bounce"></a>

## 熔光弹珠 · `ember-bounce`

- **标签**：有趣 / 有潜力（用户暂定）；物理操作、短局街机。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：拖动弹射直观，熔晶碎裂与连续反弹有即时反馈。
- **不足 / 风险**：与星轨弹珠接近，上移警戒线规则需独立教学。
- **本轮已落实**：回合与强化检查点支持主页/重载续玩及旧存档迁移；同关少轮数好友自报挑战独立保存并比较目标；普通结算接频控模拟插屏，修复触屏换页兼容click误触。
- **下一步**：保持借墙反弹的独特目标，真人验证每轮等待和复玩意愿；补原生渠道真机与真实广告验收，不把自报轮数视作权威排名。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/ember-bounce/README.md](../../games/local/ember-bounce/README.md)、[games/local/ember-bounce/docs/design/resume-challenge-2026-10-11.md](../../games/local/ember-bounce/docs/design/resume-challenge-2026-10-11.md)、[games/local/ember-bounce/docs/design/resume-challenge-2026-10-11/browser-report.json](../../games/local/ember-bounce/docs/design/resume-challenge-2026-10-11/browser-report.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-tianxia-chalu"></a>

## 天下岔路 · `tianxia-chalu`

- **标签**：有趣 / 有潜力（用户暂定）；策略、竞技。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：仅点岔口即可影响补给线，少操作承载战争策略。
- **不足 / 风险**：自动行军的归因不如直接操兵清晰，多路失守易失控。
- **下一步**：强化路线预览和失守警报，先测三路战图再扩展好友对局。
- **拓展方向**：好友对战、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/tianxia-chalu/README.md](../../games/local/tianxia-chalu/README.md)；静态初评，未全量真机验证。

<a id="game-voiceprint-case"></a>

## 声纹疑案 · `voiceprint-case`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、声音。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：同句不同声音与渐进噪声有辨识度，12关支持反复试听。
- **不足 / 风险**：强依赖可听环境和听觉差异，内容量制约复玩。
- **下一步**：增加非答案式重听提示与耳机校准，分享正确率而非答案。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/voiceprint-case/README.md](../../games/local/voiceprint-case/README.md)；静态初评，未全量真机验证。

<a id="game-echo-lab"></a>

## 回声实验室 · Echo Lab · `echo-lab`

- **标签**：有趣 / 有潜力（用户暂定）；创作沙盒、声音。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：实际几何声路、房间链接与音频导出适合创作分享。
- **不足 / 风险**：更接近声音实验工具，缺少明确胜负和短局动力。
- **下一步**：Web保留精确拖动，增加可选回声任务和作品试听卡。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/echo-lab/README.md](../../games/local/echo-lab/README.md)；静态初评，未全量真机验证。

<a id="game-maze-wander"></a>

## 迷境漫游 · `maze-wander`

- **标签**：有趣 / 有潜力（用户暂定）；探索、益智解谜。
- **目标**：Web端优先，横屏；其他可探索平台：APP端。
- **优点**：20迷宫、标记、镜面与捷径让空间记忆有变化。
- **不足 / 风险**：第一人称移动对手机双指与眩晕敏感，节奏偏慢。
- **下一步**：Web优先优化移动与转向，提供舒适设置和路线纪录分享。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/maze-wander/README.md](../../games/local/maze-wander/README.md)；静态初评，未全量真机验证。

<a id="game-urban-breakout"></a>

## 街区突围 · `urban-breakout`

- **标签**：有趣 / 有潜力（用户暂定）；动作、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：90秒自动射击中补给转火与救援形成紧张取舍。
- **不足 / 风险**：README明确只有P1实战样板，联机和长线内容尚未完成。
- **下一步**：先完善首局转火与Boss可读性，再做同波次挑战和章节循环。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/urban-breakout/README.md](../../games/local/urban-breakout/README.md)；静态初评，未全量真机验证。

<a id="game-homebound-station"></a>

## 归途站 · `homebound-station`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、休闲观景。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：点车或滑车出库直观，乘客上车提供解题回报。
- **不足 / 风险**：密集箭头可能遮挡，出库后等待动画影响连续决策。
- **下一步**：放大箭头与阻挡反馈，允许不影响判定的动画提速并分享最少步。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/homebound-station/README.md](../../games/local/homebound-station/README.md)；静态初评，未全量真机验证。

<a id="game-carding-car"></a>

## 浪湾卡丁车 · `carding-car`

- **标签**：有趣 / 有潜力（用户暂定）；驾驶竞速、竞技。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：Web端、APP端。
- **优点**：漂移加速、八路线印章与一圈冲刺支持短局竞速和成长。
- **不足 / 风险**：3D资源与Creator构建较重，多指转向漂移需真机校准。
- **下一步**：强化漂移充能与终点追赶，验证同赛道邀请和多人重连。
- **拓展方向**：好友对战、同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/carding-car/README.md](../../games/local/carding-car/README.md)；静态初评，未全量真机验证。

<a id="game-merge-front"></a>

## 神机合阵 · `merge-front`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：拼字唤将、合成与攻防有多层组合。
- **不足 / 风险**：拼字、养成、布阵三套规则竞争注意力，爽点不集中。
- **下一步**：暂缓扩展，先用一条合成出兵循环验证是否愿意重玩。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/merge-front/README.md](../../games/local/merge-front/README.md)；静态初评，未全量真机验证。

<a id="game-night-merge"></a>

## 合成守夜人 · `night-merge`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：3×4营地与四驻防位易形成阵容选择，十波有领主节奏。
- **不足 / 风险**：自动战斗弱化即时参与，与多款合成守城产品重叠。
- **下一步**：先验证一项可主动干预的守城动作和可读的波次危机。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/night-merge/README.md](../../games/local/night-merge/README.md)；静态初评，未全量真机验证。

<a id="game-fishing"></a>

## 潮汐猎手 · `fishing`

- **标签**：潜力低 / 暂缓投入（用户指定）；短局街机、动作。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：180秒鱼潮、八种生物与巨鲨弱点形成短局节奏，四武器有克制关系。
- **不足 / 风险**：捕鱼题材差异化仍待验证；切到竖屏自动暂停，移动方向兜底不完整。
- **下一步**：暂保留入口，重新投入前先复核武器手感与公平计分。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/submodules/fishing/README.md](../../games/submodules/fishing/README.md)；静态初评，未全量真机验证。

<a id="game-tower-defense-game"></a>

## 月森守卫 · `tower-defense-game`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、局内成长。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：招募合成与八波塔防有清晰目标，弹道、击退和守卫阵地实际影响防守。
- **不足 / 风险**：README明确进度仅存当前页、刷新重开；合成守城定位与其他作品重叠。
- **下一步**：先比较两作的布阵差异与局长，验证一个独特守城机制。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/submodules/tower-defense-game/README.md](../../games/submodules/tower-defense-game/README.md)；静态初评，未全量真机验证。

<a id="game-xiangqi-five"></a>

## 象五子棋 · `xiangqi-five`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、竞技。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：Web端。
- **优点**：象棋走法加五连线有辨识度，移动棋盘、战术题、同屏与权威好友房已经实现。
- **不足 / 风险**：混合规则需循序教学，正式原生渠道仍缺AppID、密钥与域名的真机验收。
- **下一步**：用合法落点和连线预告教学，优先完善同屏与房间恢复。
- **拓展方向**：好友对战、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/submodules/xiangqi-five/README.md](../../games/submodules/xiangqi-five/README.md)；静态初评，未全量真机验证。

<a id="game-office-slacking"></a>

## 工位偷闲 · 第一人称 · `office-slacking`

- **标签**：潜力低 / 暂缓投入（用户指定）；潜行、模拟调度。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：90秒内核账和休息双目标、收好手机与巡查方位形成具体潜行风险。
- **不足 / 风险**：第一人称需要WebGL2，转头和物件操作占用注意力，核账阅读较重。
- **下一步**：暂缓扩展，验证一个巡查循环是否有清晰的危险预兆。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/submodules/office-slacking/README.md](../../games/submodules/office-slacking/README.md)；静态初评，未全量真机验证。

<a id="game-cops-robbers"></a>

## 围捕小队 · `cops-robbers`

- **标签**：有趣 / 有潜力（用户暂定）；策略、竞技。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：Web端。
- **优点**：夹击封路、角色互换、短场试炼与百关支持学习和复玩。
- **不足 / 风险**：多模式与角色选择可能稀释首局，好友玩法依赖一致规则。
- **下一步**：突出一次成功夹击反馈，以同图同规则挑战串联试炼和好友赛。
- **拓展方向**：好友对战、同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/cops-robbers/README.md](../../games/local/cops-robbers/README.md)；静态初评，未全量真机验证。

<a id="game-cops-robbers-realtime"></a>

## 街区追捕 · `cops-robbers-realtime`

- **标签**：有趣 / 有潜力（用户暂定）；策略、竞技。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：Web端。
- **优点**：点角色再点道路可直接指挥，多警封路有合作空间。
- **不足 / 风险**：多人同时移动时选中状态与去向容易混淆，在线需部署。
- **下一步**：加强路径预告与到达反馈，验证弱网重连和同配置排行榜。
- **拓展方向**：好友对战、同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/cops-robbers-realtime/README.md](../../games/local/cops-robbers-realtime/README.md)；静态初评，未全量真机验证。

<a id="game-h5-security"></a>

## 来电之间 · `h5-security`

- **标签**：潜力低 / 暂缓投入（用户指定）；叙事、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：模拟手机核验业务与诈骗后果有生活教育意义。
- **不足 / 风险**：目前一章，阅读和业务核验较重，不适合追求即时刺激。
- **下一步**：按教育体验保留，若续做先缩短一次核验闭环并给明确反馈。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/h5-security/README.md](../../games/local/h5-security/README.md)；静态初评，未全量真机验证。

<a id="game-letters-words"></a>

## 词了个词 · 单词消消乐 · `letters-words`

- **标签**：潜力低 / 暂缓投入（用户指定）；单词学习、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：释义拼词与字母遮挡可同时训练词汇和规划。
- **不足 / 风险**：与词屿定位重叠，四种组合模式加大选择负担。
- **下一步**：暂缓新增模式，将已验证词库与可用教学经验复用于词屿。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/letters-words/README.md](../../games/local/letters-words/README.md)；静态初评，未全量真机验证。

<a id="game-letters-words2"></a>

## 词屿 · 字母叠叠乐 · `letters-words2`

- **标签**：有趣 / 有潜力（用户暂定）；单词学习、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：主题词岛、教材与自定义词单兼顾轻玩和学习，已有原生入口。
- **不足 / 风险**：内容入口较多，词汇难度和遮挡无解感需持续校准。
- **下一步**：先用三词早餐降低门槛，强化连词反馈与同题公平挑战。
- **拓展方向**：同题挑战、好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/letters-words2/README.md](../../games/local/letters-words2/README.md)；静态初评，未全量真机验证。

<a id="game-multi-battle"></a>

## 万象旅团 · `multi-battle`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、局内成长。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：六流派48卡与等级转移提供构筑空间。
- **不足 / 风险**：无限叠级数值未真人校准，商店与装备信息较密。
- **下一步**：保留原型，缩减首局卡池并验证少量构筑间的克制关系。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/multi-battle/README.md](../../games/local/multi-battle/README.md)；静态初评，未全量真机验证。

<a id="game-puzzle"></a>

## 雨停之前 · `puzzle`

- **标签**：潜力低 / 暂缓投入（用户指定）；叙事、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：单案四嫌疑人与证据核对形成完整推理过程。
- **不足 / 风险**：单案约10至20分钟、复玩价值有限，新增案件成本高。
- **下一步**：保留一次性体验，优化证据关联和无剧透完成卡后再测续案意愿。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/puzzle/README.md](../../games/local/puzzle/README.md)；静态初评，未全量真机验证。

<a id="game-travel"></a>

## 去野 · 大理漫游记 · `travel`

- **标签**：潜力低 / 暂缓投入（用户指定）；探索、休闲观景。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：六幕微缩插画与印章明信片适合旅游内容浏览。
- **不足 / 风险**：主要依赖滚动和收藏，缺少可重复的游戏决策。
- **下一步**：作为文旅展示保留，若转游戏先验证一条主动寻景任务。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/travel/README.md](../../games/local/travel/README.md)；静态初评，未全量真机验证。

<a id="game-travel-bund"></a>

## 江风入境 · 外滩漫游 · `travel-bund`

- **标签**：有趣 / 有潜力（用户暂定）；探索、休闲观景。
- **目标**：Web端优先，横屏；其他可探索平台：移动端小游戏。
- **优点**：真实外滩空间漫游与路线足迹、明信片支持探索分享。
- **不足 / 风险**：3D加载与手机性能成本较高，长期目标较轻。
- **下一步**：Web优先优化首屏与路线导览，移动端保留旋转兜底并完善明信片。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/travel-bund/README.md](../../games/local/travel-bund/README.md)；静态初评，未全量真机验证。

<a id="game-travel-bund-25d"></a>

## 外滩 · 空中漫游 · `travel-bund-25d`

- **标签**：潜力低 / 暂缓投入（用户指定）；探索、休闲观景。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：保留原始建筑布局，飞行和近景加载呈现场景规模。
- **不足 / 风险**：README首屏模型仍约20.7MB，单纯观景缺少游戏目标。
- **下一步**：暂停玩法投入，优先验证首屏负载与一条可完成的观景任务。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/travel-bund-2.5D/README.md](../../games/local/travel-bund-2.5D/README.md)；静态初评，未全量真机验证。

<a id="game-travel2"></a>

## 外滩·一江入梦 · `travel2`

- **标签**：潜力低 / 暂缓投入（用户指定）；叙事、休闲观景。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：纸感插画和昼夜滚动叙事具有统一氛围。
- **不足 / 风险**：操作主要是滚动，印章收集不足以支撑反复游玩。
- **下一步**：保留互动作品定位，压缩首屏并验证明信片分享吸引力。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/travel2/README.md](../../games/local/travel2/README.md)；静态初评，未全量真机验证。

<a id="game-vibejam-myself-delivery"></a>

## 橘风速递 · `vibeJam-myself-delivery`

- **标签**：有趣 / 有潜力（用户暂定）；驾驶竞速、模拟调度。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：采购、驾驶、送达与货物完整度形成完整三分钟循环。
- **不足 / 风险**：上下车与逐件采购可能打断驾驶爽点，多控件增加学习量。
- **下一步**：压缩重复采购流程，强化完整配送连击与同订单路线挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/vibeJam-myself-delivery/README.md](../../games/local/vibeJam-myself-delivery/README.md)；静态初评，未全量真机验证。

<a id="game-vibejam-myself-history-guess"></a>

## 此时 · 此地 · `vibeJam-myself-history-guess`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、探索。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：历史全景猜地点年代有传播话题，已有好友战书和全站榜。
- **不足 / 风险**：AI想象图不能等同史料；只显示评分的设计削弱部分复盘信息。
- **下一步**：保留当前不公布答案规则，以非答案线索改善理解并验证好友同题。
- **拓展方向**：同题挑战、好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/vibeJam-myself-history-guess/README.md](../../games/local/vibeJam-myself-history-guess/README.md)；静态初评，未全量真机验证。

<a id="game-vibejam-myself-nullrange"></a>

## 零域 · NULL RANGE · `vibeJam-myself-nullrange`

- **标签**：有趣 / 有潜力（用户暂定）；动作、探索。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：低空飞行、空战与残骸回收组合有连续动作空间。
- **不足 / 风险**：三波12机内容较短，手机升降转向与多技能操作较复杂。
- **下一步**：Web先强化目标锁定与命中反馈，手机减少常驻操作并做同波挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/vibeJam-myself-nullrange/README.md](../../games/local/vibeJam-myself-nullrange/README.md)；静态初评，未全量真机验证。

<a id="game-fold-the-world"></a>

## 折叠世界 · `fold-the-world`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、探索。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：折叠连接平台与取物回程在100手工关中可组合。
- **不足 / 风险**：规则需要空间想象，README仍为全部关卡开放，成长引导偏弱。
- **下一步**：首三关逐步演示折叠结果，修正正常解锁并分享少步路线。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/fold-the-world/README.md](../../games/local/fold-the-world/README.md)；静态初评，未全量真机验证。

<a id="game-one-stroke-course"></a>

## 一笔造关 · `one-stroke-course`

- **标签**：潜力低 / 暂缓投入（用户指定）；创作沙盒、物理操作。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：自画可碰撞赛道再亲自闯关有创作闭环。
- **不足 / 风险**：画线与控制小球两套操作增加学习成本，关卡仅12个。
- **下一步**：暂缓扩量，先验证画一笔即可成功的首局与路线可复用分享。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/one-stroke-course/README.md](../../games/local/one-stroke-course/README.md)；静态初评，未全量真机验证。

<a id="game-hold-tight-acrobats"></a>

## 抱紧了！杂技探险队 · `hold-tight-acrobats`

- **标签**：潜力低 / 暂缓投入（用户指定）；物理操作、益智解谜。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：抓环、牵手与切支点构成有趣的物理关系。
- **不足 / 风险**：三角色切换与释放支点负担较高，仅五个短关。
- **下一步**：先验证双角色教学与可预测的抓握范围再评估继续投入。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/hold-tight-acrobats/README.md](../../games/local/hold-tight-acrobats/README.md)；静态初评，未全量真机验证。

<a id="game-wulong-city"></a>

## 乌龙城 · `wulong-city`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、叙事。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：100个喜剧机关和完整触屏页面具有可持续内容基础。
- **不足 / 风险**：喜剧谜题容易退化为猜作者意图，需要提示分级保护节奏。
- **下一步**：强化操作可发现性和成功笑点回放，分享无剧透关卡邀请。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/wulong-city/README.md](../../games/local/wulong-city/README.md)；静态初评，未全量真机验证。

<a id="game-balloon-movers"></a>

## 气球搬家公司 · `balloon-movers`

- **标签**：潜力低 / 暂缓投入（用户指定）；物理操作、益智解谜。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：绑点、绳长与排气真实影响家具运动，有喜剧画面。
- **不足 / 风险**：三关且装配后需要理解重心和气量，失败归因不直观。
- **下一步**：先用单气球示范倾斜关系，提供轨迹复盘再决定是否扩关。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/balloon-movers/README.md](../../games/local/balloon-movers/README.md)；静态初评，未全量真机验证。

<a id="game-weather-command"></a>

## 天气指挥部 · `weather-command`

- **标签**：潜力低 / 暂缓投入（用户指定）；益智解谜、模拟调度。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：三次天气限制带来明确的资源规划，天气改变航道。
- **不足 / 风险**：仅五航段且有初态变体，天气效果需先记规则。
- **下一步**：暂缓扩关，用下一步水位和路径预览验证因果是否易懂。
- **拓展方向**：同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/weather-command/README.md](../../games/local/weather-command/README.md)；静态初评，未全量真机验证。

<a id="game-off-camera"></a>

## 镜头外发生了什么 · `off-camera`

- **标签**：潜力低 / 暂缓投入（用户指定）；叙事、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：前后画面对照与事件重演便于制造喜剧揭晓。
- **不足 / 风险**：只有三个案例，答案记住后复玩弱，主要是卡片排列。
- **下一步**：保留原型，验证一次错误重演是否也有笑点和清晰反馈。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/off-camera/README.md](../../games/local/off-camera/README.md)；静态初评，未全量真机验证。

<a id="game-rescue-team"></a>

## 小城救援队 · `rescue-team`

- **标签**：有趣 / 有潜力（用户暂定）；策略、模拟调度。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：三车调度、道路清障与限时救援让路径选择互相影响。
- **不足 / 风险**：多事件同时计时可能压过路线规划，触屏车辆选择需明确。
- **下一步**：先强化到达倒计时和堵路反馈，再做同城事件序列挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/rescue-team/README.md](../../games/local/rescue-team/README.md)；静态初评，未全量真机验证。

<a id="game-precision-demolition"></a>

## 一分钟拆对墙 · `precision-demolition`

- **标签**：潜力低 / 暂缓投入（用户指定）；物理操作、益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：卸重、末缝方向与真实倒塌可形成直观破坏反馈。
- **不足 / 风险**：仅三关，板材堆叠和花瓶损坏的因果可能难预测。
- **下一步**：保留原型，补受力与倒塌方向预览后验证首关失败可解释性。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/precision-demolition/README.md](../../games/local/precision-demolition/README.md)；静态初评，未全量真机验证。

<a id="game-afterimage-arena"></a>

## Afterimage Arena · `afterimage-arena`

- **标签**：潜力低 / 暂缓投入（用户指定）；动作、益智解谜。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：真实输入重放与残影协作破盾有独特时间机制。
- **不足 / 风险**：每20秒录制与多槽协作学习成本高，三关内容有限。
- **下一步**：先验证一段五秒残影破盾教学，再决定是否继续录制玩法。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/afterimage-arena/README.md](../../games/local/afterimage-arena/README.md)；静态初评，未全量真机验证。

<a id="game-ghost-shift-manager"></a>

## Ghost Shift Manager · `ghost-shift-manager`

- **标签**：潜力低 / 暂缓投入（用户指定）；策略、模拟调度。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：鬼员工引信、撤鬼和安抚铃形成时机调度。
- **不足 / 风险**：三夜内容较短，惊吓适量的判定可能难预期。
- **下一步**：暂停扩展，先让客人承受范围和引信结果可预判。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/ghost-shift-manager/README.md](../../games/local/ghost-shift-manager/README.md)；静态初评，未全量真机验证。

<a id="game-night-overwatch"></a>

## 夜航守望 · `night-overwatch`

- **标签**：有趣 / 有潜力（用户暂定）；动作、策略。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：三档火控、弹道遮挡与车队护送结合操作和目标取舍。
- **不足 / 风险**：盘旋透视与多武器会增加手机瞄准负担，误伤归因需清晰。
- **下一步**：Web优先强化落点预览，移动用60秒热身教学并分享同任务战绩。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/night-overwatch/README.md](../../games/local/night-overwatch/README.md)；静态初评，未全量真机验证。

<a id="game-rule-thief"></a>

## Rule Thief · `rule-thief`

- **标签**：潜力低 / 暂缓投入（用户指定）；益智解谜。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：规则转移同时带走旧能力和副作用，有独特逻辑。
- **不足 / 风险**：抽象规则依赖说明，只有三关难证明长线变化。
- **下一步**：先把转移前后移动结果可视化，再验证玩家能否自行解首关。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/rule-thief/README.md](../../games/local/rule-thief/README.md)；静态初评，未全量真机验证。

<a id="game-waterline-station"></a>

## 水位联动站 · `waterline-station`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、物理操作。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：Web端。
- **优点**：50关水位、箱子、小船、水轮逐步组合，预测与撤销降低试错。
- **不足 / 风险**：多水槽和管线在小屏可能难追踪，操作预算需解释。
- **下一步**：加强高亮连通关系与预测水位，分享同关最少步数。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/waterline-station/README.md](../../games/local/waterline-station/README.md)；静态初评，未全量真机验证。

<a id="game-tiny-signals"></a>

## 同频归航 · `tiny-signals`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：同一输入控制四棋盘，借墙停步产生明确同步谜题。
- **不足 / 风险**：六关内容有限，四处同时观察对小屏注意力有要求。
- **下一步**：强调本步四角色预览与终点状态，加入同关少步挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/tiny-signals/README.md](../../games/local/tiny-signals/README.md)；静态初评，未全量真机验证。

<a id="game-bullet-garden"></a>

## 子弹花园 · Bullet Garden · `bullet-garden`

- **标签**：有趣 / 有潜力（用户暂定）；动作、局内成长。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：APP端。
- **优点**：14关、怪物渐进引入与可主动释放能量技能形成成长。
- **不足 / 风险**：首页图鉴入口多，战场粒子与地形会遮住威胁。
- **下一步**：收敛首局入口，强化危险预警与技能清场高光，增加同波次挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/bullet-garden/README.md](../../games/local/bullet-garden/README.md)；静态初评，未全量真机验证。

<a id="game-ink-is-everything"></a>

## 一滴墨，决定一切 · `ink-is-everything`

- **标签**：有趣 / 有潜力（用户暂定）；动作、局内成长。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：墨汁兼生命与攻击资源，命中回收形成鲜明攻守循环。
- **不足 / 风险**：目前第一章六房，花墨行为可能令新手快速耗尽生存资源。
- **下一步**：先清晰显示消耗和回收窗口，验证六房难度再做章节与挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/ink-is-everything/README.md](../../games/local/ink-is-everything/README.md)；静态初评，未全量真机验证。

<a id="game-out-of-frame"></a>

## Out of Frame · 框外静止 · `out-of-frame`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、探索。
- **目标**：Web端优先，横屏；其他可探索平台：移动端小游戏。
- **优点**：拖框分配局部时间在100房间中组合，撤销支持探索。
- **不足 / 风险**：框内运动与框外冻结需要即时示范，精确拖框偏大屏。
- **下一步**：优化边界吸附和运动预览，形成短房间挑战与少次移动分享。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/out-of-frame/README.md](../../games/local/out-of-frame/README.md)；静态初评，未全量真机验证。

<a id="game-echo-weaver"></a>

## 回声编织 · Echo Weaver · `echo-weaver`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、声音。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：反射板、分声器、延迟块让玩家真正搭建声路，静音可玩。
- **不足 / 风险**：目前五关并明确未验证乐趣，延迟和分声因果抽象。
- **下一步**：强化逐拍路径回放，先观察首两关修改意愿，再增加声路分享。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/echo-weaver/README.md](../../games/local/echo-weaver/README.md)；静态初评，未全量真机验证。

<a id="game-two-sided-box"></a>

## 双面机关盒 · `two-sided-box`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、物理操作。
- **目标**：Web端优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：50盒与同一空间的多面投影提供扎实空间推理。
- **不足 / 风险**：多观察窗在窄屏需滚动，免费增面与最优操作目标需要区分。
- **下一步**：Web优化多面联动，手机优先当前操作面，分享不泄题的通关结构。
- **拓展方向**：内容分享、同题挑战；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/two-sided-box/README.md](../../games/local/two-sided-box/README.md)；静态初评，未全量真机验证。

<a id="game-luban-workshop"></a>

## 榫间 · 鲁班锁 · `luban-workshop`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、创作沙盒。
- **目标**：Web端优先，横屏；其他可探索平台：移动端小游戏、APP端。
- **优点**：11件有来源的互锁木构与三维参考可支持真实拆装理解。
- **不足 / 风险**：旋转单件和组合容易与相机手势冲突，难度依赖几何观察。
- **下一步**：Web优先明确选件与轴向，手机做单件手势引导并分享拆解过程。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/luban-workshop/README.md](../../games/local/luban-workshop/README.md)；静态初评，未全量真机验证。

<a id="game-surprise-kept"></a>

## 惊喜别穿帮 · `surprise-kept`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、叙事。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：目击记忆而非简单视线提供独特生日故事，撤销无负担。
- **不足 / 风险**：八关内容有限，记忆与当前位置的差异不易理解。
- **下一步**：用角色记忆图标解释因果，分享无剧透生日完成卡。
- **拓展方向**：内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/surprise-kept/README.md](../../games/local/surprise-kept/README.md)；静态初评，未全量真机验证。

<a id="game-retreat-rally"></a>

## 收兵再冲 · `retreat-rally`

- **标签**：有趣 / 有潜力（用户暂定）；动作、策略。
- **目标**：移动端小游戏优先，横屏；其他可探索平台：暂无优先建议。
- **优点**：按住撤退松手进攻操作极简，箭雨装填形成攻守节拍。
- **不足 / 风险**：三关战役较短，模拟匹配需与真实联机明显区分。
- **下一步**：强化箭雨预兆和反攻窗口，先完善同屏公平对战和战绩分享。
- **拓展方向**：好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/retreat-rally/README.md](../../games/local/retreat-rally/README.md)；静态初评，未全量真机验证。

<a id="game-castle-cannon"></a>

## 一炮拆城 · `castle-cannon`

- **标签**：有趣 / 有潜力（用户暂定）；动作、竞技。
- **目标**：Web端优先，横屏；其他可探索平台：APP端。
- **优点**：权威服务实时双城炮战、弹道校射和掩体转移有对抗深度。
- **不足 / 风险**：多炮位、望远镜和趴下操作较复杂，公网服务尚待部署。
- **下一步**：Web优先简化校射与伤害反馈，验证断线重连和服务不可用回退。
- **拓展方向**：好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/game-castle-cannon/README.md](../../games/local/game-castle-cannon/README.md)；静态初评，未全量真机验证。

<a id="game-tetracube"></a>

## 重力方舱 · `tetracube`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、短局街机。
- **目标**：Web端优先，横屏；其他可探索平台：APP端。
- **优点**：三轴旋转与容器翻转让层消除具有空间创新。
- **不足 / 风险**：3D遮挡与多轴输入比平面消除难学，手机精细操作风险高。
- **下一步**：Web先增强层切片与幽灵落点，手机分步旋转并做同序列挑战。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/tetracube/README.md](../../games/local/tetracube/README.md)；静态初评，未全量真机验证。

<a id="game-cage-rescue"></a>

## 打破笼子接住人 · `cage-rescue`

- **标签**：有趣 / 有潜力（用户暂定）；短局街机、物理操作。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：暂无优先建议。
- **优点**：同一挡板接球与接人制造持续取舍，四人获救目标清楚。
- **不足 / 风险**：球与队友同时到边缘可能造成无解感，六种阵形内容有限。
- **本轮已落实**：每两次连救获得5秒宽板奖励，漏接断连；最高连救结算与同关救援目标分享；可选补球接入公共模拟广告并保留宿主授权边界。
- **下一步**：验证连救宽板后的六阵形难度与可达性，增加有变化的救援阵形，并以真人试玩确认接人与接球取舍。
- **拓展方向**：同题挑战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/cage-rescue/README.md](../../games/local/cage-rescue/README.md)、[games/local/cage-rescue/docs/design/publishing/README.md](../../games/local/cage-rescue/docs/design/publishing/README.md)、[games/local/cage-rescue/docs/design/publishing/browser-report.json](../../games/local/cage-rescue/docs/design/publishing/browser-report.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-flick-arena"></a>

## 弹指擂台 · `flick-arena`

- **标签**：有趣 / 有潜力（用户暂定）；物理操作、竞技。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：Web端。
- **优点**：回拉出杆、边缘淘汰和预告缩圈形成短局反转。
- **不足 / 风险**：首轮够不到对手需要解释走位，物理相撞与平局需清楚反馈。
- **本轮已落实**：种子与擂台布局可复现的人机同局战帖，胜局比较好友自报出杆数；补击落反馈与44px小屏按钮；自然结算接频控模拟广告，不将人机称作实时联机。
- **下一步**：验证首轮走位教学和物理平局可读性；若推进真人对战，再实现权威回合、重连与公平结算，先验证分享复玩。
- **拓展方向**：好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/flick-arena/README.md](../../games/local/flick-arena/README.md)、[games/local/flick-arena/docs/design/publishing-2026-10-11/design.md](../../games/local/flick-arena/docs/design/publishing-2026-10-11/design.md)、[games/local/flick-arena/docs/design/publishing-2026-10-11/publishing-browser.json](../../games/local/flick-arena/docs/design/publishing-2026-10-11/publishing-browser.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

<a id="game-three-choose-two"></a>

## 三块选两块 · `three-choose-two`

- **标签**：有趣 / 有潜力（用户暂定）；益智解谜、短局街机。
- **目标**：移动端小游戏优先，竖屏；其他可探索平台：Web端。
- **优点**：三块留两块的取舍清晰，行列交叉消除与双模式支持复玩。
- **不足 / 风险**：两种补块模式计分不能混榜，8×8小屏拖放需精准预览。
- **本轮已落实**：新增独立种子挑战、同局重试与好友自报目标分比较；挑战不覆盖普通存档和原有在线排行；可选续局接入模拟激励，结算使用频控模拟插屏。
- **下一步**：验证种子挑战的回流和模式分榜理解，继续调节拖放容错与连续交叉消除反馈；真实平台广告及认证成绩需单独验收。
- **拓展方向**：同题挑战、好友对战、内容分享；是适配方向，已有能力与待做能力以证据和实现为准。
- **证据**：[games/local/three-choose-two/README.md](../../games/local/three-choose-two/README.md)、[games/local/three-choose-two/docs/design/publishing-2026-10-11/design.md](../../games/local/three-choose-two/docs/design/publishing-2026-10-11/design.md)、[games/local/three-choose-two/docs/design/publishing-2026-10-11/publishing-browser.json](../../games/local/three-choose-two/docs/design/publishing-2026-10-11/publishing-browser.json)；本轮有 Linux Chromium 触屏模拟记录，不是真机验证。

## 目录实现验证

- Shell 全部 12 个测试文件、134 项测试通过；包括 67 款磁盘/登记完整性、26 款用户判断保留、同组 OR / 跨组 AND、搜索兼容、清空与空态、筛选 URL 刷新/后退/游戏返回、原生链接手势及原有 Shell 行为。
- `pnpm --filter @coffeeeeffoc/shell-web typecheck`、`lint` 通过；构建依赖通过 `pnpm --filter @coffeeeeffoc/release-contract... build` 准备。
- Linux Chromium 实际启动 Shell 后使用触屏输入检查 390×844、320×740、1440×1000：分组、刷新保留、评估展开、无匹配、重置均通过；无页面 JS 错误或横向溢出，筛选按钮热区至少 44px。这是浏览器设备模拟，不是手机真机。
- [浏览器记录](2026-10-11-catalog-verification/report.json)、[手机筛选截图](2026-10-11-catalog-verification/filters-390.png)、[手机评估截图](2026-10-11-catalog-verification/assessment-390.png)。七款游戏各自的生产浏览器记录位于对应条目的证据文档，不把目录回归当作游戏发布验收。
