# iOS Shell

使用系统 WKWebView 嵌入与 Android 相同的六个静态游戏，支持 iPhone / iPad、持久化 Web 存档、返回目录和重新加载。原生 `app://localhost/` 路由处理模块、图片与音频请求；不依赖运行中的开发服务。

此版本提供 iOS 离线壳和构建路径。Android 的 APK 自更新及 GitHub 资源切换设置不移植到 iOS；iOS 安装与更新使用签名 IPA / TestFlight / App Store。

需要 macOS、完整 Xcode 和其命令行工具、Node 22+、pnpm；Windows 上使用 GitHub Actions 的 `Build mobile apps` 流程。

```sh
pnpm games:init
pnpm install --frozen-lockfile
pnpm ios:simulator
# 未签名真机归档，不可直接安装
pnpm ios:archive
# 已导入证书和 provisioning profile，并设置签名环境变量后导出 IPA
pnpm ios:archive --signed
```

产物位于 `apps/shell-ios/dist/`：`SmallGames-simulator.zip` 为模拟器 App；`SmallGames.xcarchive` 是归档；只有配置签名后才导出 `.ipa`。证书、profile、分发方式和可安装设备必须匹配，参见 [移动端构建与更新](../../docs/mobile-builds.md)。

运行构建脚本生成 `web/` 后，也可直接打开 `SmallGames.xcodeproj`，选择 SmallGames scheme 并配置自己的开发团队。在真机上验证六个游戏的音频解锁、WebGL、横竖屏、后台恢复及升级后存档；模拟器编译与启动截图不能替代这些检查。
