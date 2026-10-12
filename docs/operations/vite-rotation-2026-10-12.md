# Vite 安全补丁与横竖屏回归修复（2026-10-12）

实际截图：[Shell 横屏](../../games/local/out-of-frame/docs/design/rotation-2026-10-12/shell-landscape.png)、
[Shell 竖屏暂停](../../games/local/out-of-frame/docs/design/rotation-2026-10-12/shell-portrait-pause.png)、
[独立页竖屏游玩](../../games/local/out-of-frame/docs/design/rotation-2026-10-12/standalone-portrait-play.png)。
Shell iframe 的反复旋转、暂停恢复、触控映射/取消和返回目录已通过。
复核后补充了 Vite 候选的内置游戏生产页面流程，以及所有受影响游戏的生产开发者模式检查；普通单款变更不扩大范围。

## 基线与边界

本次隔离工作树从 `a3e7551ec8ab5eb323a97ffe3e4c5481e72dfd11` 创建。
重新 fetch 时 main 为 `7446f42f0937565c310e0261a4db9ecc17ef2ff2`，没有 main 独有提交。
dev 已存在的游戏改动保持原样；累计 main 候选仍须单独验证，不能沿用 dev 差异的结果。
使用 Windows、Node 24.21.0、pnpm 12.6.0、Playwright 1.55.1 的 Chromium 1193。
所有手机结果均为桌面浏览器的触屏模拟，不是真机或原生小游戏验收。

## 旋转失败证据与修复

main CI [38165094156](https://github.com/coffeeeeffoc/small-games/actions/runs/38165094156)
在 `out-of-frame/tests/publishing.browser.mjs` 的横屏断言失败。
本地保留原发布路径，连续五次通过，说明失败并非每次发生。
在相同的 `setViewportSize → clock.runFor(100) → 立即读取` 顺序下反复切换，
第 12 次读取时得到 `innerWidth=390, innerHeight=844, visualViewport=390×844`，
但 `data-rotated=false`，严格断言失败。
另一次事件追踪表明 `setViewportSize` 返回时尺寸已经更新，原生 resize 尚未送达。
Playwright 虚拟游戏时钟不能充当浏览器布局/事件完成信号。

修复只改变测试同步：轮询实际旋转标记、视口方向、完整容器边界及棋盘 16:9 几何。
没有增加固定等待、跳过测试、放宽旋转结果或修改游戏模拟。
追加 390×844、844×390、360×640、640×360 的反复切换；暂停中的完整世界状态严格相等；
恢复后时钟继续；真实 CDP 触屏验证移动、取消及旋转后拖框的逻辑坐标。
同一契约还接入生产 Shell iframe，并检查返回主页和目录。
测试保留独立页全屏进出、触屏通关、分享、广告频控及挑战存档隔离。

## 依赖审计

依据 Vite 官方公告：

- [GHSA-vfpm-58rq-9qcg](https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg)：WASM 查询可能暴露文件前四字节。
- [GHSA-rq7h-c2jc-7f22](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)：非 Windows、暴露开发服务器且导入路径与主机路径相匹配等条件下，可能绕过文件允许范围。

未发现用户公网暴露或已遭泄漏的证据。本次不更改网络、凭据、账户权限或后端部署。

| 原根锁版本          | 修复版本                              |
| ------------------- | ------------------------------------- |
| 8.2.2               | 8.2.4                                 |
| 8.3.0               | 8.3.3                                 |
| 8.0.13              | 8.1.6（官方为此分支提供的最低修复版） |
| 7.1.5、7.3.6        | 7.3.7                                 |
| 6.3.5、6.3.6、6.4.1 | 6.4.4                                 |

根锁两个 YAML 文档均纳入审计；33 个直接 Vite importer 和 30 个 Vitest 项目使用新解析。
本仓直接清单逐项更新；根 overrides 将固定子模块及传递依赖保持在各自修复版本线。
锁文件由 pnpm 正常生成，包括 Vite 所需的 Rolldown、平台绑定、PostCSS 及 peer snapshot。
三个本地游戏的独立 pnpm 锁和 puzzle 的既有 npm 锁也已由对应包管理器重建。
fishing 和 tower-defense-game 的子仓 gitlink 未变；根 workspace 安装已修复，
脱离本仓独立安装这两个子仓仍受其自身清单/锁控制，不属于本次已修复范围。

## 确定性增量范围

`scripts/vite-patch-scope.mjs` 绑定两个已审阅基线与新根锁的完整 SHA-256，
并结构比较 manifest，只允许登记的 Vite 变更及累计 main 中已存在的游戏接线。
累计 main 中 Castle Cannon、History Guess 的已有 manifest 改动另以精确摘要绑定。
未知锁内容、额外 override、依赖、脚本或 registry 改动不能因此获得分类。
CI planning 只用 Node 内建能力，无需在规划阶段安装 YAML 解析器。

dev 范围为 26 个独立游戏入口（包括本次 out-of-frame）、5 个内置游戏 smoke，
Shell/Studio/company smoke，以及 30 个真实 Vitest 消费者。
Vite 的构建消费者和仅使用测试运行器的消费者分开处理，后者不沿运行时依赖反向扩展到全仓。
已有规则、类型、lint、依赖边界和生产浏览器门禁继续执行；新增分类单测纳入门禁。
main 的累计范围另包含 dev 已有的改动，当前计划选择 32 个独立游戏入口。
原生平台沿用 `MINIGAME_RELEASE_GATES=0` 的 deferred 约定，不声称已完成平台验收。

## 已完成的针对性验证

- 原始时序的竞争已复现并记录；增强后的独立页完整发布专项通过。
- 增量分类、发布分类及验证执行器相关单测：101 项通过。
- 额外字节、错误锁内容、manifest 非 Vite 改动、缺少工具消费者及原生门禁切换的拒绝/执行用例通过。

准确候选、正常 pre-push、远端 CI/Pages 与部署 SHA 的最终结果以本次交付记录为准。
本节针对性测试不能代替后续准确候选验证或远端发布成功。
