# 持续军令与军衔匹配验收

2026-10-28，Node 24.21.0、pnpm 12.6.0。最终运行制品来自 [Windows Creator 3.8.8 子任务](https://github.com/coffeeeeffoc/small-games/actions/runs/40563990646/job/122400228849)，源码指纹 `bcae28758ed2c77051020fef14e788d99251cf46ca968efffa59dbad9908468b`。下载 ZIP 的 SHA-256 为 `24d8e17cab27ccae4d423f4eb440fdab98934d15ad84080ee36a8750cd2d6f78`；[构建身份](../../../publishing/verification/continuous-orders/build-info.json)和[生产来源](../../../publishing/verification/continuous-orders/cocos-provenance.json)保持原样。合并并行 dev 更新后再次通过 `verifyPrebuilt`，未改写制品身份。

## 规则与战斗

- [游戏规则及输入、存档、客户端测试](../../../publishing/verification/continuous-orders/game-rules.txt)：92 项通过。
- [服务测试](../../../publishing/verification/continuous-orders/server-rules.txt)：19 项通过，含真人双席位、独立序列、等级/胜率匹配、持久化失败重试及重启补结算。
- [100 张地图通关重放](campaign-results.md)：100/100，通过公开军令搜索 169 局；同一指令流重放的最终状态完全一致。另用 24 组种子验证 60:20、120:30、300:60 同条件对攻，优势方均在 65 秒内取胜；多目标分配保持兵力守恒。
- [Shell 入口契约](../../../publishing/verification/continuous-orders/shell-contract.txt)：13 项通过。最终 Creator 子任务的类型、规则及构建校验通过。

## 浏览器检查与发现的修复

桌面 Chromium 140.0.7339.186，手机触屏模拟；自动回归有明确的时钟、种子及广告/库存夹具。下面保留原始失败报告及对应复测，避免把旧制品和局部复测合称为同一轮全量通过。

1. [首轮 14 项](../../../publishing/verification/continuous-orders/initial-browser-report.json)中 13 项通过，覆盖拖拽、多目标、单线撤销、自然胜负、免费卡/广告升级、重试、装备、后台、旋转与输入坐标；双指缩放失败。Creator 将 Map iterator 的数组展开编译为错误的 concat，改用 `Array.from`。
2. [随后 10 项定向回归](../../../publishing/verification/continuous-orders/prewheel-browser-report.json)中 8 项通过。双指缩放和平移已通过，但新增覆盖发现 Cocos 阻止滚轮冒泡，改用捕获阶段监听；本机经验用例的刷新步骤重新注入旧存档，修正为只初始化空存档。
3. [本机经验复测](../../../publishing/verification/continuous-orders/offline-browser-report.json)通过：自然失败从 92 增至 100 经验并晋升，首页/战绩/刷新均正确；9000 经验的在线缓存保持独立。此制品与最终版的宿主脚本一致，仅不含滚轮捕获修复。
4. [最终缩放复测](../../../publishing/verification/continuous-orders/zoom-browser-report.json)通过：鼠标悬停、放大后选城、地图模式、双指缩放、空白平移、按钮及滚轮，不产生误军令。
5. [最终服务浏览器检查](../../../publishing/verification/continuous-orders/server-browser-report.json)12 项通过：两位真实浏览器用户匹配、各自指挥、胜负经验、幂等结算、无人等待、取消竞态、401 恢复、失效对局零经验、断网恢复；无页面异常。
6. [最终共享入口消费者](../../../publishing/verification/continuous-orders/shell-browser-report.json)通过桌面 iframe 鼠标与 390×844 直接触屏两种环境。调用现有 Shell 的实际游戏检查函数，验证持续军令、继续战斗和投降返回；这是定向消费者检查，不代表重跑整个 Shell 目录。

最终改动只影响滚轮监听，已通过的其他检查按实际影响范围复用。依照仓库当前的相关必要验证约定，未重复执行全仓 `validate:candidate` 或原生平台门禁。推送候选保留正常 Git 合并、格式 hook 与非快进保护。

## 实际画面与交付边界

[采集报告](../../../publishing/verification/continuous-orders/capture-report.json)来自最终构建，540×1168 视口、DPR 1.5，正常时钟和随机布阵，无战局、经验、广告或库存夹具。实际触屏下达两条路线、切换地图/城池、撤销一条路线、确认返回并查看战绩；8 张 810×1752 截图和 50.76 秒录屏见[上架资料](../../../publishing/STATUS.md)。视频完整解码通过，文件规格与 SHA-256 见[媒体清单](../../../publishing/verification/continuous-orders/media.json)。

真人匹配需要运行配套对局服务；本次提交服务实现与验证，不宣称已更新线上后台。实体手机、渠道广告 SDK、原生小游戏与平台提审未执行。概念效果图没有作为实际截图。

取得最终制品的整体 workflow 为失败：与本任务无关的[夜航子任务](https://github.com/coffeeeeffoc/small-games/actions/runs/40563990646/job/122400229704)有 6 项旧断言失败；本游戏子任务成功。该次夜航源码与当时 dev `c43af0ec` 完全一致。后续又正常合并 dev `63a2be01` 的夜航视觉更新；最终推送的 CI/Pages 状态应以对应提交的新运行单独确认，不能以本地或单项成功替代。
