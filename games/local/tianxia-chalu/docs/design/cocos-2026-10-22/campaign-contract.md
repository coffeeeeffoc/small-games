# Canonical rules v2 interface

逻辑沙盘为 **390×660**，坐标单位可直接映射 Cocos 2D。100 图当前 4–10 城，schema 强制最多 12 城且城心距离至少 64 单位；实际标签字体、44px 热区缩放后是否遮挡由 Cocos 场景验收。Web 控制器推进 `tick(state, seconds)`；Cocos 只读快照并回传命令，不保存另一份模拟。`createMatch({levelId, seed, difficulty, aiEnabled, loadout})` 返回 JSON 可序列化状态。`seed` 为 uint32 或 1–128 字符串；重试重用 seed，装备重新读取当前有效库存，已消耗一次性卡不返还；新布阵换 seed。已存在 v1 战局快照不兼容；关卡进度兼容旧三 ID。

## 快照与渲染字段

| 对象 | 字段及语义 |
| --- | --- |
| state | `version:2, levelId, seed, time, duration, status:'playing'/'finished', stepCount, factions:number[], playerFactionId:0, spawns:{[factionId]:cityId}, spawnSetIndex` |
| city | `id,name,x,y,type:'town'/'barracks'/'pass'/'muster',terrain,owner:number|null,troops,capacity,reserve:0,production,productionProgress,junctionId,fortification,maxFortification,weapon,generalKind,recruitProgress,recruitReadyAt,capturedAt`。城防与兵数独立显示；0 兵不丢归属。 |
| weapon | `null` 或 `{kind:'crossbow'/'catapult'/'cannon', nextFire, readyAt, sourceOwner:number|null}`；后两时刻是本局逻辑秒。中立兵器也防守。`sourceOwner` 限定卡赋予的兵器归属；失守后禁用该来源。规格见 `WEAPONS`。 |
| junction | 保留 `id,cityId,x,y,owner,exits:string[],routeIndex,lastSwitchTime`。`-1` 表示屯兵，非负是 `exits` 下标。双向出口从唯一 roads 派生且 schema 核对。 |
| road | `{id,a:cityId,b:cityId,type:'normal'/'fast'/'slow',speed,length}`，配置只声明一次。几何交叉不形成节点。 |
| packet | `{id:number,owner,troops,fromCityId,targetCityId,junctionId,roadId,phase,from:{x,y},to:{x,y},progress:0..1,elapsed,duration,engaged,damage,nextAttack}`。`phase='road'` 行军或道路交战，`siege` 攻城，`stationed` 容量外驻扎。`roadId` 驻扎时为 null。`positionOfPacket(state,packet)` 为权威位置；elapsed/duration 仅保留旧渲染兼容。0 兵但带活将的 packet 仍是有效队伍。 |
| general | `{id:number,kind,owner,originCityId,cityId:string|null,packetId:number|null,attack,interval,defense,health,maxHealth,nextAttack}`。驻守绑定 cityId，随军绑定 packetId；`positionOfGeneral` 返回位置。六种 kind/中文名/基础属性与光环见 `GENERAL_TYPES`。来源台失守即取消光环，活将仍可战斗和夺城。 |
| terrain | `{type:'plain'/'forest'/'mountain'/'river',x,y,radius}[]` 背景地形；city.terrain 和 road.type 承载规则，背景不会凭像素改变路径。 |

## 命令和展示查询

- `switchRoute(state,factionId,junctionId,routeIndex?)`：显式 `-1` 屯兵、`0..exits.length-1` 目标出口；省略时依次 `hold → exit0 → … → hold`。返回 `{ok:true,junctionId,routeIndex}` 或 `{ok:false,reason}`；所有者、状态、整数边界和 0.2 秒冷却均校验。出城后目标固定。
- `effectSources(state)`：仅实时有效来源，数组元素 `{id,sourceType:'baseline'/'card'/'general',factionId,cityId,generalId?,kind,value,radius,position:{x,y},remaining:null,scope}`。`remaining:null` 表示本局来源有效期间持续；日卡期限由库存层处理。援兵卡 scope 为 `initial-reinforcement`，value 为已赠兵数，不是持续倍率。
- `modifiersAt(state,factionId,{x,y})`：返回十种 kind 的加成数值（例如 attack=0.2 表示 +20%）。同类取最高；单类最多 0.5、防御最多 0.4；异类总加成最多 1.2，超出按比例缩减。源失守、将领死亡或出圈即时停止；已生产兵不回收。
- `planRoutes(state,factionId,style)`：只读 AI 决策，返回 `{junctionId,routeIndex}[]`。模拟助手可独立调用后逐个交给 switchRoute；不能修改状态设胜。
- `getScore(state)`：`{factionId,cities,troops,generals,score,alive,eliminatedAt,rank}[]`。含在途、攻城、城外驻扎兵；并列共享 rank（1,1,3）。存活优先，存活者城数/兵数排序，淘汰者晚淘汰优先。

## 事件、结算与卡

`state.events` 最多保留 64 条，消费端以单调 `id` 去重；事件基础为 `{id,type,time,position:{x,y},factionId:number|null}`。类型 `switch/hold/capture/general/elimination/battle/fire/finished`。capture 另有 previousOwner/cityId；fire 另有 weapon/target 坐标；battle 有 targetFactionId；finished 有 outcome/winnerId。失守音由 capture.previousOwner 判定，暂停恢复不重放历史事件。

开局阵营兵数/留守均 0，军令均屯兵，所有地图每方都有绑定出生城的基础局部来源。loadout 最多两张 `{kind,tier:0..3}`，kind 为 `troops,production,attack,rate,defense,health,speed,general,weapon,territory`，只为玩家出生城创建局部来源。援兵卡是显式 0 兵规则例外；将领卡让出生城具有招募能力，兵器卡为出生城附加弓弩。库存、日卡到期、消耗/广告由主会话库存层完成。服务只接受有界 PVE 参数，不表示验证了持久卡库所有权。

自然结束 result 包含 `completed:true,rewardEligible:true,levelId,seed,outcome,winnerId,reason:'timeout'/'elimination',elapsed,score,stars,rankings`。这只表示规则允许结算，开发模式、库存幂等及广告仍由控制器验证。主动放弃/过期为 `completed:false,rewardEligible:false`；未结束 result 为 null。`applyResult` 只接受 completed 且自然结束的结果；存档层升级时保持设置/教程/库存字段。`CONTENT_VERSION=2`。

## 集成边界

主会话需更新旧 `storage.mjs` 的 version=1 检查与旧渲染/预览中固定出生、无屯兵的假设。地图读取 `LEVELS`；普通解锁用 `getUnlockedLevels`；迁移保留 crossroads/riverfork/four-kingdoms 完成记录且可重玩，不给旧玩家免费完成新增关卡。不从本接口推导真机性能、Creator 构建或平台验收已通过。
