# Codex 项目级多角色

主会话的协调和单写入者规则见根目录 `AGENTS.md`。角色定义保存在 `.codex/agents/repo_explorer.toml`、`.codex/agents/implementer.toml` 和 `.codex/agents/reviewer.toml`，由支持独立角色文件的 Codex 从项目目录发现。

## 配置与权限

采用 [OpenAI 官方自定义角色格式](https://learn.chatgpt.com/docs/agent-configuration/subagents)：每个 TOML 文件包含 `name`、`description` 和 `developer_instructions`。角色名以 `name` 为准，文件名与之保持一致。

排查与复核配置 `sandbox_mode = "read-only"`；实现角色继承父会话权限。所有角色继承模型及推理强度，不另行配置密钥、MCP、审批或发布权限。父会话的实时权限覆盖可能优先于角色的沙箱默认值，所以角色指令同时要求只读行为；单写入者是协作约定，不是文件锁。

仓库原有 `.codex/config.toml` 忽略规则继续保留，机器专属配置不进入版本控制。当前格式不需要在该文件重复登记角色。若运行环境禁用子代理、项目未受信任或工具接口不支持选择角色，报告实际限制，保留原有权限设置。

## 调用方法

在以本仓库为工作目录的新 Codex 会话中，用自然语言指定角色与范围即可。例如：

- 只读排查：`请调用 repo_explorer，只读解释 docs/operations/incremental-publication.md 如何规定测试范围，给出行号；不要运行测试或修改文件。`
- 实现：`请调用 implementer，作为当前唯一写入者，仅修改 <明确路径> 完成 <目标>；按现有增量规则验证后交还写入权，主会话负责整合。`
- 复核：`请调用 reviewer，只读检查 <base SHA> 到 <head SHA> 的改动，列出可行动的问题与缺失的验证证据；不要修复或运行会写入产物的测试。`

由主会话选择实际工具并等待、检查和整合结果。支持 `spawn_agent` 的 `agent_type` 参数时使用对应角色名；若客户端仅提供无角色参数的委派工具，不能把普通子代理调用当作原生角色识别证据，应明确说明，并将目标角色文件中的指令传入委派任务。简单改动可直接由主会话完成。

角色文件变化后用新会话重新验证，不假定已经打开的会话会热加载。CLI 可从仓库根目录运行 `codex`；桌面端在本项目打开新会话。

## 本次验证

2026-10-11，Windows / PowerShell，工作目录为本仓库：

- 桌面版 `26.1007.2314.0`，实际内核 `codex-cli 0.162.0-alpha.17.2`。新进程的 `--strict-config` 配置加载通过，`config/read` 确认项目 `.codex/` 配置层；实际 `spawn_agent` 工具识别三个角色及各自描述。
- PATH 中另有 CLI `0.153.2`，其实际工具也识别三个角色，并完成一次 `repo_explorer` 的调用、等待和关闭。该次进程在收尾阶段被终止，不能把退出码视为成功；桌面内核的完整复测退出码为 `0`。
- 使用桌面内核的 `exec --ephemeral --sandbox read-only --json` 启动只读验证，原生调用 `repo_explorer`，完成等待并关闭子角色。该次只创建了一个排查子角色，没有调用实现或复核角色；携带完整历史的首次派发未创建子角色，改用独立任务上下文后成功。
- 演示问题：增量发布文档如何限定测试范围，未知范围如何处理？回答引用 `docs/operations/incremental-publication.md:21`：按改动项目及真实依赖消费者选择检查，无法分类时明确范围后重试，不静默全量或跳过。演示未修改仓库，也未运行游戏测试。
- 三份 TOML 解析、角色名与必需字段、只读默认值、增量规则引用检查通过；根 `AGENTS.md` 原有文本完整保留，全局配置 SHA-256 未改变。`git diff --check` 和两份 Markdown 的定向 Prettier 检查通过。

当前聊天的 `multi_agent_v1` 接口没有角色选择参数，因此原生角色验证使用上述新内核进程完成。现有可选 Hyper3D MCP 的 OAuth 失效、个别全局技能格式错误及临时会话的 hook 历史定位警告不属于本次角色配置，未修改；它们没有阻断桌面内核的只读演示。未执行 `implementer` 或 `reviewer` 的实际任务，也未尝试写文件来测试沙箱强制性。

发布分类在 `scripts/publication-scopes.mjs` 中按三份角色文件的精确路径及已审阅内容摘要登记，无游戏运行时消费者。定向测试覆盖角色识别、权限及 MCP/hook 配置混入、删除和未知相邻路径的拒绝；修改角色内容时须重新审阅并同步摘要。发布仍按原有流程合并最新 `dev`、验证最终候选 SHA 并运行正常 hooks，不因角色配置运行全游戏回归。
