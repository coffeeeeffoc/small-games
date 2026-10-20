# 围捕小队 H5 混合操作实测

基线 `f3881ea5004177f81a946f3a939efc8dbdcd1c9b`，隔离工作区本地 production dist，Windows / Chrome 155.0.8059.82，无头独立 context，390×844 触屏模拟。实现及复现方式见 [命令模型说明](../command-model.md)。

[report.json](report.json) 中 1、28、120 三关各两个 seed（91842、20261020），每组 24 条，共 144 条真实触屏命令全部通过。命令混合移动、提示、撤销、重开；模型只保存独立的初始和移动前快照，分别验证提示不改棋局、撤销恢复前一状态、重开恢复初始状态。业务走棋函数不作为这三项性质的预期结果。每次提示还确认新的 worker 请求，避免旧提示文字造成假通过。

同目录六份 `level-*-seed-*.json` 保存具体命令、操作前后状态、计数、seed、算法版本、源码摘要及 replayPath。[replay-report.json](replay-report.json) 是第 1 关 seed 91842 的独立具体命令重放，24 条全部通过。报告里的绝对 replayPath 是当时输出位置；归档后可直接指定这里保存的 JSON：

```sh
node scripts/check-command-model.mjs --replay docs/qa/command-model-2026-10-20/level-1-seed-91842.json
```

纯模型与缩减器测试 6/6 通过：包括注入错误时检测三项性质、快照复制、固定 seed、同一断言签名的删除缩减、拒绝无效前置/其他失败、预算和保存后的异常。当前浏览器业务未出现失败，没有伪造最小失败样例；若出现真实断言失败，先存原始记录，再做最多 16 次/30 秒的缩减，每次接受更小结果立即保存，使用相同 `--replay` 接口复现。

[playtest.json](playtest.json) 为提取共用 browser-helpers 后原有解法测试的回归：第 1、28、120 关分别 7、9、14 步通关，同时覆盖原有首页/选关、存档、提示/撤销/重开、320×740 与 390×844 手机布局和触屏通关。没有扩为全仓或全关长时间浏览器检查。[代表截图](level-120-seed-20261020.png) 已保留。

这些是提交前的源码摘要证据，candidateSha 明确为 null；最终提交的准确 SHA 验证和 CI/Pages 状态见交付记录。提示广告沿用既有 completed fixture，不代表真实广告平台验收；未修改广告/奖励规则，也未进行物理手机验收。
