# 夜航守望启动画面

## 交付范围

`startup/` 保存项目绑定的原 PNG、WebP、HTML/CSS、运行时和产物安装器；启动测试位于 `tests/startup.test.mjs`。
`scripts/build.mjs` 在 Creator 编译完成后安装首屏，再写入 build-info 和复制 mobile dist。
`scripts/artifact.mjs` 将整个 startup 目录纳入源指纹，HTML/CSS/JS 等文本统一 LF。
游戏主体已接入场景 ready/error 信号；最终双目标 Creator 构建与验收见 `../STATUS.md`。

背景来源：本次使用内置 image_gen 生成的 `exec-66ad5b81-cb07-4695-a248-1c385e070325.png`；完整提示词见 `startup-prompt.md`。
原图已复制为 `startup/background.png`（1,816,518 字节）；使用已有 sharp 0.34.5
以 `webp({ quality: 85, effort: 6 })` 转换成 `background.webp`（87,984 字节）。
没有 AI 重绘、裁剪或新依赖。浏览器使用 CSS cover 适配视口，PNG 不进入发布包。

## 视觉与交互

蓝黑夜航背景，中文宋体标题「夜航守望」，英文小字 NIGHT OVERWATCH，暖金色航线与状态灯。
文案：穿越暗夜，护送每一束归途的灯火。
云雾、扫描、背景微动、不定进度均为 CSS；无假百分比、无最短播放时长。
`prefers-reduced-motion: reduce` 关闭全部动画与淡出；支持 safe-area、390×844、568×320 和桌面。
`#night-startup` 是全视口 HTML 叠层，不主动请求浏览器全屏。
加载时 GameDiv inert；重试按钮至少 44px，可键盘访问，失败时自动聚焦。
首屏只在准备完成后淡出 420ms，450ms 的清理兜底只用于 transitionend 未触发的情形。

## 实际 Cocos 3.8.8 入口与 splash

读取了本机 `D:/tools/cocos` 的 Builder 类型、编辑器 splash 面板、引擎源码，以及实际
mobile/desktop 的 index.html、index.*.js、application.*.js 和 src/settings.*.json。

- 旧 settings 含默认 Logo 的 base64，`totalTime: 2000`。
- index.*.js 加载 Application 和 cc，调用 application.init/start；内部 catch 只打印错误。
- Application.start 使用 game.init({ settingsPath, overrideSettings }) 后 game.run()。
- game.init 先 settings.init，再 onPostBaseInitDelegate；之后才初始化设备、资源与 SplashScreen。
- AFTER_SCENE_LAUNCH 在组件 start/update 之前；AFTER_DRAW 在当帧组件更新及渲染之后。

构建配置优先发送 `replaceSplashScreen: true`、本机类型声明的 `useSplashScreen: true`，
并指定 splashScreen totalTime=0 / logo=none。2026-09-30 主代理实际构建表明：
Builder 日志确认收到这两个选项及 splashScreen，但生成 settings 仍保留默认 Logo/2000ms。
编辑器 splash 面板的时长输入最小值为 500ms；CLI 设置不能作为关闭已经生效的证据。

因此运行时在 application.init 后、application.start 前注册正式的
`game.onPostBaseInitDelegate`，调用公开 API：

```js
settings.overrideSettings('splashScreen', 'totalTime', 0);
settings.overrideSettings('splashScreen', 'logo', { type: 'none' });
settings.overrideSettings('splashScreen', 'background', {
  type: 'color', color: { x: 0.02, y: 0.04, z: 0.06, w: 1 },
});
```

