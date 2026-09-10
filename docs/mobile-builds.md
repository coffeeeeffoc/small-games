# 移动端构建与更新

## 实现选择

延续已有原生 Android WebView，iOS 使用系统 WKWebView，两端复用 `shell-web` 的 Pages 构建，不引入 Capacitor 等框架。Android 采用完整资源 ZIP + SHA-256 的缓存更新；相比依赖 WebView HTTP 缓存，完整包能保证离线资源齐全；相比逐文件更新，不需要维护差分合并和多次网络请求。

Android 更新开关默认关闭。原生设置可检查/下载资源，下载不打断正在玩的版本，用户点击重新加载后生效。资源与设置存放在私有目录；新版本验证完成前不改变当前版本。相同本地 origin 保持原有存档。iOS 当前交付离线壳与构建，不包含热更新设置。

## 推送后的流程

`.github/workflows/pages.yml` 发布网站前运行 `scripts/mobile-assets.py`，生成 `mobile/update.json` 和 `mobile/web.zip`。清单版本即 ZIP 的 SHA-256；同样的资源会产生同样的版本。Android 下载地址是 `https://coffeeeeffoc.github.io/small-games/mobile/`，首次使用需等待新增 Pages 流程部署成功。

`.github/workflows/mobile.yml` 在推送 `main`、PR 及手动触发时构建：

| 平台    | 未配置签名                                              | 配置签名                                                       |
| ------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Android | Actions 的 `android-apk` 中提供 debug APK               | 同一 artifact 提供 release APK；main 构建另发布 GitHub Release |
| iOS     | `ios-builds` 中提供模拟器 ZIP、启动截图、未签名归档 ZIP | 另外提供已签名 IPA                                             |

测试版 Release 固定 Android 资源名 `moyu-arcade.apk`，独立 tag 为 `mobile-<run_number>-<run_attempt>`，应用内通过 GitHub `releases/latest` 找包。仅当前 main 提交的已签名 APK 会设为 latest。请不要把其他无 APK 的 Release 设为 latest。配置 Apple 签名后，Release 也附带 `moyu-arcade.ipa`；Ad Hoc（`ad-hoc` / `release-testing`）或 Enterprise 导出还附带 `ios-manifest.plist`，iOS 的“最新版”按钮可唤起系统安装。App Store 导出不会生成直接安装入口，不自动上传 App Store 或 TestFlight。

## Android 签名

在仓库 Settings → Secrets and variables → Actions 添加：

| Secret                      | 内容                                      |
| --------------------------- | ----------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | 用于长期发行的 JKS/keystore 文件的 Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码                             |
| `ANDROID_KEY_ALIAS`         | key alias                                 |
| `ANDROID_KEY_PASSWORD`      | key 密码                                  |

可用 JDK `keytool -genkeypair` 创建并妥善备份发行密钥。不要把密钥或密码提交 Git。已有安装若使用本机 debug 签名，正式密钥不同就不能直接覆盖安装；需要规划首次迁移。卸载会丢失应用内存档，不应为签名错误自动卸载。

