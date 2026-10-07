# 支付宝原生小游戏适配

本目录只连接支付宝小游戏 `my` 原生 Canvas、触屏、生命周期、音频与本地存储。`normalize.mjs` 是可供原生游戏/竞赛适配调用的 JavaScript 入口；`startAlipayGame` 连接共享 Native Game Shell。不会创建 DOM、WebView、微信 SDK 别名或模拟登录。游戏规则不依赖支付宝 API。

## API 核对依据

核对日期：2026-10-06。支付宝文档站部分页面依赖客户端加载，以下链接的索引正文以及平台自身示例用于核对；官方开发者工具和真机尚未运行。

- [my.createCanvas](https://opendocs.alipay.com/mini-game/091o6p)：首次创建屏幕画布，后续创建离屏画布；缺失时启动失败，不能降级成小程序 `createCanvasContext`。
- [Canvas 概览](https://opendocs.alipay.com/mini-game/08uy1g) 与 [my.createImage](https://opendocs.alipay.com/mini-game/09242g)：绘制和图片均由原生对象承载。
- [my.onShow](https://opendocs.alipay.com/mini-game/08ug7f) 与 [my.onHide](https://opendocs.alipay.com/mini-game/08v47y)：小游戏生命周期。不是小程序的 `onAppShow/onAppHide`。SDK 必须提供对应 off 方法，以释放监听。
- [my.onTouchCancel](https://opendocs.alipay.com/mini-game/08v27v)：保留原生事件的所有触点、标识与取消语义；不只取首个触点。开始、移动、结束、取消的订阅必须可移除。
- [my.getStorageSync](https://opendocs.alipay.com/mini-game/08uvp0)：传 `{ key }`，读取结果 `.data`；写入传 `{ key, data }`，移除传 `{ key }`。返回的非零 `error` 或 SDK 抛错继续传给宿主，不能伪称保存成功。
- [my.getFileSystemManager](https://opendocs.alipay.com/mini-game/08v7q3) 与 [FileSystemManager.readFile](https://opendocs.alipay.com/mini-game/08urvh)：读取使用 `{ filePath, encoding: 'utf8', success({ data }), fail }`。已在官方网页实际核对，代码包文件必须从 `/` 根路径读取，适配器为游戏的相对资产路径加根前缀，保留本地 `https://resource`/`https://usr` 路径及原生文件管理器方法的 receiver。只暴露核实过的异步读取能力。低版本缺文件管理器时教材明确不可用。
- [代码包文件](https://opendocs.alipay.com/mini/03dt4s) 与 [项目配置](https://opendocs.alipay.com/mini/03dbc3)：词屿工程使用 `format: 2`、`assetsInclude: ['assets/english-dict/**/*.json']` 将教材纳入可读取资源。教材文件必须由共享构建器实际复制并检查完整性。
- [my.showKeyboard](https://opendocs.alipay.com/mini-game/08v6w7)、[onKeyboardInput](https://opendocs.alipay.com/mini-game/08v7q6)、[onKeyboardConfirm](https://opendocs.alipay.com/mini-game/08ung2)、[onKeyboardComplete](https://opendocs.alipay.com/mini-game/08umcf) 与 [hideKeyboard](https://opendocs.alipay.com/mini-game/08ujw6)：保留 `defaultValue/maxLength/multiple/confirmHold/confirmType` 及回调参数，事件当前文本由 `res.value` 提供；只有对应 off 方法同时存在才暴露订阅，确保页面关闭和后台恢复不会泄漏监听。无键盘能力的客户端由游戏明确显示输入不可用。
- [game.json](https://opendocs.alipay.com/mini-game/0fx941)：当前方向字段为 `deviceOrientation`；`screenOrientation` 属于历史字段。旧版 Cocos 支付宝模板仍含历史字段，不能据此推断当前配置。
- [项目配置](https://opendocs.alipay.com/mini/03dbc3)：`mini.project.json` 提供工程根目录设置。AppID 在平台开发者工具中关联，产物的 `alipay-preview.json` 记录构建使用的公开 AppID 与状态。
- [my.exitMiniProgram](https://opendocs.alipay.com/mini/api/my.exitMiniProgram)：此小程序退出接口有主动点击限制，小游戏客户端支持仍须实测。因此仅在 SDK 明确存在时调用，缺失/抛错返回失败，不能以调用成功回调冒充真正退出。游戏内返回主页由宿主管理，不依赖退出整个应用。

## 构建与配置契约

共享构建器使用 `build.mjs` 中 `alipayPlatform` 的 `my`、`startAlipayGame` 和工程文件描述。输出入口为原生 `game.js` 与 `game.json`，无需 `app.axml` 或 H5 页面。构建器负责依游戏选定横竖屏及生成完整性 manifest。

```sh
node --test platforms/alipay/tests/adapter.test.mjs
node apps/shell-minigame/scripts/nine-games-build.mjs --platform alipay --game letters-words2 --preview
# release 去掉 --preview，先配置 MINIGAME_LETTERS_WORDS2_ALIPAY_APP_ID（16位数字）。
```

公开变量：九款统一批次使用 `MINIGAME_<SLUG>_ALIPAY_APP_ID`（大写、`-` 转 `_`），Cocos 平台 wrapper 使用 `ALIPAY_APP_ID`。无 AppID 时产物标记 preview 且不写假 ID。提供真实 AppID 仅代表配置齐全，不代表开发者工具、真机或平台审核通过。release 缺少必填值必须 fail-fast，此校验由共享 builder 完成。

登录、分享、激励广告目前不暴露能力；填写广告 ID 也不会自动开启未核验的广告桥接。它们应明确不可用，不发奖励、不假登录。未来接入授权码交换、支付或广告服务端签名时，应用私钥及服务端 secret 只存于服务端环境变量；它们不是客户端构建参数，不进入 `game.js`、工程配置或 manifest。

契约测试使用受控 SDK 对象验证签名转换、真实错误传播、监听清理、多指取消与配置；这只是离线契约验证。开发者工具导入、客户端 Canvas/WebGL 能力、后台恢复、安全区、实际音频以及平台审核属于外部验证待定，不能由生成产物数量替代。
