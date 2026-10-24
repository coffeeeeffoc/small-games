# 神机合阵 · Cocos 移动版

Cocos Creator 3.8.8 / TypeScript，横屏触屏优先。核心循环是「三选一开局 → 商店买卖 → 拖动布阵与施法 → 锁阵自动战斗 → 攻晶结算 → 下一回合」。当前为本地人机对战，提供六章30关、8位神将、8种移动机关、4个流派、4种法术，以及图鉴、教学、暂停、结算与断局续玩。

## 运行与验证

从仓库根目录执行，COCOS_CREATOR 可指定真实编辑器路径：

```powershell
pnpm --filter @small-games/merge-front typecheck
pnpm --filter @small-games/merge-front test
pnpm --filter @small-games/merge-front build
pnpm --filter @small-games/merge-front dev
# 另一终端，生产包在 http://localhost:4197
pnpm --filter @small-games/merge-front test:browser
# 可复现的开局敏感性对照，写入设计目录 balance-report.json
node games/local/merge-front/tests/balance-simulation.mjs
```

构建输出 dist/。没有编辑器时只接受源码及运行文件摘要匹配的 MERGE_FRONT_PREBUILT_DIR，其中须有 dist/ 和真实 cc.d.ts。不存在替代引擎构建。支持独立、Shell iframe 和共享开发者模式；开发操作不写正常通关记录。原生构建命令为 build:wechat、build:douyin、build:bilibili；AppID 沿用仓库 WECHAT_APP_ID、DOUYIN_APP_ID、BILIBILI_APP_ID，B站还需官方构建扩展。--config-only 只生成配置，不代表平台验收。

## 操作与规则

- 开局从8个双卡包中展示3个不同选项，至少包含同派和混搭；选一个获得两张完整卡。商店从第一关起覆盖全部16个单位，不受开局选择限制。
- 每次商店3件商品，普通单位3金、四种高阶单位4金；刷新1金，买走后不补货。商品拖到右侧手牌区购买。每轮自动换货；金币不足、库存满、取消拖动均不成交。
- 哪、吒各1金，不能单独上阵，配齐自动合成1级哪吒；持有单字时下次刷新保证另一字出现。残字可拖到弃置区，返还0金。其他武将、武器直接购买完整卡。
- 拖完整卡到我方空地成为独立个体，拖到同名个体则等级相加；没有同等级或星级限制。武将和武器合计最多6个。满员时仍可合并升级。场上个体拖回手牌可下阵。
- 只显示实际商品和手牌，不留空槽。库存上限12（含完整卡、法术和每个残字），每页4张；场上6个另计。点击查看说明，拖动才操作。拖动场上单位时原位的角色、影子和等级一起隐藏，取消还原。
- 整备时拖到右侧售出区才出售，普通单位返1金，与等级无关。离火铳改为赠磨刃，回春灯改为赠护符，均不返金；巡天机返1金并存一次免费刷新。赠牌放不下会提示，回收/合并不触发出售效果。
- 烈焰、雷霆、玄甲、灵泽按不同名字计数，2/4名激活；同名多只不重复计数。烈焰加强伤害与溅射，雷霆加攻速，玄甲加生命，灵泽提供开战护盾、4名时还需靠近另一灵泽。点击流派纹章查看数值。
- 巨灵神、雷震子、九天玄女首次实际参战分别提供最近友军生命、最近雷霆攻击、其他灵泽生命增益。回收不刷新；合并相加永久加成、保留已触发标记，不重复赚入场收益。
- 法术买入手牌后拖向己方场上单位：磨刃永久+5攻击、锻体永久+35生命、护符下一场+30%生命护盾且不叠加；鼓舞拖己方场地，本场全军攻击+12%，每轮一次。
- 整备不限时、无被动收入；开战后禁止购买和改阵，每个上阵个体只生成一名战斗单位。二维自由移动、就近攻击，不设固定路线。
- 每回合最多30秒。全灭对手则获胜，双方仍有单位或同时全灭为平局。水晶初始30；胜方伤害为 min(5, 2+存活单位等级之和)，有破城锤存活额外+1，合计最多6。结算演出2秒，阵容保留、战斗生命重置。
- 第一轮6金，后续每轮+1、封顶16，余额保留，败方额外+1；无利息或连胜奖励。留钱刷新、补流派、合高等级和买法术共用预算。
- 水晶归零结束；第12回合结束仍未击破时比较水晶剩余值，相同为平局。AI使用相同抽取、资源、命令、上限和战斗规则，整备开始时完成决策，敌方阵容可见。
- 暂停和切后台冻结模拟，恢复需手动继续。重开需确认，回首页保留本局。进度沿用v2，对局使用match:v4；旧match:v2/v3原文保留，但不能直接续打不同规则。清除浏览器存储会失去本地记录。
- 采用3D风格透明精灵、前后遮挡、脚底投影与攻击动作，属于2.5D表现。六种攻晶演出按种子/回合选取，不影响伤害随机序列；设置可减弱动态，暂停和恢复不重复扣血。
- 20Hz规则核与界面分离；保存最近4096条命令及其起始序号，超长整备操作仍可恢复。常规对局完整历史保留在此范围内。

