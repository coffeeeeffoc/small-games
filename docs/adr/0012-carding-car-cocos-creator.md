# 卡丁车采用 Cocos Creator 与 TypeScript

用户在明确微信／B站原生小游戏优先后，选择以 Cocos Creator + TypeScript 替代原先偏好的 React Three Fiber／Drei／Rapier 组合，使用已有微信发布流程与 B站适配插件，并从同一工程导出 H5。相比自行适配浏览器渲染、模型加载和 WASM 物理，这将兼容验证集中在现成渠道流程上，代价是引入 Creator 工具链；不代表具体引擎版本、插件和真机性能已经验证。原有街机物理目标、程序化赛道、模块职责、KartConfig、简单独立碰撞体及 Rodin 资产流程保持。
