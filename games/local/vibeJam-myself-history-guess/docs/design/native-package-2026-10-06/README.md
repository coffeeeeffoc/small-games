# 原生分包实际 Canvas 验证

验证环境：Chromium 390×844 触屏 Canvas，运行 `apps/shell-minigame/dist/nine-games/wechat/vibeJam-myself-history-guess/game.js` 实际 CJS 产物。本次没有导入源代码或 H5 入口。SDK shim 通过读取和执行实际 `history-images-X/game.js` 后调用成功回调；图片使用浏览器真实 Image，原对象直接交给 drawImage。

已执行：

- 33张分包图片与游戏原图逐字节对比，并核对资源清单 SHA256。
- 首次注入分包加载失败；图片尚未创建/设置路径，现有错误提示可见。点击画面后真实分包入口加载成功，原图绘出。
- 吴哥→敦煌→吴哥跨包切换与返回；成功分包复用，没有重复下载。
- 从5个分包分别解码并绘出吴哥、敦煌、杭州、澳门、泉州的原图，共6次照片展示。每张照片区域颜色数超过150，实际记录为15916至18444，避免只检查文字按钮而漏掉空白照片。
- 截图保存失败状态、重试成功、切换和5个分包的照片。结束后触摸/生命周期监听全部退订，页面异常为零。

结果与准确 game.js SHA256 在 `verification.json`。照片数组包含再次返回吴哥，因此实际展示6次，检查5个不同场景；未将其描述为28幕逐一真机验收。

可重复运行（仓库根，需可用 Playwright/Chromium）：

```sh
node games/local/vibeJam-myself-history-guess/scripts/native-package-browser.mjs
```

可选 `NATIVE_ARTIFACT` 指定构建目录，`PLAYWRIGHT_MODULE` 指定 Playwright 模块，`CHROMIUM_PATH` 指定浏览器。

浏览器 shim 使用本地 HTTP 读取真实产物来验证路径、调用次序、实际图片绘制和失败重试；生产代码仍使用平台原生 loadSubpackage。此结果不是官方微信 SDK、开发者工具、真实手机或审核验收，其他四个平台由根任务分别进行构建/契约验证。
