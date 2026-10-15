# 围捕小队广告公共层与 TapTap H5 接入

沿用现有“玩家点击看广告 → 完整观看 → 求解当前位置”的流程，不增加页面、广告类型或奖励系统。游戏资料和广告开通均在审核中；先完成代码和本地包，真实配置生效后再验收。

## 接入边界

1. 游戏核心 `games/local/cops-robbers/src/ads.js` 接收 RewardOpportunity，统一处理结果、取消、45 秒超时和未结束请求锁。它不读取 DOM、平台 SDK、广告位或修改游戏奖励。
2. `platforms/h5/platform-ads.js` 提供可复用 AdProvider。入口必须显式选择 `taptap-h5 / wechat / douyin / bilibili`；分别使用 `tap / wx / tt / bl`，不会按哪个全局对象存在来猜平台。只有 `isEnded === true` 返回 completed。
3. 游戏的 `src/ad-host.js` 组合宿主提供方、公共平台适配或原有 Web 模拟广告。`main.js` 管理输入和局面有效性，完成观看且仍处于原局面时才启动提示求解。

TapTap H5 使用 DOM 和平台注入的 tap 广告接口；`platforms/taptap` 的原生 Canvas 工程、Cocos 转换与 Dirichlet 接入属于另一种产品形态。原生 Tap 的广告支持声明不能因 H5 适配而改为已支持。微信、抖音和 B 站适配只是 SDK 边界复用，也不意味着本游戏已具备各平台的原生发布包。

## 发布与验收

普通 build 保留 Web 的模拟广告。`package:taptap` 显式构建 host/taptap-h5 配置；缺少广告位、宿主 API、填充或权限时返回不可用，保留免费行棋、撤销、重试和存档。只有公开广告位进入前端，账号凭证由官方 CLI 本地登录保存。

`deploy:taptap` 串行执行单元检查、ZIP 校验、准确解压包浏览器检查，再调用官方 CLI 上传 H5 并创建版本。`-PackageOnly` 不调用平台；`-DryRun` 仅预演。上传不自动绑定主包、撤回当前审核、重新提审或上线。保存 ZIP hash、幂等键和平台回执，失败重试同一个 ZIP。

覆盖不同 SDK 共存、缺配置、严格完成回调、提前关闭、异常、超时、重复请求、退出和后台、晚到回调、SDK 单例销毁，以及 320/390/844 像素触屏。保留原有 Web/Shell/iframe 与开发模式语义回归。SDK fixture 不代表真实 TapTap WebView、广告库存及正式上线验收。
