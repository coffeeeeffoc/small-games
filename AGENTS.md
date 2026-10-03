## Agent skills

涉及 TypeSafe API、语义分类、评分或判断流程时，使用 `typesafe-ai` 技能。

### Issue tracker

Issues are tracked in this repository's GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels without overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## 游戏界面图标

- 暂停图标必须是两根等高、等宽、平行且分离的实心竖条。优先复用已有图标库，或用 SVG、CSS、Canvas 绘制；不得用 `Ⅱ`、`II`、`||`、`π`、`⏸` 等字体字符代替，避免字体回退后变成罗马数字或近似 π。
- 暂停按钮保留明确的“暂停”无障碍名称（Web 使用 `aria-label="暂停"`）。交付前在实际运行画面中检查图标的形状、间距和缩放效果，不能只检查源码中的字符。
