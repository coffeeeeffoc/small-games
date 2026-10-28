# small-games 项目级游戏技能

仅安装 `game-feel` 与 `game-ui-ux`，随 Git 同步到 `.agents/skills/`。
未安装 `threejs-game-ui-designer`、其他关联技能、执行脚本或服务。

## 来源与审阅

- 上游：[gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)。
- 固定 commit：`0a70cfc64672d512c5b5b6006b5dcb5cf90dbdbd`；[固定版本](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/0a70cfc64672d512c5b5b6006b5dcb5cf90dbdbd/skills/disciplines)。
- 只复制两个目录的 `SKILL.md` 和各自一份 `references/*.md`。
- Apache-2.0：根许可证原文在代码块内逐字节保留，归属声明保留为 [LICENSE.md](LICENSE.md) 与 [NOTICE.md](NOTICE.md)；上游 NOTICE 中的 LICENSE 在这里对应 LICENSE.md。
- 审阅了上述四份正文及 LICENSE/NOTICE：没有脚本、安装命令、付费服务或必须下载的外部资源。代码块为示例，不能直接执行。Godot/Unity 版本只是上游示例标签，不表示本项目依赖或已验证这些引擎版本。
- 两份 `SKILL.md` 初次安装时保留原 frontmatter 和正文，并增加项目覆盖说明。2026-10-28 更新两项技能的项目优先级说明，并补齐 `game-ui-ux` 的 styling 指引，落实新样式、素材和逐页完整视觉验收，取消不得改变既有风格的限制；两份参考文档仍仅按仓库 Prettier 格式化。上游相关技能名称为可选知识提示，本次未安装，不能当作必需引用。`love2d-core` 的 state-stack 引用同样不是本地文件。
- 以下为原始上游文件 SHA-256，方便以后固定版本对比；本地 SKILL 因增加覆盖说明而不同。

| 原始上游文件                                                  | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `skills/disciplines/game-feel/SKILL.md`                       | `68fc818ad939151be2db9e358e4295a71830c19d61f3aff849f1599307f39f9d` |
| `skills/disciplines/game-feel/references/feedback-recipes.md` | `c1d0c4d9480bf4cd729ca99f2b36ebc1f3f264a873b408f2145898841e5d6685` |
| `skills/disciplines/game-ui-ux/SKILL.md`                      | `8a094c84a377503aa8f4c40df676d1c6b6fc07d36ff95554ce06467f1614397e` |
| `skills/disciplines/game-ui-ux/references/layout-and-flow.md` | `000d944db77155ebf97fde035a3d4fbe69ef0ae348e9dbcaff48c5ea134d7d69` |

## 调用与项目适配

- UI 评审、HUD、主页/暂停/结算布局与触屏可用性：使用 `$game-ui-ux`，读取 [SKILL.md](game-ui-ux/SKILL.md)，按需读取其布局参考。
- 已有玩法的命中、爆炸、得分等反馈优化：使用 `$game-feel`，读取 [SKILL.md](game-feel/SKILL.md)，按需读取其反馈参考。
- 普通逻辑修复、数据校验、存档和纯规则测试：不要求加载这两项；只有任务实际涉及 UI 或反馈时才加载相应项，不无差别加载整套技能。
- 遵守 [AGENTS.md](../../AGENTS.md) 与[通用开发规范](../../docs/game-development.md)，以用户最新要求和本次认可效果图确定视觉实现；旧游戏文档、原型标准和上游通用偏好不能阻止样式改版。按任务范围修改美术和呈现层，玩法、引擎与架构遵循实际授权。
- 将 Unity/Godot 的节点、信号、tween 等概念转换为现有 TS/JS、DOM/CSS、Canvas 或游戏现有引擎 API；技能示例本身不授权迁移引擎或新增依赖；实际选型按通用开发规范及用户确认的方案执行。Canvas 逻辑坐标可保留，但须正确做视口与触控映射；并非禁用所有绝对坐标。
- 保留移动优先、约 44 CSS px 有效热区、安全区、触控取消/失焦、多点触控、暂停恢复、前后台生命周期与退出清理；继续使用项目的页面切换、全屏和开发模式契约。键盘/手柄是按实际支持范围补充，不替代触屏。
- 视觉震屏和 hit-stop 只能作用于呈现层，不直接改变权威联机模拟、碰撞、游戏计时、网络或输入时序。不能照搬全局 time-scale 示例；回调不能覆盖用户暂停或生命周期暂停，也不能恢复已销毁游戏。保留减弱动态、音效与震动设置并控制移动端开销。

## 发现与验证边界

依据 [Codex 官方技能文档](https://learn.chatgpt.com/docs/build-skills)，仓库技能使用 `.agents/skills/<name>/SKILL.md`；从工作目录向仓库根扫描。克隆或拉取本提交后，从该仓库启动/刷新 Codex 技能列表。无需全局安装，也不修改用户配置。

验证分三层：文件/frontmatter/引用/许可/版本检查；执行环境的真实技能发现；加载相应技能后的任务调用。发现成功不等于所有客户端都已刷新，调用成功也不等于游戏体验或真机验收通过。具体记录见 [安装验证](../../docs/agents/game-skills-validation.md)。
