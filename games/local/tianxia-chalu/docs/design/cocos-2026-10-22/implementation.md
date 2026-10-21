# 天下岔路 Cocos 百战实施计划

目标：完成已确认13项需求与补充规则，交付100地图的可玩Cocos版本，经准确候选验证提交推送dev。

架构：复用游戏无DOM规则模块及services/tianxia-server；真实Cocos场景消费规则快照并实现触屏。内容、规则、持久化奖励、表现与平台能力分别留在现有游戏目录中，不引入中央框架。

技术：Cocos Creator 3.8.8，TypeScript/ES modules，Node 24，现有pnpm/Playwright/GameHost契约。

## 依赖顺序与写入范围

1. 产品与视觉：本目录design.md、prompts.md、concept-*.png；实际截图保存actual/。生成图后进入运行代码阶段。
2. 内容与规则：src/content/*、src/core/*，保留engine/levels导出。100关显式目录、校验、seed出生、路网军令/屯兵、交战、将领、局部效果、排名；先补小规模行为测试，串行运行游戏规则测试。
3. 持久化与奖励：storage.mjs及新的奖励纯模块；旧进度迁移、图鉴、卡装备/消耗/期限/结算幂等。测试完整广告状态机与故障保留基础卡。
4. Cocos工程：assets场景、脚本、meta，settings与project配置，build.mjs、package.json、构建信息。复用仓库现有Creator发现/校验工具。先构建一个真实运行页面，再完成表现。
5. 页面与声音：main.mjs/index.html/style.css、Cocos脚本，现有山水资源，音频模块；主页、章节、准备、战场、军情、图鉴、军备、设置/帮助/暂停、结算；按效果图实现。
6. 服务与入口：remote.mjs、services/tianxia-server调用方及测试；注册/构建/发布范围只改真实需要的精确路径；SmallGamesDev与全屏复用公共源。
7. 验收：核心/存档/广告/服务测试，Creator构建后串行生产触屏测试，100地图多seed报告、视觉对照，独立与iframe、开发开关、生命周期与结算。
8. 复核与发布：只读reviewer检查差异，主会话修复；按incremental-publication.md提交准确候选、同步远端、增量验证、push dev，保存最终base/head和部署结果。

## 执行约束

- 主会话唯一写入；委派实现时明确交出写入权，其他角色只读。
- 不修改未跟踪旧game-office残留，不清理无关文件。
- Creator、浏览器、重测试串行执行；不伪造引擎声明或build-info。
- 按完成行为验证，不把快速开发结算/AI模拟当作真实触屏通关或手机真机证据。
- 不以100个seed冒充100地图，不自动接受新截图来绕过入口行为断言。
