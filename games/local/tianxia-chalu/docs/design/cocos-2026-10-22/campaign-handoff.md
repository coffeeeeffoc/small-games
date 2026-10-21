# 核心阶段交接 — 2026-10-22

按主会话最新要求，在当前一轮检查结束后交还写入权。未提交、未推送，未改 package/build/storage/remote/main/render/UI；原设计文件与无关 game-office 保留。对外字段和函数见 [campaign-contract.md](campaign-contract.md)。

## 已落盘范围

- `src/content/maps/*.mjs`：100 个显式地图；10章×10关；旧 ID crossroads/riverfork/four-kingdoms 在1/3/5关；当前4–10城，最小城心64，390×660坐标；双向道路只声明一次；合法出生组合与同预算轮换；路网/坐标签名唯一。
- `src/content/catalog.mjs`、`rules.mjs`、`levels.mjs`：静态目录、城池/快慢路/兵器/六种将领/卡参数、严格schema、版本2进度迁移及自然结束结果验证。
- `src/core/index.mjs`、`effects.mjs`：确定性固定步长、屯兵/发兵、容量及驻扎队列、道路持续交战/同时伤害、城防/武器、点将/随军、局部来源、AI策略与排名。各图基线统一为出生城局部产兵+8%，所有阵营相同；不会按玩家卡阶镜像加强AI。
- `src/core/engine.test.mjs`、`tests/core-content.test.mjs`：替换旧固定兵力/固定出生/三关假设，新增集中内容与规则测试。
- `scripts/generate-campaign.mjs`：生成显式地图，`--check` 检查可重现输出，`--simulate` 100图×seed1/2/3真实AI决策模拟，报告写 `campaign-simulation.json`。模拟玩家只经 planRoutes/switchRoute 控制，无状态设胜；有具体战斗边界的单元测试使用人工fixture，两者证据区分。
- `services/tianxia-server/src/matches.mjs`、`tests/server.test.mjs`：可选seed/loadout的有界PVE接口、屯兵-1、同序不同指令冲突、自然结束和放弃/过期的奖励资格。未声称验证服务端持久卡库。

## 已执行命令与准确结果

环境 Node v24.21.0 / pnpm 12.6.0。所有检查顺序执行。

1. `codegraph explore "games/local/tianxia-chalu/src/core engine createMatch tick switchRoute content schema services/tianxia-server/src/matches.mjs"`：当前索引不包含目标，改用定向检索。
2. `node games/local/tianxia-chalu/scripts/generate-campaign.mjs`：成功，当前100图已落盘；单独调用 validateLevels 返回 valid:true。后续内容集中测试再次确认100图schema。
3. `node --test --test-concurrency=1 games/local/tianxia-chalu/src/core/engine.test.mjs games/local/tianxia-chalu/tests/core-content.test.mjs`：早一轮27/27通过，含3张代表图（crossroads/campaign-051/campaign-071）的真实命令完整模拟；后加一条快慢路测试的最近一轮28项中27通过、1失败。失败原因是样本 campaign-021 没有 fast road；最后改成从目录选同时有fast/slow的图，**这一次修正按主会话要求尚未重跑**。
4. `node --test --test-concurrency=1 services/tianxia-server/tests/server.test.mjs`：7通过、3失败。失败均为原有 results.mjs 的目录 fsync 在 Windows 返回 EPERM，影响持久化/重启/容量测试；未修改该越界实现。
5. 只读对 `services/tianxia-server` 目录 open('r') 后 sync()：独立复现 `EPERM fsync`，与匹配规则无关。
6. `node --test --test-concurrency=1 --test-name-pattern="API|authoritative|PVE|server advances|disk failure|HTTP|static game" services/tianxia-server/tests/server.test.mjs`：7/7通过，覆盖接口、固定时间推进、鉴权、频控、重复/冲突指令、seed/loadout、磁盘错误不假称持久化。
7. 针对已改路径运行 `pnpm exec prettier --write ...`：服务两个文件完成格式化；仓库 .prettierignore 本来忽略该独立游戏。pnpm 自动进行现有依赖检查和 prepare（core.hooksPath=.githooks）；没有 package/lock 等额外受跟踪改动。地图生成器使用根已有 prettier 格式化输出。
8. `git status --short`：改动仅授权路径；额外未跟踪仍为既有 game-office 和主会话设计目录。

## 主会话接手事项

- 先重跑上述核心集中命令，确认最后快慢路取样修正；再运行 `node games/local/tianxia-chalu/scripts/generate-campaign.mjs --check`。
- 按最新分工，300场多seed模拟未执行：运行 `node games/local/tianxia-chalu/scripts/generate-campaign.mjs --simulate`，记录真实胜负/超时/未观察到玩家胜利的地图。当前没有完整百图可胜性或平衡结论；不能以3张自动模拟代表人工百关通关。
- storage旧version=1入口、旧UI固定赤关/没有屯兵、render.nextRoute、remote创建seed/loadout、旧三关测试、奖励库存幂等及dev隔离均由主会话接线。applyResult现在要求 `completed:true` 且 reason 是 timeout/elimination。
- 每个点将来源最多一名活将、每阵营最多两名；来源失守取消光环但活将仍行动。来源台被占后，旧将仍占用该来源的招募名额至退场。这一明确约束请在军情文案中保持一致。
- 城防被攻破后目前不自动修复；占领保留0城防，武器3秒整备后可用。若产品要恢复城防，需要明确修复规则再接，不要在Cocos渲染内偷偷修改。
- 64单位城距只证明逻辑布局未贴合，尚未看实际Cocos文字、缩放后的热区和连线视觉；由主会话在手机画面验收。
- 处理/确认 Windows results.mjs 目录 fsync 兼容后重跑完整服务测试。当前不能声称服务持久化全套通过。
- 未运行构建、浏览器、开发模式门禁、准确候选校验、Creator、真机、CI/Pages；发布由主会话负责。

本阶段不再占用仓库写入权。
