# 原生包内资源与 WASM 能力边界

`../native-resources.mjs` 导出 `attachNativeResources(sdk)` 与 `attachAlipayNativeResources(sdk)`。在平台 SDK normalization 完成后调用，返回保留原 SDK 接收者、可枚举资源方法的 Proxy。

```js
const sdk = attachNativeResources(normalizedSdk);
const binary = await sdk.readFile('models/world.glb'); // ArrayBuffer
const text = await sdk.readFile('levels/world.json', 'utf8'); // string
const { instance } = await sdk.instantiateWasm('rapier/rapier.wasm', imports);
```

仅支持包内路径，禁止 URL、路径穿越和空路径段。二进制结果必须为 ArrayBuffer，文本必须为 string；错误类型不会转换成假资源。文件读取异常原样传播或 READ_FAILED，缺少方法为 UNAVAILABLE。异步回调读取超过 15 秒为 TIMEOUT。WASM 编译和链接错误传播，缺少引擎为 UNAVAILABLE，不切换到假物理/DOM/网络资源。

支付宝使用 `my.getFileSystemManager().readFile({filePath, encoding?, success({data}), fail({error,errorMessage})})`。官方代码包路径要求以 `/` 开头，桥统一补根路径；不传 encoding 才返回真实 ArrayBuffer。可在 normalizeAlipaySdk(raw) 后附加本桥，避免 normalizer 丢附加资源能力。

未取得支付宝小游戏通用专属 WASM namespace 签名；不使用小程序 Worker 的 MYWebAssembly API。本桥仅在宿主存在真实标准 `WebAssembly.instantiate` 时读取真实包内字节进行编译，缺失即 UNAVAILABLE。支付宝小游戏真机 WebGL2/标准 WASM 支持未确认，不能宣称 Travel 已平台验收。

依据：[小游戏 getFileSystemManager](https://opendocs.alipay.com/mini-game/08v7q3)、[小游戏 readFile](https://opendocs.alipay.com/mini-game/08urvh)、[代码包文件](https://opendocs.alipay.com/mini/03dt4s)、[工程 assetsInclude](https://opendocs.alipay.com/mini/03dbc3)。产物须明确 assetsInclude 覆盖 `.wasm`、`.glb`、JSON 和真实音频素材。

WebGL2 由游戏对真实宿主 Canvas 调用 `getContext('webgl2')` 探测，失败必须显示不可用；本资源桥不创建或伪造 Canvas。离屏纹理另用真实 createCanvas。广告、登录、分享及密钥不在此桥范围，未配置能力不得假成功，服务端 secret 不进入客户端。

## 已执行验证与外部缺口

Node 24.21.0 契约测试执行真实最小 WASM 字节，检查原生方法接收者、UTF8/二进制结果、坏字节拒绝、缺 SDK/引擎显式失败、路径校验。平台 callback/namespace 接口由受控宿主替身验证调用契约，这不是平台验收。测试命令（仓库根）：

```sh
node --test platforms/alipay/tests/native-resources.test.mjs
```

尚未运行官方开发者工具、真实手机、平台审核；需实测完整 Rapier 二进制、原生 WebGL2 渲染、包内 GLB/JSON/WASM 文件路径和资源打包可见性。产物完整性通过不等于这些原生能力验收。

## 远程素材

`attachNativeResources(sdk, {allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 15000})` 另暴露 `readRemoteAsset(url, type='arraybuffer')`。仅接受无凭证、无端口的 HTTPS 域名 URL，精确 hostname 白名单；没配 host 为 CONFIG_REQUIRED，未允许 host 为 HOST_BLOCKED。用户还须在开放平台后台配置服务器域名白名单并发布新版；本地白名单不能替代平台设置。

本次通过浏览器实际核对[支付宝小游戏 my.request](https://opendocs.alipay.com/mini-game/08uy1c)（更新2026-03-24）：二进制用 **dataType:'arraybuffer'**（基础库1.19.0/2.4.4+），文本用 **dataType:'text'**，不传微信 responseType；success 读取 **status** 和 data，fail 读取 **error/errorMessage**。normalizer保留真实request的receiver。低版本无法返回ArrayBuffer会明确INVALID_DATA或平台fail，不伪造转换。

GET不附带认证头或secret。HTTP非2xx、错误类型、平台fail、超时均拒绝，超时仅在有真实task.abort时调用，迟到callback忽略。已测独立my签名与失败契约；未运行支付宝开发者工具、实际HTTPS素材请求或真机。WASM留包内，远程仅公开模型/JSON。

## 包体限制核查（2026-10-06）

支付宝小游戏[分包指南](https://opendocs.alipay.com/mini-game/08uo7z)（官方2026-07-23，本次浏览器实际读取）：主包4M，总主包+分包20M，单个普通分包不限。

超限产物只能作为私有诊断结果记录为 built-with-limits-blocked，不能称为可导入/已接入；公开远程素材方案需明确配置assetBase及真实平台合法域名，不以网络替身补成功。

## 原生分包加载

资源桥另提供 `await sdk.loadSubpackage('photos1')`，只接受配置 name（不是路径），Promise 仅在真实SDK success 后 resolve 原回调结果；缺方法为UNAVAILABLE、失败为SUBPACKAGE_FAILED并保留原cause、超时为TIMEOUT。沿用 requestTimeoutMs 上限，超时仅在实际返回对象具有abort方法时调用，迟到回调不能改结果；不创造task、不假加载成功。

[官方配置/接口](https://opendocs.alipay.com/mini-game/08uo7z)：my.loadSubpackage({name,success?,fail?})，字母 p 为小写；SDK>=2.1.15，官方主体为企业支付宝小程序，支小宝/安诊儿不支持。success 示例{success:true}，fail参数官方未明列结构，桥保留原始cause；不假设返回Task或onProgressUpdate。下载后会自动执行分包代码。旧淘宝my.loadSubPackage不可作为此小游戏入口。

```json
{
  "subpackages": [{ "name": "photos1", "root": "subpackages/photos1/" }]
}
```

分包目录配真实 `game.js` 入口，只做模块导出即可，不能再次启动游戏或主页；加载成功后才用真实包内图片路径，所有素材保持原bytes并校验SHA256。普通资源分包不必作为独立分包启动。照片应按完整文件分组控制各包大小，不拆图片二进制；B站每分包4M限制必须独立检查。原生开发工具导入、上传、图片可见性和真机加载尚未运行。

SDK签名直接依据：[my.loadSubpackage](https://opendocs.alipay.com/mini-game/0iq1me)（更新2026-04-07，本次浏览器实际读取）。normalizer仅绑定精确小写p方法。
