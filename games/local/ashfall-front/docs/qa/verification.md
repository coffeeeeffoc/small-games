# 灰烬防线 · Cocos 2.0 验证

当前控件、输入和前方遭遇修正的验证见 [2026-10-25记录](controls-2026-10-25/verification.md)。以下保留迁移历史，不作为本次修改后的最终通过证据。

验证环境：2026-10-24至25日，Windows、Node24.21.0、pnpm12.6.0、真实Cocos Creator3.8.8 Web Mobile，私有工作树冻结离线依赖安装。旧Canvas初版记录保留在同目录历史文件，不能作为当前版本通过证据。

## 实际结果

- 25项规则/存档/奖励测试通过：23关配置与稳定ID、据点接通和Boss前置、碰撞/连锁/冲刺、失败冻结、全部23次关卡推进与满五种改装后的免费继续、旧3关存档保留/旧最佳失效、严格completed发奖/限次/取消/旧局旧关回调拒绝。
- 规则层自然输入抽样，seed0x41a5f00d、60Hz，不改生命/敌人：第1关354.5秒、132击破、剩120HP；第3关363.8秒、136击破、剩90HP；第23关412.8秒、172击破、剩96HP。第一关略低于6–9分钟参考目标。连续23关推进测试使用明确设置的清场状态，仅证明状态机，不表示自然连续通关；单一自动策略连续挑战在第2关失败。
- 真实Creator构建与引擎类型检查通过；scripts/verify-artifact.mjs核对当前源码指纹、3.8.8标记、cc.d.ts和运行文件SHA-256。dist/build-info.json记录当前源/输出身份；没有手写引擎声明或旧Canvas嵌套运行。
- 浏览器实际流程、报错和截图以[cocos/report.json](cocos/report.json)为准。触屏覆盖844×390、390×844、568×320、932×430、1024×390、1280×720；开始、分页23关、移动/射击/跳跃、多点取消、失焦/暂停冻结/恢复、试玩胜负和重试。试玩操作只在dev模式存在，不写正常存档。
- 正常桌面模式检查锁定关卡、无开发修改API、无SDK仍可玩及真实鼠标场景瞄准。Cocos3.8.8会将鼠标合成未标记Touch；去重时间仅由真实DOM touchstart更新，避免阻断鼠标开火。
- SDK隔离夹具覆盖completed、dismissed、failed、先关闭后可见、先可见后关闭、跨局迟到回调，以及50%续战后实际恢复；隐藏不取消已展示广告，无成功show后的墙钟超时。夹具不是正式库存证据。

175项共享接线/构建计划/制品复用/横屏矩阵/入口契约测试通过；配置检查42款零问题、开发模式同步42款零问题、依赖边界通过。仓库实际run-selected-browser也完成本款desktop与touch检查；run-selected-shell完成生产Shell iframe、返回目录、手机独立入口与Runtime隔离，见[cocos/shell-report.json](cocos/shell-report.json)。独立只读复核未发现重要缺陷。当前合并源提交：9c654b111352e1fdd1da6d54ca419eca0478ff9f；[实际制品清单](cocos/build-info.json)源码指纹：4fff2998e62ec7a641186e3a51267e7aa2cc18fb7dc9ce5243ca1e4cbd69b152。H5 ZIP的98项资源大小与哈希一致，未上传。

## 当前画面与素材

[首页](cocos/home-844x390.png)、[选关](cocos/levels-844x390.png)、[战斗](cocos/combat-844x390.png)、[暂停](cocos/pause-844x390.png)、[补给确认](cocos/supply-confirmation.png)是实际Creator画面，竖持、小屏、宽屏同目录。四页方案图仅为概念，见[方案](../design/cocos-campaign.md)。八类基础上架资料及普通模式实玩录屏见[publishing/STATUS.md](../../publishing/STATUS.md)。

## 发布与边界

TapTap应用998795（Developer492506）于2026-10-24查询未开通广告，正式配置关闭。未验物理手机、Safari、TapTap真宿主/真实库存、原生小游戏、上传、审核及部署。6–9分钟为节奏目标，真人长局手感、难度与续航仍需设备试玩；抽样自动策略不能代替真人平衡评价。

本记录是本款及接线的定向检查，不是完整validate:candidate通过记录。普通push保留hooks和非强制保护；最终推送base/head及CI/Pages状态由交付信息记录。远端推进后必须合并并重建/复测，不能沿用合并前制品。

首次推送36f1ff80的Pages范围规划失败：规划环境只安装锁定Prettier，本次接线证明错误依赖完整工作区中的js-yaml。已改为使用规划阶段已有的Prettier YAML解析器，保留完整工作流比较与所有锁文件文档校验；新增仅Prettier、无js-yaml的独立进程回归，覆盖全部8个真实接线文件及首个锁文档被篡改时拒绝。未修改或放宽发布门禁。

2026-10-25 CI 维护：确认 `assets/emblem.svg` 的 LF/CRLF 是 Windows 制品与 Linux Pages 源码指纹不一致的原因，指纹文本归一化已包含 SVG。26 项规则与指纹测试通过；新增测试在 Windows 和 Linux Node 24.21.0 均通过，验证换行等价、SVG 内容变化和二进制变化仍使指纹失效。基于 b5105c58 的修复候选已用 Windows Creator 3.8.8 实际重建，再由 Linux `pnpm run build` 验证并使用同一制品；源码指纹为 `dea2dd6e95fc19c75c3e1a07cbae3576a37a5a786dc32fa21cad43a4479bdaf8`。本次未改变玩法或画面，沿用上述实机模拟素材；CI/Pages 最终结果另行核对，不能用此次本地通过代替。