## 可选激励广告

入口在暂停后的设置页，仅已配置提供器且尚未领取时显示。完整观看增加2金币，每局一次；取消、不可用、失败、跨局迟到回调均不发奖。使用后标记辅助记录，不影响正常解锁。没有广告位时隐藏入口，正常闯关无需广告。

H5 接入统一打包入口：

```powershell
$env:H5_ADS_ENABLED='1'
$env:TAPTAP_MERGE_FRONT_AD_UNIT_ID='实际H5广告位ID'
node scripts/h5-taptap-build.mjs --game merge-front --with-ads --without-service
```

原生 ID 分开配置，然后重建相应平台：

```powershell
$env:MERGE_FRONT_WECHAT_AD_UNIT_ID='实际微信广告位ID'
pnpm --filter @small-games/merge-front build:wechat
# 抖音：MERGE_FRONT_DOUYIN_AD_UNIT_ID
# B站：MERGE_FRONT_BILIBILI_AD_UNIT_ID
```

Web 复用 platforms/h5/game-rewards.js；原生打包同一 platform-ads.js 提供器，通过 MergeFrontHost.ads 交付 offer/cancel/dispose，不复制 SDK 回调规则。宿主也可注入遵循 GameHost 广告契约的 MergeFrontHost.ads。真实广告填充、平台授权和物理设备需在配置真实 ID 后验收，SDK fixture 只验证逻辑契约。

## 代码与内容

| 路径 | 职责 |
| --- | --- |
| assets/scripts/core/content.ts | 配方、关卡配置与引用校验 |
| assets/scripts/core/engine.ts | 20Hz纯规则、种子随机、命令校验、AI、自由移动战斗与快照 |
| assets/scripts/core/progress.ts | 存档迁移、解锁、勋章与幂等结算 |
| assets/scripts/core/rewards.ts | 单局奖励及取消、迟到回调保护 |
| assets/scripts/MergeFront.ts | 页面、触屏、生命周期与端口接入 |
| assets/scripts/MergeView.ts | Cocos节点、图片、HUD与战斗表现 |
| assets/scripts/BattleEffects.ts | 只读模拟进度的角色动作、武器轨迹与六种攻晶演出 |
| assets/resources/ | 原创图集、场景与音效 |
| docs/design/ | 重构方案、效果图与验收记录 |

核心没有 DOM、Cocos 或 SDK 依赖。联机接入时由服务器运行同一规则核，客户端提交带 matchId/seq/version 的命令并插值展示快照；服务器管理种子、抽取、推进和胜负。当前尚未提供匹配、房间服务或真人对战，纯核回放测试不等同于跨设备联机验证。

## 本轮视觉与发布资料

[本轮方案](docs/design/shop-synergies-2026-10-23/PLAN.md) · [多角色审查](docs/design/shop-synergies-2026-10-23/REVIEWS.md) · [效果图与生成记录](docs/design/shop-synergies-2026-10-23/PROMPTS.md) · [实际验证](docs/design/shop-synergies-2026-10-23/VALIDATION.md) · [八类发布资料](publishing/STATUS.md)。上一轮布阵设计保留在 docs/design/round-formation-2026-10-23。
