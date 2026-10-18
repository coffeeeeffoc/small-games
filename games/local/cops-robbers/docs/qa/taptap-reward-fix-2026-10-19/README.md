# 围捕小队 TapTap H5 提示奖励修复

日期：2026-10-19。适用于 `cops-robbers`（围捕小队）的 H5 包。验证采用本地 Chrome、触屏模拟和 SDK fixture；尚未上传，也没有本包真实 TapTap 广告或手机验收结果。

## 原因与处理

- 公共广告层已经在 SDK 确认打开后停止超时，但游戏 `src/ads.js` 仍从点击计时 45 秒，长广告会被外层取消。现将 `onShown` 经 `ad-host.js` 透传，仅限制打开阶段。
- `visibilitychange` 原来无条件取消提示，广告覆盖页面也触发取消；`showHint` 又直接丢弃隐藏时返回的结果。现保留广告请求和控制锁，结果在恢复前台后交付，再开始 Worker 求解。
- 主动退出、页面实际离开仍取消，旧完成回调不能给新局面发奖；旧 `onShown` 不能停止下一次请求的计时器。未结束的宿主请求继续占用广告锁。
- 常态按钮文案由“看广告”改为“提示”，无障碍名称为“获取提示”。取消观看时显示“广告未看完，本次未获取提示。”，异常仍显示加载失败或不可用；成功后展示路线文字与棋盘高亮。

## 制品

- ZIP：`outputs/cops-robbers-h5-reward-fix-2026-10-19/cops-robbers-taptap-h5-ads-on-service-off.zip`
- SHA-256：`f968301cead84ba658d58b0aa9d90d595ad0aea3c627980c179df7f008a5e904`
- 大小：969848 字节；竖屏、广告开启、服务关闭，保留原有广告位配置。
- manifest 同目录同名 `.json`，并归档为[包体清单](package-manifest.json)；准确测试目录为同名子目录下的 `dist/`。构建器重新读取 ZIP 核对各条目，浏览器脚本再次核对 ZIP SHA 和全部被测文件 SHA。
- 来源：本地 `83b06770` 之后的工作区，`sourceDirty: true`，打包时尚未提交，包含当前已存在的美术与主页改动。此次提交只纳入广告修复、相关测试及记录，其他美术与主页改动仍留在工作区；截图和整包报告对应上述 ZIP，不能当作提交中包含了这些美术改动。未推送或上线。

## 验证

修复前新增回归确实复现：SDK 已确认打开后，虚拟时钟推进 10 分钟，游戏仍返回 `failed`；缺少 `onShown` 和隐藏结果缓冲的检查亦失败。修复后 `check-ad-core.mjs` 共 7 项通过。

整包 `check-taptap-ads.mjs` 共 12 个场景通过，覆盖 320×568、390×844、844×390 的触屏点击、SDK 缺失、未完整观看、创建/加载/打开失败、打开一直不返回、退出和迟到回调。正常打开后虚拟推进 10 分钟仍能领取提示；分别覆盖“关闭回调先到”和“前台先到”。可见性事件冒泡到 Window，隐藏期间不会启动提示 Worker，重复完成只分析一次。查看 [整包报告](taptap-report.json)与[手机提示截图](tap-hint-390.png)。

通用宿主与模拟广告 `check-rewarded-hints.mjs` 共 12 个场景通过，覆盖错误结果、未结束请求锁、超时清理、隐藏/返回、反复取提示走到过关，见[宿主报告](rewarded-hints-report.json)。

`check-game-shell.mjs` 的 9 个手机场景通过，包含返回主页取消旧提示、再次获取提示、触屏手势取消及过关相关状态，见[游戏界面报告](game-shell-report.json)。合计 7 项逻辑测试与 33 个浏览器场景通过。

提交前将暂存区的广告端口、组合测试及依赖导出到独立目录，再次运行 7 项逻辑测试通过；`index.html` 与 `check-game-shell.mjs` 仅暂存提示文案相关修改。上述 33 个浏览器场景是工作区整包的验证记录，没有将其标成排除其他美术改动后的整提交验收。

复现命令（仓库根目录）：

```powershell
node --test games/local/cops-robbers/scripts/check-ad-core.mjs
node games/local/cops-robbers/scripts/check-taptap-ads.mjs outputs/cops-robbers-h5-reward-fix-2026-10-19/cops-robbers-taptap-h5-ads-on-service-off.json
```

这些结果证明该制品在模拟 SDK 时序下能发放可见提示，不替代真实 TapTap SDK、广告库存和真机完整观看测试。客户端应上传并验证上面的新 ZIP，旧包不会随源码修改自动更新。通用原则见[TapTap 广告避坑指南](../../../../../../docs/operations/taptap-rewarded-ads.md)。
