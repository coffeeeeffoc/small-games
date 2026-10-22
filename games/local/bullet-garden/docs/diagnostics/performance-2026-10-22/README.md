# Creator 固定工作量性能基线

2026-10-22 07:01 UTC 开始，真实 Creator 3.8.8 web-mobile 产物；游戏源码基线为 `b1b9e088106e9329fe7bd59c45f2d8000317835d`，产物 sourceHash 为 `3c4c0f1cf5f231a5443343ff2e07590b4a818be77cc925be728be4df7b4074eb`。运行前核对了源码指纹和每个产物文件的摘要。

没有修改战斗、画面或渲染实现。当前样本中未观察到需要改动的明确瓶颈；本次交付固定场景、测量工具、逐帧证据和诊断 trace，不能据此承诺手机性能。后续优化须在目标设备重测并做相同工作量对照。

## 环境和场景

- 同一台 Windows x64、i7-12700KF，Chromium 140.0.7339.186，390×844、DPR 1。实际渲染后端为 ANGLE Vulkan **SwiftShader 软件渲染**，不是手机或硬件 GPU 测量。
- 首关：全新存档 `ruins`，模拟 3–13 秒，固定种子 `20261022`。
- 密集战斗：合法解锁 `skyreach`，经验 10000、前 13 关完成、生命升级 20、护甲升级 15（实际生命上限 400、护甲 45）。模拟 170–180 秒。使用正常规则、正常自动攻击、合法升级选择，未注入敌人或跳过死亡。
- 每个模拟步为 1/60 秒；移动为 `cos(step/60*0.45)*0.6`、`sin(step/60*0.45)*0.6`，升级选字典序第一个真实候选。真实触摸开始，预推进逐次调用原会话 tick；随后 120 个真实 Creator 帧预热、600 帧采样。预推进省略了先前渲染池和 GC 历史，结论限于预热后的固定窗口。
- 每个真实组件 update 执行一个固定模拟步。浏览器真实时钟、rAF 和渲染器未替换。固定模拟步数保证工作量一致；它不是自然墙钟节奏的人类试玩。

## 三次独立样本

| 场景     | drawcall 均值 / p95 | 帧阶段 p95（ms，三次） | Creator 帧起点间隔 p95（ms，三次） |
| -------- | ------------------- | ---------------------- | ---------------------------------- |
| 首关     | 10.4 / 11           | 0.9、0.9、0.9          | 17.6、17.8、17.7                   |
| 密集战斗 | 11 / 11             | 1.5、1.4、1.5          | 17.8、17.6、17.8                   |

帧阶段是 `Director.EVENT_BEGIN_FRAME` 到 `EVENT_AFTER_DRAW` 的墙钟耗时，含调度、等待与提交，不等于纯 CPU 或 GPU 完成耗时。`intervalMs` 是 Creator 帧起点间隔；引擎调度可能筛选 rAF，因此它不等于原始 rAF 或屏幕实际呈现间隔。drawcall 在 AFTER_DRAW 读取引擎当前帧 device 计数，未开启额外 profiler 绘制层。密集场景最多 11 敌人、11 植物、50 粒子；池规模最多 23 sprite、8 label。它是固定自然战斗窗口，不是极限压力上界。

三次首关和三次密集场景的完整战斗开始/结束状态哈希分别一致；只有真实时间和随机会话标识组成的 `runId` 从哈希排除，原值仍保存。逐帧文件还保存完整 RNG、实体、计时器、runConfig、profile、输入步数和升级选择，可复核重现。截图三次像素一致，保留各场景一份。

主样本未开启 CPU profiler 或 Chrome 重 trace。额外密集诊断样本开启两者，单独标记 `diagnostic: true`，不进入上表；该样本状态哈希与主样本相同。trace 含预热过程，不能整体当作纯 600 帧样本。CPU 样本主要为 idle/program，少量引擎绘制与 GC，未提供足以支持某项代码优化的稳定热点证据。不声称整个电脑没有其他后台工作负载。

本次基线进程退出码为 0，独立只读复核确认 6 次主测和 1 次诊断的完整数据、连续步数与状态一致性。初版原始报告尚无 `passed` 字段，保持原件不补写；交付脚本已增加成功/失败标识、脚本摘要和实际 URL，并拒绝 `GAME_URL` 覆盖，防止本地源码指纹被错误用于远端页面。

## 复现与证据

在游戏目录已有当前源码匹配的 Creator 构建后运行：

```sh
QA_OUTPUT=reports/performance PERF_DIAGNOSTIC=1 node tests/cocos-performance.mjs
```

PowerShell 使用 `$env:QA_OUTPUT` / `$env:PERF_DIAGNOSTIC` 设置同名变量。默认每场景三次，可用 `PERF_RUNS` 调整；少于三次不用于三次对照结论。脚本拒绝旧源码产物、缺失 drawcall、非战斗状态和重复运行的状态不一致。

`performance-report.json` 保存全部数值与环境。`*.frames.json.gz` 是逐帧指标及完整检查点；`dense-diagnostic.trace.json.gz` 可解压后用 Chrome trace/Perfetto 检查；`dense-diagnostic.cpuprofile.gz` 可用 DevTools Performance 检查。`first-1.png`、`dense-1.png` 是真实产物截图。

## 最终生命周期修复产物复测

[final/performance-report.json](final/performance-report.json) 对源码指纹 `d8bc6077484acd06ebac1c47620363d69f07cd019fabc541faa730558a6586a5` 再次完成每场景三次及独立诊断，`passed: true`。首关帧阶段 p95 为 0.9 / 0.9 / 0.9 ms，密集场景为 1.5 / 1.5 / 1.4 ms；drawcall 与基线一致。两场景全部起止战斗状态哈希也与基线一致。最终实现只修音频及销毁清理，没有改变活动绘制路径，未把正常测量波动宣传为性能收益。最终逐帧数据、trace 和截图单独保存在 `final/`。
