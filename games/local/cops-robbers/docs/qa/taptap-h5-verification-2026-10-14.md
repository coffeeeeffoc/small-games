# 广告提示与 TapTap H5 测试包

验收日期：2026-10-13 至 2026-10-14。环境为 Windows、Playwright Chromium 与触屏模拟，**不是实体手机或 TapTap WebView 验收**。

## 本次结果

- “看广告”完成一次观看才求解当前位置；中途关闭、异常、不可用、超时、离开局面和晚到回调不给提示。广告与提示不消耗回合。
- 超时会恢复行棋，但未结束的底层广告保留请求锁，防止重复调用；缺少清理方法和清理后仍未结束两种情况均已覆盖。
- 好友 PK 入口禁用；旧 room 链接及公共联机控制器不会启动好友或全站榜，不发送联机 API 请求。保留人机、接力、快练、存档和同题分享。
- 320 像素下按钮缩短为“看广告”，无障碍名称保留“看广告获取提示”；实际截图检查了完整按钮、提示高亮和广告完成/取消操作。

## 测试记录

| 检查 | 结果 | 记录 |
| --- | --- | --- |
| 已解压 ZIP 的广告流程，320×568 / 390×844 / 844×390 | 12 项通过；无页面错误及联机请求 | [广告报告](taptap-h5/rewarded-hints.json) |
| 生产包首页、选关、触控取消、人机、换装、返回、接力及提示 | 9 项通过 | [游戏流程](taptap-h5/game-shell.json) |
| Shell iframe 与独立手机入口，提示、行棋、撤销及返回 | 通过 | [嵌入报告](taptap-h5/shell-integration.json) |
| 开发模式的默认、URL、存储、显式关闭与公共触控/iframe 固定用例 | 10 项通过，0 错误 | [开关报告](taptap-h5/dev-mode.json) |
| 首页与联机禁用，小屏及人为启用的旧控制器回归 | 9 项通过；本轮较早验证 | [视口报告](taptap-h5/viewport-layout.json) |
| 发布范围与候选验证工具 | 72 项通过 | `node --test scripts/publication-scopes.test.mjs scripts/validate-tree.test.mjs` |
| 共享改动格式 | 5 个文件通过 | `pnpm exec prettier --check`，仅检查本次共享改动 |

另已通过 `pnpm check:dev-mode`（68 款游戏，0 问题）、`pnpm test:dev-mode`（5 项）和本游戏原生单机入口的 Node 回归。全屏公共代码、地图和求解规则未改动，不重复全游戏或全关最短解审查。

截图：[390 首页](taptap-h5/home-390.png)、[390 模拟广告](taptap-h5/ad-390.png)、[320 提示](taptap-h5/hint-320.png)、[Shell 手机入口](taptap-h5/shell-phone.png)。其余两种视口的截图保存在同目录。

## 准确包体

验收时工作树基于 `dev` 的 `145d59e0392bf005b1a9d62e287fcd7c29f32ec3`，当时本次改动尚未提交或推送。测试读取的是该工作树生成的最终 ZIP；不将上述 HEAD 当作包含本次修改的提交。

- 产物：`outputs/cops-robbers/cops-robbers-taptap-h5.zip`。
- SHA-256：`4cd96a4021f7540cd892d914a9aa1cc574e0851472f6b8a1d9441d113e9fa839`。
- 35 个资源，单一 `dist/` 顶层目录，入口 `dist/index.html`，竖屏参数为 1。
- ZIP 全部条目核对大小和 SHA-256，再全新解压到 `outputs/cops-robbers/taptap-h5/dist`，以该目录实际启动广告与游戏流程检查。
- 上传目录与 ZIP 排除旧联机脚本和 API 配置；常规 dist 保留的旧文件不会混入本包。完整清单见[包体记录](taptap-h5-package.json)。

## 尚未完成

用户确认广告尚未开通。当前是明确标注的模拟广告和宿主替身回调，不是商业广告。按[发布准备](../deployment/taptap-h5.md)先在后台申请开通，再读取实际广告配置，完成 TapTap 提供方适配及真实观看回调验收。

未上传、未审核上线；未做 Android / iOS TapTap 真机、真实广告、财务结算或公网联机验证。上述本地检查不代表 CI、平台审核或上线成功。
