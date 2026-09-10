# Android Shell

把现有 `shell-web` 的 Pages 静态构建完整嵌入原生 Android WebView，应用名为“摸鱼游戏社”。六个游戏及素材随 APK 安装，不依赖开发电脑或 Runtime 服务。右上角“设置”可开启 GitHub 资源缓存、检查更新、重新加载以及下载最新 APK。

## 构建

需要 Node 22+、pnpm、JDK 17、Android SDK Platform 34 / Build Tools 34.0.0。首次构建需联网下载 Gradle/Maven 依赖。

```powershell
# 按本机安装位置设置，仅作用于当前终端
$env:JAVA_HOME = 'D:\setup\Java\jdk-17'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
pnpm games:init
pnpm install --frozen-lockfile
pnpm android:apk
```

产物：`apps/shell-android/dist/moyu-arcade-debug.apk`。这是 Android 自动使用本机 debug keystore 签名的可安装测试包，支持 Android 8.0+；WebGL 游戏还需要设备支持 WebGL2。不是应用商店正式发行包。保留本机 debug keystore 才能持续覆盖升级，卸载会清除本地存档。正式包使用 `pnpm android:release`，签名和 CI 配置见 [移动端构建与更新](../../docs/mobile-builds.md)。

Android Studio 打开本目录，Gradle JDK 选择 **JDK 17**，选择 `app` 运行。Gradle 会自动构建并同步 H5；SDK 可通过 `ANDROID_HOME` 或本机 `local.properties` 设置。Gradle 限制为单 worker、1GB heap，不需启动完整平台。

## 验证

启动一个 Android 模拟器或连接一台开启 USB 调试的测试手机，确保 `adb devices` 只有一个目标：

```powershell
pnpm android:test
pnpm --filter @coffeeeeffoc/shell-android test:updates
pnpm --filter @coffeeeeffoc/shell-android test:settings
# Android 原生静态检查
cd apps/shell-android
.\gradlew.bat --no-daemon :app:lintDebug
```

设备检查会安装/覆盖测试包，验证禁止联网时六个游戏启动、独立游戏交互、系统返回键、手机宽度、后台恢复和进程重启后 localStorage 保留。截图保存在 `dist/android-catalog.png`。

## 运行边界

- 复用已有 Pages 模式，本地存档可用，云存档、Runtime 发布目录和需要服务端的好友房间不在离线包范围内。
- 系统返回键优先点击 Web Shell 现有的 `.game-page > nav button`，使游戏自己的清理与保存流程执行；独立页面回退 WebView 历史，目录首页确认退出。修改 Shell 导航结构时运行设备检查。
- 横竖屏切换保留 WebView，进入后台暂停 WebView/计时器，支持 H5 全屏和加载失败重试。
- 使用 AndroidX `WebViewAssetLoader` 的 HTTPS 本地来源，禁止 WebView 网络加载、file/content 访问和 HTTP 混合内容，不注入原生 JavaScript 接口。塔防的可选 Google Fonts 自动使用设备字体，游戏内容不依赖联网。外部 HTTP(S) 顶层链接交给系统浏览器。
- 正式发行时配置独立签名、递增 `versionCode`，并按发行渠道要求更新 target SDK；签名材料不要提交 Git。构建产物不提交 Git。

## 更新行为

- 默认使用内置资源。开启开关后，“检查并下载最新资源”读取本仓库 Pages 的 `mobile/update.json`，按版本比较完整缓存；下载约 26 MB 的 `web.zip` 并校验大小和 SHA-256，完成解压后才提交新版本。中断、校验失败或发布过程中的文件不一致都保留现有版本。
- “重新加载”返回目录并切到最新完整缓存；当前游戏会结束。关闭开关立即返回内置目录。两种来源都使用原有 HTTPS 本地 origin，存档保持不变，WebView 仍不允许任意联网。
- 设置和缓存跨重启保存；清理应用数据会同时清除存档与缓存。旧缓存仅在下次进程启动时清理，不删除正在运行页面的素材。
- APK 入口读取 GitHub 最新 Release 中的 `moyu-arcade.apk`，检查资源摘要、包名、签名与递增版本，再通过限定目录的 FileProvider 打开系统安装器。需要用户授予安装来源权限并确认，不能静默安装。找不到发行包、网络失败或签名不同都会明确提示。
- 当前仓库来源固定在 `AppUpdates.java` / `UpdateFiles.java`；fork 项目需同步修改来源和 HTTPS 主机白名单。

采用官方 [WebView 本地内容加载方案](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)。
