# 游戏一览

当前共登记 **43 款游戏**（42 款本地游戏、1 款子模块游戏），与 Shell 登记和磁盘目录一致。全部游戏的标签、优缺点、改进方向和优先级见[产品评估](plans/2026-10-11-game-portfolio-assessment.md)，也可直接在游戏目录按标签筛选并展开评估。

潜力判断与改造排期独立：**40 款有趣 / 有潜力**，并非只有7款。完整排期为 **上轮已改造7 + 本轮改造13 + 有潜力后续改造20 + 用户暂缓3 = 43**；每款只属于一个排期组，仍可同时拥有多个玩法、平台与拓展标签。游戏目录显示各组总数、筛选匹配数和逐款实施状态，全部名单与排期理由见[完整排期索引](plans/2026-10-11-game-portfolio-assessment.md#全量排期索引)。

标题和描述来自 Shell 登记；新增目录仍以 `pnpm check:games` 的磁盘发现结果为准。

## 本地游戏（42 款）

| 游戏                     | Game ID                        | 源码                                                                         | 简介                                                                                                                         |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 灰烬防线                 | `ashfall-front`                | [ashfall-front](../games/local/ashfall-front/)                               | 灰绿工业风横版射击，三战区、连锁爆破、局内改装与两阶段 Boss。                                                                |
| 克朗棋 · Carrom Club     | `carrom-club`                  | [carrom-club](../games/local/carrom-club/)                                   | 回拉指尖，听见落袋。在木质棋盘上摆位、瞄准、击球，与阿洛切磋一局，或挑战六关手感练习。                                       |
| 转塔留一脚刹车           | `tower-brake`                  | [tower-brake](../games/local/tower-brake/)                                   | 转动圆塔穿过十二层缺口，连续落三层补回一次 0.8 秒刹车，在危险落点前转出一条生路。八座短塔逐步解锁。                          |
| 追贼别撞墙               | `chase-thief`                  | [chase-thief](../games/local/chase-thief/)                                   | 穿过老城三条街巷，跳路障、钻低杆、换道躲箱子；连续稳住三段就冲刺追近，抓住前方的小偷。                                       |
| 星扣工坊                 | `orbit-atelier`                | [orbit-atelier](../games/local/orbit-atelier/)                               | 转动缺口解开上下穿扣的圆环，用宽口、微隙与接力星栓破解八章七十四张星盘。                                                     |
| 苔光花园                 | `moss-garden`                  | [game-moss-garden](../games/local/game-moss-garden/)                         | 在彩色花圃中安放光种，每行、每列和每片花圃各一颗，彼此不能相邻。三十关原创竖屏逻辑谜题。                                     |
| 星轨弹珠                 | `ball-roguelite`               | [ball-roguelite](../games/local/ball-roguelite/)                             | 拖动瞄准，松手弹射。组合穿透、爆裂、闪电与暴击，击穿六片星域的砖阵，或挑战无尽星空。                                         |
| 熔光弹珠                 | `ember-bounce`                 | [ember-bounce](../games/local/ember-bounce/)                                 | 拖动瞄准一束熔光弹珠，借墙面连锁反弹击碎熔晶，收集更多弹珠与祝福，挑战逐步解锁的熔炉关卡。                                   |
| 天下岔路                 | `tianxia-chalu`                | [tianxia-chalu](../games/local/tianxia-chalu/)                               | 四方城寨自动出兵，轻点岔路切换行军方向，抢占村镇、截断援军，在一张山水战图上统一天下。                                       |
| 声纹疑案                 | `voiceprint-case`              | [voiceprint-case](../games/local/voiceprint-case/)                           | 听取嘈杂现场的一句话，对照三位虚构成年人的同句录音，辨认同一个声音，挑战十二关渐进听觉谜案。                                 |
| 回声实验室 · Echo Lab    | `echo-lab`                     | [echo-lab](../games/local/echo-lab/)                                         | 拖动和旋转反射板、消音板，分别调节四面墙的反射率，听见空间改变声音；导出原声与调制声，分享房间链接邀请朋友一起实验。         |
| 迷境漫游                 | `maze-wander`                  | [maze-wander](../games/local/maze-wander/)                                   | 在五种风景、二十个手工迷宫中第一人称探索，留下标记，辨认回环与倒影，慢慢找到归途。支持电脑与手机网页。                       |
| 街区突围                 | `urban-breakout`               | [urban-breakout](../games/local/urban-breakout/)                             | 橙白救援小队穿越老街，转火击破限时补给，回防冲刺尸潮。P1 单人实战样板。                                                      |
| 归途站                   | `homebound-station`            | [homebound-station](../games/local/homebound-station/)                       | 看箭头解开密集出租车阵，点击或滑动车辆出库，自动接上旅客，让整片车场有序清空。                                               |
| 浪湾卡丁车               | `carding-car`                  | [carding-car](../games/local/carding-car/)                                   | 在海湾赛道漂移蓄力，挑战一圈冲刺或三圈冠军，收集路线印章，邀请朋友挑战同一条赛道。                                           |
| 神机合阵                 | `merge-front`                  | [merge-front](../games/local/merge-front/)                                   | 拼字唤醒神将，合成神机武装，布阵守城或开动生产线攻破敌方水晶。                                                               |
| 围捕小队                 | `cops-robbers`                 | [cops-robbers](../games/local/cops-robbers/)                                 | 先用三张短场试炼练夹击与封路，再挑战百关街区、换防接力，或切换角色与好友对抗。                                               |
| 街区追捕                 | `cops-robbers-realtime`        | [cops-robbers-realtime](../games/local/cops-robbers-realtime/)               | 点选警察封住路口，合作抓住小偷。横屏街区百关挑战、个人与全站通关纪录、好友 PK。                                              |
| 词屿 · 字母叠叠乐        | `letters-words2`               | [letters-words2](../games/local/letters-words2/)                             | 从三词早餐、海岸与星空小岛开始，揭开层叠字母，再挑战八大主题与每日同题。                                                     |
| 江风入境 · 外滩漫游      | `travel-bund`                  | [travel-bund](../games/local/travel-bund/)                                   | 沿建筑、桥畔与天际三条路线收集地标足迹，第一视角漫游外滩两岸，留下旅行明信片。                                               |
| 橘风速递                 | `vibeJam-myself-delivery`      | [vibeJam-myself-delivery](../games/local/vibeJam-myself-delivery/)           | 驾驶小摩托穿越海滨小岛，采购货物并完成配送。                                                                                 |
| 此时 · 此地              | `vibeJam-myself-history-guess` | [vibeJam-myself-history-guess](../games/local/vibeJam-myself-history-guess/) | 观察历史全景，猜测地点与年份，走三幕主题旅途、五幕普通旅途或每日同题，揭晓时空中的故事。                                     |
| 零域 · NULL RANGE        | `vibeJam-myself-nullrange`     | [vibeJam-myself-nullrange](../games/local/vibeJam-myself-nullrange/)         | 低空飞行、迎击敌机，在三波空战中回收残骸。                                                                                   |
| 折叠世界                 | `fold-the-world`               | [fold-the-world](../games/local/fold-the-world/)                             | 在100个手工关卡中折起远处的平台，安排取物与回程，逐步解开更复杂的空间谜题。                                                  |
| 乌龙城                   | `wulong-city`                  | [wulong-city](../games/local/wulong-city/)                                   | 走进青瓦小城，用点按、拖放和转身解开100个喜剧机关；独立主页与十章选关，支持移动触屏和原生小游戏。                            |
| 小城救援队               | `rescue-team`                  | [rescue-team](../games/local/rescue-team/)                                   | 调度三辆救援车，接报后开始计时，选择路线、疏通道路，及时赶到现场完成救援。                                                   |
| 夜航守望                 | `night-overwatch`              | [night-overwatch](../games/local/night-overwatch/)                           | 先用60秒火控热身练三档火力，再在护送、伏击与巡逻任务中为救援车队清理前路。                                                   |
| 水位联动站               | `waterline-station`            | [waterline-station](../games/local/waterline-station/)                       | 开关闸门，让相连水槽共享水位，落箱压开关、抬船进出口、溢流转水轮，解开连锁机关。                                             |
| 同频归航                 | `tiny-signals`                 | [tiny-signals](../games/local/tiny-signals/)                                 | 一次方向输入引导四位机械信使，利用风门、罗盘和折叶桥，解开六关同步归航谜题。                                                 |
| 子弹花园 · Bullet Garden | `bullet-garden`                | [bullet-garden](../games/local/bullet-garden/)                               | 在庭院守住五分钟：经验升级选中地形增益后才生成灌木、沟渠、冻土或毒素，积蓄能量，手动瞄准释放爆破、大风、冲锋车、战马与激光。 |
| 一滴墨，决定一切         | `ink-is-everything`            | [ink-is-everything](../games/local/ink-is-everything/)                       | 墨汁即生命：射墨、近战命中吸墨，走位回收技能墨滴；拾取装备、三选一成长，夺回钥印挑战墨之门。                                 |
| Out of Frame · 框外静止  | `out-of-frame`                 | [out-of-frame](../games/local/out-of-frame/)                                 | 拖动观察框，让机器人与平台在框内运动、框外冻结。从定格开关到多机关调度，挑战难度递进的十章一百关，随时回退并继续上次探索。   |
| 回声编织 · Echo Weaver   | `echo-weaver`                  | [echo-weaver](../games/local/echo-weaver/)                                   | 在网格上摆放有限的反射板、分声器与延迟块，亲手搭出声路，让回声按目标节奏抵达；五关学习绕路、共享延迟与能量取舍。             |
| 双面机关盒               | `two-sided-box`                | [two-sided-box](../games/local/two-sided-box/)                               | 从随机两个角度观察六面机关，逐面揭示线索、对齐孔板，让小球穿过五十个谜盒，通关后旋转查看完整三维结构。                       |
| 榫间 · 鲁班锁            | `luban-workshop`               | [luban-workshop](../games/local/luban-workshop/)                             | 按真实结构重建的鲁班锁与互锁木构，从完整形态拆解或复原，旋转单件与组合，对照同步三维参考探索榫卯。                           |
| 惊喜别穿帮               | `surprise-kept`                | [surprise-kept](../games/local/surprise-kept/)                               | 安排倒茶与屏风，搬动礼物和钥匙，利用不同目击记忆解开八关生日惊喜。                                                           |
| 一炮拆城                 | `castle-cannon`                | [game-castle-cannon](../games/local/game-castle-cannon/)                     | 隔城实时互轰！调炮蓄力、望远镜校射，切换炮位与地堡补给，守住炮手生命，摧毁对方城防。                                         |
| 重力方舱                 | `tetracube`                    | [tetracube](../games/local/tetracube/)                                       | 拖动并三轴旋转四连立方体，填满水平层；颠倒 6×6×12 容器，让方块向下落定，制造连锁消除。                                       |
| 打破笼子接住人           | `cage-rescue`                  | [cage-rescue](../games/local/cage-rescue/)                                   | 拖动挡板反弹小球、击碎笼子，安排接球与接人的顺序，在六种阵形中救出至少四名队友。                                             |
| 弹指擂台                 | `flick-arena`                  | [flick-arena](../games/local/flick-arena/)                                   | 向后拉，松手弹！和两位系统对手轮流出招，把圆盘撞出木质擂台，守住最后的落点。                                                 |
| 三块选两块               | `three-choose-two`             | [three-choose-two](../games/local/three-choose-two/)                         | 拖动三块，摆下两块。留住棋盘空间，完成三十关取舍挑战，或在无尽练习中追逐交叉消除与连续高分。                                 |

## 子模块游戏（1 款）

| 游戏     | Game ID        | 源码                                              | 简介                                                                       |
| -------- | -------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 象五子棋 | `xiangqi-five` | [xiangqi-five](../games/submodules/xiangqi-five/) | 象棋走法与五子连线，八道战术题从一手妙招到两步连招，也能同屏或与电脑对弈。 |

登记信息来源：[独立游戏清单](../apps/shell-web/src/standalone-games.json)、[内置游戏注册表](../apps/shell-web/src/registry.ts)。
