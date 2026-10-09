# 空格配色调整验证

2026-10-09；Node 24.21.0、pnpm 12.6.0、Chromium 151.0.7922.173。

空格使用深墨绿色，积木仍保持原有亮色与立体受光面。局部效果图见 [board-concept.svg](board-concept.svg)，参数见 [design.md](design.md)。

## 实际检查

- 游戏现有规则测试：40 项通过。
- 生产 H5 手机触屏回归：27 项通过，0 页面异常；覆盖主页、选关、游玩、合法／非法拖放、取消、多点触控、暂停、结算、恢复、全屏、方向变化及 320×568／360×640／390×844 视口。完整结果见 [browser-verification.json](browser-verification.json)。本次运行生成 30 张截图，局部配色记录只归档其中两张预览截图，旧设计档案保持其历史版本。
- 普通／高对比模式：390×844、320×568 四组检查通过，读取实际 CSS 计算色并截图。五种积木基础色与空格的对比度分别为普通模式 3.60–6.12:1、高对比模式 3.80–5.13:1；这是基础色计算，不包括高光与阴影。结果见 [contrast-check.json](contrast-check.json)。
- 原生 Canvas：重新构建微信 preview，使用浏览器触屏开启关卡、暂停、切换高对比色和恢复；画布像素与对应空格配色一致，0 页面异常。结果见 [native-contrast-check.json](native-contrast-check.json)。
- `git diff --check` 通过。

## 实际截图

| 状态 | 截图 |
| --- | --- |
| 普通配色 | [390×844](game-normal-390x844.png)、[320×568](game-normal-320x568.png) |
| 高对比配色 | [390×844](game-high-contrast-390x844.png)、[320×568](game-high-contrast-320x568.png) |
| 合法／非法预览 | [合法](game-valid-preview-390x844.png)、[非法](game-invalid-preview-390x844.png) |
| 原生画布 | [普通](native-game-normal-390x844.png)、[高对比](native-game-high-contrast-390x844.png) |

人工检查上述截图，确认绿色／黄绿色积木与空格具有明显明暗区别，预览仍有独立轮廓，棋盘和候选在小屏完整显示。

上述手机检查为桌面 Chromium 触屏模拟，原生检查使用 mock 微信 SDK，未进行手机真机或官方平台验收。准确候选的 base/head 校验及远端 CI/Pages 状态由提交交付流程另行记录，不能从本记录推断线上发布成功。
