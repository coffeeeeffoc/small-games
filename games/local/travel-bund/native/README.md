# 外滩漫游原生入口

`index.tsx` 导出异步 `startNativeTravelBundGame(sdk, config)`，返回 `{canvas, whenReady, ready(), snapshot(), dispose()}`。`whenReady` 在原Scene的真实Rapier初始化/安全站位完成后兑现；根平台入口必须等待它后再报告启动完成。缺少真实WebGL2、包内WASM、文件读取、远程二进制、离屏Canvas2D、宿主触摸、存档或动画帧即明确 `TRAVEL_UNAVAILABLE`，不会启动H5、WebView或替代场景。

## 构建接口

```js
import {prepareNativeBuild} from './games/local/travel-bund/native/build-native.mjs';
const result = await prepareNativeBuild(outputDirectory);
// result.entry: 实际已bundle的native-entry.mjs，不是源TSX
// result.assetDirectory: 包内assets目录，复制至平台包/assets
// result.assetManifest: 同时记录包内与远程资源、原bytes SHA256、submodule SHA
// result.metafile / sourceInputs: 真实打包源码输入
// result.mainPackageBytes: bundle+全部包内资源+manifest（平台wrapper/config还需另外计）
// result.remoteBytes: 惰性读取的完整原场景GLB+world.json
```

`native/generated/` 不入库；构建先从原Scene与锁定依赖生成，再以 `generate-sources.mjs --check` 检查Scene/StreetLife/clouds、Rapier绑定与Draco官方JS解码源同步；副本只替换平台资源、离屏Canvas、声音和诊断边界，不重写城市场景、交通、控制器或物理。Draco解码在运行时用官方纯JS解码器（Apache-2.0），不使用浏览器Worker、动态eval或替代低模。Rapier使用包内原始0.19.2 WASM和真实平台instantiate。宿主缺TextDecoder时安装真实UTF-8算法，原world.json中文/BOM/多字节/流式与错误编码已做契约比对；Three GLB和Rapier原绑定同样使用此解码能力。所有398个原GLB均没有images条目，不走GLTFParser的Blob/DOM Image路径。

## SDK和配置

先调用对应平台的 `attachNativeResources`，支付宝先normalize；桥接后的SDK提供：

- `readFile(path, 'arraybuffer'|'utf8')`
- `readRemoteAsset(HTTPS_url, 'arraybuffer'|'utf8')`
- `instantiateWasm(package_path, imports) -> {instance, module?}`
- 原宿主Canvas/WebGL2/Canvas2D、createImage、触摸/前后台/存档，以及真实帧调度。

```js
const sdk = attachNativeResources(normalizedSdk, {
  allowedAssetHosts: ['coffeeeeffoc.github.io']
});
const instance = await startNativeTravelBundGame(sdk, {
  platform: 'wechat', preview: true,
  assetRoot: 'assets/',
  assetBase: 'https://coffeeeeffoc.github.io/small-games/games/travel-bund/',
  shareEnabled: false
});
await instance.whenReady;
```

Preview显式使用现有Pages资源；release的HTTPS assetBase由根构建器环境变量校验，不将preview默认当正式域名配置。平台合法域名设置由用户注册后配置，不能由本入口更改权限或登记账户。每份远程GLB/world.json都按包内固定资产manifest校验SHA256，托管版本变化则停止读取并提示完整性错误。

纯包内完整模型原压缩资产约38MB，无损预解码原型122,097,117bytes，均不能当作可导入主包。本实现分离原托管资源；最终包含平台wrapper、SDK/config后的包体仍由根构建器按每个平台官方限制检查。本地构建不等于官方开发工具或真机验收。

## 保留的原玩法和降级

保留两岸全场景/原198建筑分块流式策略、原水面与岸线、原交通和游客碰撞、真实生活对象、同一Controller/Rapier步道与桥、18m/s漫游、跳跃、相机/缩放、五处安全落脚点、三条路线、旧地标/生活/设置/寻景存档、四关真实寻景校验与解锁。画面和控制统一横屏逻辑映射到宿主Canvas，竖屏时渲染投影/HUD/触控一起旋转；菜单为Canvas页面，无浏览器全屏入口。

真实照片来自原WebGL画面readPixels，不包含HUD；未提供原生相册导出时仅保留本次手记照片并明确提示。平台分享未配置则不可用，任何分享调用都不假定已完成或发奖励。原WebAudio环境音改为真实wav+InnerAudioContext；没有音频能力明确静音，原生基础环境音不声称具备浏览器空间声场。图片参考与旧玩法配置保持一致。

## 验证命令

```sh
node games/local/travel-bund/native/build-native.mjs
node games/local/travel-bund/native/tests/contracts.mjs
node games/local/travel-bund/native/browser-test.mjs
node games/local/travel-bund/native/worker-browser-test.mjs
```

浏览器专项使用实际WebGL2、原GLB和真实WASM；SDK IO契约由真实本地文件驱动。Worker专项没有window/document，使用真实OffscreenCanvas和真实浏览器RAF。它们均不冒充微信/B站/抖音/快手/支付宝官方工具、实体手机或性能验收。界面设计和验收记录见 `../docs/platforms/native-design-2026-10-06/`。