随后 querySettings 校验有效值。此时 settings.json 已加载，SplashScreen.init 尚未执行。
引擎源码在 totalTime <= 0 时跳过 splash 资源初始化；不存在被 HTML 遮住的固定 2 秒播放。
不修改编辑器安装、不篡改哈希命名的 JS/settings、不重写 game.init 方法。
官方参考：[构建选项](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/build-options.html)、
[Settings API](https://docs.cocos.com/creator/3.8/api/en/classes/core.Settings.html)。

## Ready / error 约定

DOM ID 固定为 **night-startup**，测试等待 hidden/detached 均可。

游戏主体在首次 HUD.update 完成、飞机模型 status === 'ready' 且 beacon/modelImport 不再 loading 后发送一次：

```ts
window.dispatchEvent(new Event('night-overwatch:ready'));
```

模型等必要初始化失败时发送：

```ts
window.dispatchEvent(new CustomEvent('night-overwatch:error', {
  detail: { message: '机舱模型加载失败，请重试。' },
}));
```

音频不阻塞首屏；beacon 使用已有 fallback 时可视为完成。浏览器专用代码应按游戏自身
sys.isBrowser 条件调用。ready 的含义是可呈现并操作的场景，而非玩家已开始任务。

运行时先于引擎脚本安装监听，因此早到的 ready 会保留；必须同时收到场景启动事件与游戏
ready，才监听后续一次 AFTER_DRAW 退出。不得仅凭 game.run 返回、任意计时或单独场景启动退出。
错误为终态，晚到 ready 不会掩盖错误，成功后移除启动监听和超时任务。

阶段文字由实际事件驱动：连接飞行系统 → 初始化系统 → 装载资源 → 展开场景 → 准备界面 → 呈现画面。
入口导入/初始化失败、全局异常、未处理 Promise、脚本资源失败、WebGL context loss、游戏 error
都显示重试。无法收到完成/错误事件的静默故障由 60 秒 watchdog 收敛；Cocos 原生场景加载
存在只打印错误的路径，也由该兜底处理。失败保留背景和错误文案，重试只 reload 当前游戏页面。
可选背景缺失不阻塞场景，纯色底和文本仍然可见。

## 可重复构建与缓存

1. 编译后从 index.html 解析真实入口，再从 index.*.js 解析 application 路径，最后读取
   application 中引用的 settings；不猜测 MD5 文件名。
2. 只替换 HTML 的入口调用，直接调用原 Application；保留 polyfills、SystemJS、import map。
3. 内联首屏 CSS/JS，保证早于引擎网络请求显示并捕获错误；图片以内容 SHA-256 前 12 位命名并 preload。
4. 通过命名标记重复安装，移除旧模板块后重新生成，输出稳定且不重复监听/叠层。
5. Creator 的已有 application/index/settings/cocos-js 等文件保持原字节，MD5 缓存关系完整。
   原 PNG、WebP、模板及安装器进入 sourceHash；更改任一项会拒绝旧预构建缓存。
   启动测试位于不参与 sourceHash 的 tests 目录，新增或修改测试不会使构建缓存失效。
6. 未知 Creator 版本/HTML 结构明确失败，不静默注入错误入口。原有预构建恢复测试保持通过。

## 验证与复现

从仓库根目录执行，无需 Creator：

```sh
node --test games/local/night-overwatch/tests/startup.test.mjs games/local/night-overwatch/tests/artifact.test.ts
```

9 项检查覆盖：ready 与首帧顺序、提前 ready、错误/超时终态、重试、减少动态效果、淡出清理、
两类 Creator 入口重复安装、默认 splash 的官方 override、哈希文件不变、缓存失效/LF 归一化及测试编辑不影响构建指纹。

独立效果预览：`reports/startup-preview/index.html`，同目录包含 390×844、568×320、1366×768
加载态/失败态截图及 verification.json。它未启动引擎，不代表场景验收；60 秒后会按真实 watchdog 超时。
三种尺寸均检查了文字/加载区域无相交、重试按钮可见及减少动态效果下无动画。

真实引擎验证使用主代理已生成的 mobile 产物副本，放在 `reports/startup-integration-mobile/`，
不改 build/dist，不调用 Creator。Headless Chromium 844×390 实测：运行时 totalTime=0、logo=none，
main 场景启动、飞机 status=ready、modelImport=loaded、首屏移除、页面异常 0；证据为同目录
verification.json 和 ready.png。这是 Web 浏览器证据，正式新构建及平台/真机验收仍由主代理完成。