本地发行构建使用环境变量 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`，然后运行 `pnpm android:release`。`ANDROID_VERSION_CODE` 必须高于已安装版本；默认本地为 2，CI 为 `1000 + github.run_number`。`APP_VERSION` 是展示版本，当前为 `0.2.0`。需要向用户展示语义版本升级时同时修改 workflow 与 Gradle 默认值。

没有上述 Secrets 时仍自动产出可安装的 debug 测试 APK，但不公开为自动更新包，因为临时 runner 的 debug 密钥不能保证跨构建一致。该流程面向 GitHub APK 分发；发布到应用商店前需按渠道要求审查 target SDK 与安装权限。

当前开发阶段已配置独立、固定的 Android 测试签名 Secrets，后续自动发布的测试 APK 可相互覆盖升级。该密钥与以前的本机默认 debug 签名不同；旧 debug 安装不能直接覆盖。测试密钥备份在开发机 `C:\Users\15211\.android\small-games-ci-test\`，不要提交或发给测试者。测试者只需拿 Release 中的 APK。

## iOS 签名

使用 Apple Developer 账户为 `com.coffeeeeffoc.smallgames` 创建 App ID 和相应 distribution profile，并导出包含私钥的 Apple Distribution `.p12`。添加以下 Secrets：

| Secret                      | 内容                                             |
| --------------------------- | ------------------------------------------------ |
| `IOS_CERTIFICATE_BASE64`    | `.p12` 的 Base64                                 |
| `IOS_CERTIFICATE_PASSWORD`  | `.p12` 密码，可为空                              |
| `IOS_PROFILE_BASE64`        | `.mobileprovision` 的 Base64                     |
| `IOS_EXPORT_OPTIONS_BASE64` | Xcode 导出得到的 `ExportOptions.plist` 的 Base64 |

推荐从 Xcode Organizer 按目标渠道手动导出一次，复用对应 ExportOptions。使用手动签名，`teamID`、`provisioningProfiles` 中的 bundle ID / profile 名必须匹配本次证书和 profile；Ad Hoc profile 需要包含测试设备 UDID；App Store 分发 IPA 不能作为通用安装包直接安装。

朋友小范围测试推荐 Ad Hoc：收集测试设备 UDID，加入 Apple Developer 的设备与 profile，导出 method 为 `release-testing` 的包。首次从 Release 下载 IPA 可通过 Apple Configurator 安装；安装后可在应用“最新版”中更新。也可用 TestFlight 邀请链接分发，但需要另行上传构建并按 Apple 流程开启测试。没有 Apple 签名时，模拟器包和未签名归档不能直接安装到 iPhone，朋友可以先打开 Pages 网页测试。

CI 临时创建钥匙串、读取 profile 的 TeamIdentifier / Name，并在结束时清除签名文件。证书未配置时不尝试 IPA 导出。部分配置缺失时签名步骤明确失败，不伪装成可安装产物。

本地签名构建先在 macOS 钥匙串导入证书、安装 profile，再设置 `IOS_TEAM_ID`、`IOS_PROFILE_NAME`、`IOS_EXPORT_OPTIONS`（绝对路径），执行 `pnpm ios:archive --signed`。可用 `IOS_BUILD_NUMBER` / `APP_VERSION` 设置版本。Bundle ID 修改需同步 Xcode 工程、profile、ExportOptions 与 CI 模拟器启动命令。

## 验证

```sh
python scripts/test-mobile-assets.py
python apps/shell-ios/scripts/test-install-manifest.py
pnpm --filter @coffeeeeffoc/shell-android test:updates
pnpm android:apk
pnpm android:test
# 在远程开关默认关闭的测试设备上运行
pnpm --filter @coffeeeeffoc/shell-android test:settings
```

更新核心检查覆盖稳定版本、完整打包、哈希、大小限制、ZIP 路径越界与缺少首页；设备检查覆盖六个游戏、原生返回、离线加载、持久化存档及设置开关/重载。发布后还需在同签名设备上验证真实 Pages 下载 → 断网重启 → 同签名更高版本 APK → 系统授权安装的完整链路。

iOS 流程执行 Xcode 编译、模拟器安装启动并上传截图，然后执行真机归档；开发者仍需检查截图和真机音频、WebGL、存档与签名安装。

本次本地验证：Android debug/release 均构建成功（release 路径使用本机测试密钥验证），Android lint 无错误，六游戏设备检查与原生设置检查通过；通过注入测试缓存验证私有资源加载、切回内置和存档保持，实际 Pages 清单尚未发布时返回 404 并保留缓存。打包确定性/资源安全检查、格式及工作区依赖检查通过。Windows 无法执行 Xcode；iOS 工程配置已静态检查，编译及签名安装仍需推送后验证。

官方参考：[Android FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)、[安装来源权限](<https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()>)、[WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler)、[Xcode 归档导出](https://help.apple.com/xcode/mac/current/en.lproj/dev23ea8b877.html)。
