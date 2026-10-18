# 街区追捕文档索引

- [Tap 小站：登录、云档、榜单](../../../../platforms/taptap/docs/game-services.md)
- [Tap 好友房：规则、界面与验证](../../../../platforms/taptap/docs/design/multiplayer-2026-10-19/README.md)

当前运行入口、目录职责与命令以[游戏 README](../README.md)为准。以下设计、截图、报告与营销素材保留各自日期和验证环境；历史版本的分数、命令及截图不代表当前版本已验收。

## 当前设计与交付

- [2026-10-19 整理与生命周期验证](qa/2026-10-19-cleanup.md)

- [保安角色与奖励流程](design/security-guards-2026-10-18/README.md)
- [首页、分享与广告交互调整](design/home-polish-2026-10-18/README.md)
- [安全区方案](design/top-inset-2026-10-16/README.md)
- [支援规则及初始验收](design/rewarded-support-2026-10-13/README.md)
- [旧 H5 专用发布链与历史证据](deployment/taptap-h5.md)
- [QA 报告](qa/)：按文件日期保留包体与广告专项证据。
- [保安版营销素材](marketing/2026-10-18-security/README.txt)：成品、源素材、manifest 与采集/渲染脚本。
- [前一版营销素材](marketing/2026-10-18/README.txt)：历史成品与来源证据。

## 历史方案与评审

- [原生接入验证](design/native-2026-10-06/VALIDATION.md)
- [手机页面方案](design/mobile-2026-10-05/README.md)及[验证记录](design/mobile-2026-10-05/verification.md)
- [卡通风格调整](design/cartoon-refresh-2026-10-05/README.md)
- [早期产品与实施方案](plans/)
- [历史实现交接](../RELEASE-REVIEW.md)与[历史独立评审](../INDEPENDENT-REVIEW.md)

旧脚本中依赖已移除页面、角色按钮或联网入口的浏览器回归已清理；历史报告仍保留原命令以解释当时证据。当前验收使用游戏目录 `pnpm build && pnpm test:browser`，新截图与报告写入 `outputs/browser/`，不会改写这些历史记录。`scripts/competition-playtest.mjs` 保留历史联机专项及依赖登记，不能作为当前离线页面的浏览器门禁。
