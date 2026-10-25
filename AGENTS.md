## Git 提交约定

- 后续所有 Git 提交的提交说明统一使用中文。

## Agent skills

涉及 TypeSafe API、语义分类、评分或判断流程时，使用 `typesafe-ai` 技能。

### 游戏 UI 与手感技能

- UI 评审、HUD 与游戏菜单/触屏布局使用 `game-ui-ux`。
- 已有玩法的命中、爆炸、得分等反馈优化使用 `game-feel`。
- 普通逻辑修复不要求加载这两项；按相关任务选择，参考 [项目技能说明](.agents/skills/README.md)。
- 本仓库规则与已认可效果图优先；Unity/Godot 示例按项目技术栈理解，技能示例本身不构成迁移引擎的理由；Cocos 选型遵循下方游戏规范。视觉震屏与停顿不得直接改变权威联机模拟、计时或覆盖暂停状态。

### Issue tracker

Issues are tracked in this repository's GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels without overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

### 项目级多角色协作

- 主会话负责拆分任务、分配范围、整合结果及最终交付；按任务需要调用 `.codex/agents/` 中的 `repo_explorer`（排查）、`implementer`（实现）、`reviewer`（复核），小改动可由主会话直接完成，无需启动全套角色。
- 默认单写入者：主会话或一个 `implementer` 持有写入权；派发时明确目标、可写路径和验收要求，交还写入权后再由主会话整合。其他角色只读，子角色将后续工作交回主会话协调。
- 排查与复核默认只读；会生成文件、更新快照、安装依赖或改动服务状态的测试由当前写入者串行执行。测试范围及发布候选验证继续遵循 `docs/operations/incremental-publication.md`，不因多角色重复全量检查。
- 角色补充现有规则，不替代各级 `AGENTS.md`、权限、审批、hooks 或密钥管理约定。调用示例、版本兼容与只读边界见 [Codex 多角色使用说明](docs/agents/codex-multi-agent.md)。

## 游戏开发、维护与上架：必读入口

- 新建、修改、评审、重构任何小游戏，先读 [小游戏通用开发与改造规范](docs/game-development.md)，按其中的现状检查、渐进补齐、早期八款例外和验收流程执行；不能因用户本次未重复要求而忽略已有缺口。
- 新建或修改游戏、完成玩法闭环、准备交付或上架时，必须读 [上架资料规范](docs/game-publishing.md)，主动核对该游戏的 `publishing/STATUS.md` 和八类实际资料，补齐能提供的内容；该要求也适用于早期八款。
- 变更开发入口或构建时读 [开发者模式约定](docs/game-dev-mode.md)；新增／迁移游戏时另读 [独立游戏接入](docs/standalone-games.md)。
- 设计或接入奖励、广告、渠道打包时，读 [通用广告接入与避坑](docs/operations/taptap-rewarded-ads.md)及 [游戏包构建](docs/operations/game-builds.md)，复用现有端口并核对实际支持范围。
- 提交、推送、通过 GitHub API 更新分支或发布前，读 [准确候选版本的增量发布验证](docs/operations/incremental-publication.md)，保留 hooks、非强制推送及最终 base/head 证据；验证实际消费者，远端推进后重新合并复测。
- 通用规则只更新上述对应正文；根文件只维护入口，单游戏只记录差异、已确认例外和证据，不复制整套规范。历史任务与取舍见 [梳理记录](docs/agents/game-requirements-sources.md)。
