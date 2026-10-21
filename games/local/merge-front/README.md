# 神机合阵 · Cocos 移动版

Cocos Creator 3.8.8 / TypeScript，横屏触屏优先。核心循环是「灵石求字 → 拼装生产兵符 → 水晶出兵 → 就近交战 → 击破敌晶」。当前为本地人机对战，提供六章30关、8位神将、8种移动机关、图鉴、准备、首次教学、暂停、结算与断局续玩。

## 运行与验证

从仓库根目录执行，COCOS_CREATOR 可指定真实编辑器路径：

```powershell
pnpm --filter @small-games/merge-front typecheck
pnpm --filter @small-games/merge-front test
pnpm --filter @small-games/merge-front build
pnpm --filter @small-games/merge-front dev
# 另一终端，生产包在 http://localhost:4197
pnpm --filter @small-games/merge-front test:browser
```

构建输出 dist/。没有编辑器时只接受源码及运行文件摘要匹配的 MERGE_FRONT_PREBUILT_DIR，其中须有 dist/ 和真实 cc.d.ts。不存在替代引擎构建。支持独立、Shell iframe 和共享开发者模式；开发操作不写正常通关记录。原生构建命令为 build:wechat、build:douyin、build:bilibili；AppID 沿用仓库 WECHAT_APP_ID、DOUYIN_APP_ID、BILIBILI_APP_ID，B站还需官方构建扩展。--config-only 只生成配置，不代表平台验收。

## 操作与规则

- 准备页最多选3种神将、2种武器，决定本局残字池。
- 求将、铸器分别花30灵石抽取相应类别残字。拖字到兵符，或先点字再点兵符；「填入残字」填入已有的匹配材料。
- 三个神将槽、两个武器槽是生产工坊。拼齐一套即持续出兵，再拼一套等级加1；同名完整兵符可拖拽合并，等级相加，不设玩法等级上限。升级影响未来出兵，现有单位不会借升级回血。
- 保留多条生产线可以扩军，合并能集中强度。重复余字可3换1；「调整残字」撤回未完成的升级材料。无效拖放和手势取消不消耗材料。
- 战场没有分路，神将和武器都从己方水晶出生，在二维区域内追击附近敌人，否则推进敌晶。任一水晶归零立即结算，同时归零判平局。
- AI 共用灵石、抽字、拼装、生产、人口与攻击规则，仅决策频率和策略由关卡配置决定。通关解锁新配方，图鉴显示解锁条件、定位和技能。局内等级不作为跨局战力继承。
- 暂停和切后台冻结模拟，返回后手动继续。进度和未结束的正常对局本地保存，兼容旧音效设置和胜场；清除本地存储会失去记录。

## 可选激励广告

唯一入口位于暂停页：完整观看后，本局基础灵石收入 +20%，持续30模拟秒，每局一次。增益不发角色、不复活、不修复水晶，暂停及后台不消耗时间；仅 completed 发奖，取消、不可用、失败、跨局迟到回调均不发奖。使用后标记辅助记录，普通解锁仍可结算；未来公平对战禁用助力。无广告位时隐藏入口，正常闯关无需广告。

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
| assets/resources/ | 原创图集、场景与音效 |
| docs/design/ | 重构方案、效果图与验收记录 |

核心没有 DOM、Cocos 或 SDK 依赖。联机接入时由服务器运行同一规则核，客户端提交带 matchId/seq/version 的命令并插值展示快照；服务器管理种子、抽取、推进和胜负。当前尚未提供匹配、房间服务或真人对战，纯核回放测试不等同于跨设备联机验证。
