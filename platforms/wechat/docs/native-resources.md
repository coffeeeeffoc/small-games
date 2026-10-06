# 原生包内资源与 WASM 能力边界

`../native-resources.mjs` 导出 `attachNativeResources(sdk)` 与 `attachWechatNativeResources(sdk)`。在平台 SDK normalization 完成后调用，返回保留原 SDK 接收者、可枚举资源方法的 Proxy。

```js
const sdk = attachNativeResources(normalizedSdk);
const binary = await sdk.readFile('models/world.glb'); // ArrayBuffer
const text = await sdk.readFile('levels/world.json', 'utf8'); // string
const { instance } = await sdk.instantiateWasm('rapier/rapier.wasm', imports);
```

仅支持包内路径，禁止 URL、路径穿越和空路径段。二进制结果必须为 ArrayBuffer，文本必须为 string；错误类型不会转换成假资源。文件读取异常原样传播或 READ_FAILED，缺少方法为 UNAVAILABLE。异步回调读取超过 15 秒为 TIMEOUT。WASM 编译和链接错误传播，缺少引擎为 UNAVAILABLE，不切换到假物理/DOM/网络资源。

微信使用官方 `WXWebAssembly.instantiate(path, imports)`，其返回 Instance 本体，桥只包成 `{instance}`，不虚构 module。namespace 缺失时仅尝试真实标准 WebAssembly；已存在 namespace 的编译或链接失败不会切换引擎。

依据：[腾讯小游戏官方 WASM 类型](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.wasm.d.ts)、[官方文件接口类型](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts)、[小游戏文件读取](https://developers.weixin.qq.com/minigame/dev/api/file/FileSystemManager.readFile.html)。官方 Canvas 类型列出 webgl2，但具体设备创建结果仍须验证。

WebGL2 由游戏对真实宿主 Canvas 调用 `getContext('webgl2')` 探测，失败必须显示不可用；本资源桥不创建或伪造 Canvas。离屏纹理另用真实 createCanvas。广告、登录、分享及密钥不在此桥范围，未配置能力不得假成功，服务端 secret 不进入客户端。

## 已执行验证与外部缺口

Node 24.21.0 契约测试执行真实最小 WASM 字节，检查原生方法接收者、UTF8/二进制结果、坏字节拒绝、缺 SDK/引擎显式失败、路径校验。平台 callback/namespace 接口由受控宿主替身验证调用契约，这不是平台验收。测试命令（仓库根）：

```sh
node --test platforms/wechat/tests/native-resources.test.mjs
```

尚未运行官方开发者工具、真实手机、平台审核；需实测完整 Rapier 二进制、原生 WebGL2 渲染、包内 GLB/JSON/WASM 文件路径和资源打包可见性。产物完整性通过不等于这些原生能力验收。

## 远程素材

`attachNativeResources(sdk, {allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 15000})` 另暴露 `readRemoteAsset(url, type='arraybuffer')`。仅接受无凭证、无端口的 HTTPS 域名 URL，按精确 hostname 白名单校验；没配 host 为 CONFIG_REQUIRED，未允许 host 为 HOST_BLOCKED。还需用户在平台后台配置 request 合法域名；本地白名单不替代平台授权。

使用[官方 request 接口](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts)发 GET，dataType 为 string 防止自动 JSON.parse，responseType 为 arraybuffer/text，成功回调仅接受 statusCode 2xx 与严格数据类型。未调用 fetch；原生异常、HTTP 错误、平台域名拒绝均明确失败。超时终止 Promise，若任务有 abort 则保持 receiver 调用，迟到回调不会改成功状态。WASM 留包内，只有公开模型/JSON 可使用此入口；不传 secret 或用户认证头。

已测网络 SDK 契约及超时/迟到 callback，未实际运行平台网络请求。URL/CDN 内容、完整性与平台域名白名单尚须构建器/用户配置和官方工具实测。

## 包体限制核查（2026-10-06）

[微信官方分包文档](https://developers.weixin.qq.com/minigame/dev/guide/subpackages.html)本次抓取失败，常见4M主包/30M总包口径仍需由官方工具或可访问官方页最终确认；不得把相邻小程序限制套入小游戏。

超限产物只能作为私有诊断结果记录为 built-with-limits-blocked，不能称为可导入/已接入；公开远程素材方案需明确配置assetBase及真实平台合法域名，不以网络替身补成功。

## 原生分包加载

资源桥另提供 `await sdk.loadSubpackage('photos1')`，只接受配置 name（不是路径），Promise 仅在真实SDK success 后 resolve 原回调结果；缺方法为UNAVAILABLE、失败为SUBPACKAGE_FAILED并保留原cause、超时为TIMEOUT。沿用 requestTimeoutMs 上限，超时仅在实际返回对象具有abort方法时调用，迟到回调不能改结果；不创造task、不假加载成功。

[官方配置/接口](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts)：wx.loadSubpackage({name,success,fail,complete}) → LoadSubpackageTask，SDK>=2.1.0；name 或 root。腾讯官方小游戏类型确认此签名；配置页面本次网络403，小写字段沿仓库已有工程，须官方工具确认。

```json
{
  "subpackages": [{ "name": "photos1", "root": "subpackages/photos1/" }]
}
```

分包目录配真实 `game.js` 入口，只做模块导出即可，不能再次启动游戏或主页；加载成功后才用真实包内图片路径，所有素材保持原bytes并校验SHA256。普通资源分包不必作为独立分包启动。照片应按完整文件分组控制各包大小，不拆图片二进制；B站每分包4M限制必须独立检查。原生开发工具导入、上传、图片可见性和真机加载尚未运行。
