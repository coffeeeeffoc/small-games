# 原生包内资源与 WASM 能力边界

`../native-resources.mjs` 导出 `attachNativeResources(sdk)` 与 `attachBilibiliNativeResources(sdk)`。在平台 SDK normalization 完成后调用，返回保留原 SDK 接收者、可枚举资源方法的 Proxy。

```js
const sdk = attachNativeResources(normalizedSdk);
const binary = await sdk.readFile('models/world.glb'); // ArrayBuffer
const text = await sdk.readFile('levels/world.json', 'utf8'); // string
const { instance } = await sdk.instantiateWasm('rapier/rapier.wasm', imports);
```

仅支持包内路径，禁止 URL、路径穿越和空路径段。二进制结果必须为 ArrayBuffer，文本必须为 string；错误类型不会转换成假资源。文件读取异常原样传播或 READ_FAILED，缺少方法为 UNAVAILABLE。异步回调读取超过 15 秒为 TIMEOUT。WASM 编译和链接错误传播，缺少引擎为 UNAVAILABLE，不切换到假物理/DOM/网络资源。

B站 `bl.getFileSystemManager().readFile` 的包内文件读取有官方签名。未取得适用于独立原生 JS 小游戏的专属 WASM namespace 签名；只在宿主存在真实标准 `WebAssembly.instantiate` 时编译真实文件字节，否则明确 UNAVAILABLE。官方 Cocos 转换流程不能当成独立 JS 工程的已验证 WASM 桥。

依据：[官方 readFile](https://miniapp.bilibili.com/small-game-doc/api/file/FileSystemManager/FileSystemManager.readFile)、[官方 WebGL2](https://miniapp.bilibili.com/small-game-doc/engine/webGL2)、[引擎通用说明](https://miniapp.bilibili.com/small-game-doc/engine/common)。WebGL2 原生 Android/iOS 需要高性能模式，game.json 应按官方配置设置 androidHighPerformance、androidHighPerformance+、iOSHighPerformance、iOSHighPerformance+。实际上下文仍需探测。

WebGL2 由游戏对真实宿主 Canvas 调用 `getContext('webgl2')` 探测，失败必须显示不可用；本资源桥不创建或伪造 Canvas。离屏纹理另用真实 createCanvas。广告、登录、分享及密钥不在此桥范围，未配置能力不得假成功，服务端 secret 不进入客户端。

## 已执行验证与外部缺口

Node 24.21.0 契约测试执行真实最小 WASM 字节，检查原生方法接收者、UTF8/二进制结果、坏字节拒绝、缺 SDK/引擎显式失败、路径校验。平台 callback/namespace 接口由受控宿主替身验证调用契约，这不是平台验收。测试命令（仓库根）：

```sh
node --test platforms/bilibili/tests/native-resources.test.mjs
```

尚未运行官方开发者工具、真实手机、平台审核；需实测完整 Rapier 二进制、原生 WebGL2 渲染、包内 GLB/JSON/WASM 文件路径和资源打包可见性。产物完整性通过不等于这些原生能力验收。

## 远程素材

`attachNativeResources(sdk, {allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 15000})` 另暴露 `readRemoteAsset(url, type='arraybuffer')`。仅接受无凭证、无端口的 HTTPS 域名 URL，按精确 hostname 白名单校验；没配 host 为 CONFIG_REQUIRED，未允许 host 为 HOST_BLOCKED。还需用户在平台后台配置 request 合法域名；本地白名单不替代平台授权。

使用[官方 request 接口](https://miniapp.bilibili.com/small-game-doc/api/network/request/)发 GET，dataType 为 string 防止自动 JSON.parse，responseType 为 arraybuffer/text，成功回调仅接受 statusCode 2xx 与严格数据类型。未调用 fetch；原生异常、HTTP 错误、平台域名拒绝均明确失败。超时终止 Promise，若任务有 abort 则保持 receiver 调用，迟到回调不会改成功状态。WASM 留包内，只有公开模型/JSON 可使用此入口；不传 secret 或用户认证头。

已测网络 SDK 契约及超时/迟到 callback，未实际运行平台网络请求。URL/CDN 内容、完整性与平台域名白名单尚须构建器/用户配置和官方工具实测。

## 包体限制核查（2026-10-06）

官方普通小游戏[分包规范](https://miniapp.bilibili.com/small-game-doc/ability/subpackage)：主包及单分包均不超过4M，总包不超过30M。试玩专属15M/不支持网络不能套到本次普通小游戏。

超限产物只能作为私有诊断结果记录为 built-with-limits-blocked，不能称为可导入/已接入；公开远程素材方案需明确配置assetBase及真实平台合法域名，不以网络替身补成功。

## 原生分包加载

资源桥另提供 `await sdk.loadSubpackage('photos1')`，只接受配置 name（不是路径），Promise 仅在真实SDK success 后 resolve 原回调结果；缺方法为UNAVAILABLE、失败为SUBPACKAGE_FAILED并保留原cause、超时为TIMEOUT。沿用 requestTimeoutMs 上限，超时仅在实际返回对象具有abort方法时调用，迟到回调不能改结果；不创造task、不假加载成功。

[官方配置/接口](https://miniapp.bilibili.com/small-game-doc/ability/subpackage)：bl.loadSubpackage({name,success,fail,complete}) → LoadSubpackageTask；name 或 root。官方参数表误把 name 类型写成function，指南示例明确 string；桥按实际 string name 调用。回调原样返回，错误保留errMsg。

```json
{
  "subpackages": [{ "name": "photos1", "root": "subpackages/photos1/" }]
}
```

分包目录配真实 `game.js` 入口，只做模块导出即可，不能再次启动游戏或主页；加载成功后才用真实包内图片路径，所有素材保持原bytes并校验SHA256。普通资源分包不必作为独立分包启动。照片应按完整文件分组控制各包大小，不拆图片二进制；B站每分包4M限制必须独立检查。原生开发工具导入、上传、图片可见性和真机加载尚未运行。
