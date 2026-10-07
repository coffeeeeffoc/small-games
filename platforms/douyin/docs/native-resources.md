# 原生包内资源与 WASM 能力边界

`../native-resources.mjs` 导出 `attachNativeResources(sdk)` 与 `attachDouyinNativeResources(sdk)`。在平台 SDK normalization 完成后调用，返回保留原 SDK 接收者、可枚举资源方法的 Proxy。

```js
const sdk = attachNativeResources(normalizedSdk);
const binary = await sdk.readFile('models/world.glb'); // ArrayBuffer
const text = await sdk.readFile('levels/world.json', 'utf8'); // string
const { instance } = await sdk.instantiateWasm('rapier/rapier.wasm', imports);
```

仅支持包内路径，禁止 URL、路径穿越和空路径段。二进制结果必须为 ArrayBuffer，文本必须为 string；错误类型不会转换成假资源。文件读取异常原样传播或 READ_FAILED，缺少方法为 UNAVAILABLE。异步回调读取超过 15 秒为 TIMEOUT。WASM 编译和链接错误传播，缺少引擎为 UNAVAILABLE，不切换到假物理/DOM/网络资源。

抖音使用官方 `TTWebAssembly.instantiate(path, imports)`，其返回 `{module, instance}`。namespace 缺失时仅尝试真实标准 WebAssembly；已存在 namespace 的编译或链接失败不会切换引擎。官方注明基础库 3.7.0.0 起支持 TTWebAssembly，iOS 暂不支持 SIMD，实际 Rapier 二进制必须实机编译验证。

依据：[小游戏性能优化/WASM](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/optimization)、[小游戏 API 总览](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/overview)、[小游戏 readFile](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/file/file-system-manager/file-system-manager-read-file)。详细小游戏 readFile 页面本次抓取仅返回站点外壳；总览确认该方法，同一 tt 文件 API [官方完整签名参考](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/file/file-system-manager/file-system-manager-read-file)确认回调 data、encoding 省略为 ArrayBuffer。小游戏原生签名和二进制读取仍列为开发工具/实机待验证。

WebGL2 由游戏对真实宿主 Canvas 调用 `getContext('webgl2')` 探测，失败必须显示不可用；本资源桥不创建或伪造 Canvas。离屏纹理另用真实 createCanvas。广告、登录、分享及密钥不在此桥范围，未配置能力不得假成功，服务端 secret 不进入客户端。

## 已执行验证与外部缺口

Node 24.21.0 契约测试执行真实最小 WASM 字节，检查原生方法接收者、UTF8/二进制结果、坏字节拒绝、缺 SDK/引擎显式失败、路径校验。平台 callback/namespace 接口由受控宿主替身验证调用契约，这不是平台验收。测试命令（仓库根）：

```sh
node --test platforms/douyin/tests/native-resources.test.mjs
```

尚未运行官方开发者工具、真实手机、平台审核；需实测完整 Rapier 二进制、原生 WebGL2 渲染、包内 GLB/JSON/WASM 文件路径和资源打包可见性。产物完整性通过不等于这些原生能力验收。

## 远程素材

`attachNativeResources(sdk, {allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 15000})` 另暴露 `readRemoteAsset(url, type='arraybuffer')`。仅接受无凭证、无端口的 HTTPS 域名 URL，按精确 hostname 白名单校验；没配 host 为 CONFIG_REQUIRED，未允许 host 为 HOST_BLOCKED。还需用户在平台后台配置 request 合法域名；本地白名单不替代平台授权。

使用[官方 request 接口](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/network/initiate-a-request/tt-request)发 GET，dataType 为 string 防止自动 JSON.parse，responseType 为 arraybuffer/text，成功回调仅接受 statusCode 2xx 与严格数据类型。未调用 fetch；原生异常、HTTP 错误、平台域名拒绝均明确失败。超时终止 Promise，若任务有 abort 则保持 receiver 调用，迟到回调不会改成功状态。WASM 留包内，只有公开模型/JSON 可使用此入口；不传 secret 或用户认证头。

已测网络 SDK 契约及超时/迟到 callback，未实际运行平台网络请求。URL/CDN 内容、完整性与平台域名白名单尚须构建器/用户配置和官方工具实测。

## 包体限制核查（2026-10-06）

官方普通小游戏[代码包规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)：未分包总包20MB；分包主包4MB、默认总包20MB，只有实际开通虚拟支付才30M。历史[IDE1.1.0-game更新](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/developer-instrument-update-and-download)记载未分包16MB，与当前介绍存在差异；未运行官方IDE前应采用保守限制并报告冲突，不能默认Unity专属100M。

超限产物只能作为私有诊断结果记录为 built-with-limits-blocked，不能称为可导入/已接入；公开远程素材方案需明确配置assetBase及真实平台合法域名，不以网络替身补成功。

## 原生分包加载

资源桥另提供 `await sdk.loadSubpackage('photos1')`，只接受配置 name（不是路径），Promise 仅在真实SDK success 后 resolve 原回调结果；缺方法为UNAVAILABLE、失败为SUBPACKAGE_FAILED并保留原cause、超时为TIMEOUT。沿用 requestTimeoutMs 上限，超时仅在实际返回对象具有abort方法时调用，迟到回调不能改结果；不创造task、不假加载成功。

[官方配置/接口](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/basic)：tt.loadSubpackage({name,success?,fail?,complete?}) → LoadSubpackageTask，SDK>=1.88.0；name 或 root。game.json **必须驼峰 subPackages**；普通分包目录自动加载 game.js。

```json
{
  "subPackages": [{ "name": "photos1", "root": "subpackages/photos1/" }]
}
```

分包目录配真实 `game.js` 入口，只做模块导出即可，不能再次启动游戏或主页；加载成功后才用真实包内图片路径，所有素材保持原bytes并校验SHA256。普通资源分包不必作为独立分包启动。照片应按完整文件分组控制各包大小，不拆图片二进制；B站每分包4M限制必须独立检查。原生开发工具导入、上传、图片可见性和真机加载尚未运行。
