# 参考资料与事实边界

查询日期：2026-09-27。平台、引擎与服务规则可能更新，实际构建和发行时应再次核对所用版本。

本需求中的关卡、数量、数值、操作改动、预算和里程碑均为原创设计建议；来源只支撑明确标注的外部事实。未对参考游戏进行全流程实机测试或源码审计。

## S1 · 参考游戏官方页面

支持的事实：玩家负责火控、飞机自动盘旋、武器/热量/弹药/弹着延迟、任务类型、公开按键与移动端操作、横屏浏览器平台。页面只标 HTML5，不足以确认具体引擎。F/G/H/C 的具体技能效果未在该说明中展开。

```text
https://www.crazygames.com/game/spectre-command--ac130-simulator
```

## S2 · Cocos 多平台发布

支持的事实：3.8 LTS 文档列出 Web Desktop、Web Mobile、微信、抖音及其他发布目标。它不代表本项目已在这些平台通过验收。

```text
https://docs.cocos.com/creator/3.8/manual/en/editor/publish/
```

## S3 · Cocos 微信小游戏发布

支持的事实：小游戏运行环境不等同浏览器；引擎适配、构建、资源管理和平台 SDK 是不同工作。涉及包体上限和模式限制时需要再查平台最新文档，不机械套用历史数字。

```text
https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html
```

## S4 · CrazyGames 技术要求

支持的事实：首轮加载与移动首页资格、Basic/Full SDK 区别、Basic Launch 广告限制、输入/安全区/音频生命周期要求。没有把最大总包体当作良好产品的目标。

```text
https://docs.crazygames.com/requirements/technical/
```

## S5 · Cocos glTF 资产导入

支持的事实：支持 glTF 导入及向 Prefab/Mesh/Material/Animation 等资源转换；不保证任意第三方导出扩展和压缩配置直接兼容。

```text
https://docs.cocos.com/creator/3.8/manual/en/asset/model/glTF.html
```

## S6 · Three.js GLTFLoader

支持的事实：glTF 加载与 Draco、KTX2、Meshopt 等相应配置入口。是否选用取决于实际引擎和部署版本，不强制所有压缩格式同时使用。

```text
https://threejs.org/docs/pages/GLTFLoader.html
```

## S7 · Kenney 资产授权说明

支持的事实：其 asset pages 的游戏资源为 CC0，允许商用；品牌标识不应被用来暗示官方关系。

```text
https://kenney.nl/support
```

## S8 · Poly Haven 资产授权说明

支持的事实：其资产为 CC0；网站其他内容、标识等并非因此同等开放。仍记录具体资产和授权凭证。

```text
https://polyhaven.com/license
```

## S9 · Hyper3D / Rodin 官方文档

支持的事实：从图像/文本生成三维资产的功能。不据此保证自动生成结果满足低模、动画、商用或引擎验收要求。

```text
https://docs.hyper3d.ai/en
```

## S10 · Cocos 支付宝小游戏发布

支持的事实：存在独立的支付宝小游戏发布路径，具体环境与版本以该平台文档为准。

```text
https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-alipay-mini-game.html
```

## S11 · Cocos 命令行构建

支持的事实：CLI 构建、配置导出、退出码说明与 GUI 环境要求。路径和参数需按实际版本与机器确认。

```text
https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html
```

## S12 · OpenAI / Codex 提示与验证示例

支持的事实：为任务提供上下文、约束、截图未表达的交互行为、可复现步骤与验证要求；支持按里程碑迭代的工作方式。没有据此承诺一次生成成品。

```text
https://developers.openai.com/codex/prompting/
https://learn.chatgpt.com/docs/prompting
```
