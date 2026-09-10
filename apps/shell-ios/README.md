# iOS Shell

使用系统 WKWebView 嵌入与 Android 相同的六个静态游戏，支持 iPhone / iPad、持久化 Web 存档、返回目录和重新加载。原生 `app://localhost/` 路由处理模块、图片与音频请求；不依赖运行中的开发服务。

“最新版”入口显示当前版本，查询 GitHub 最新测试版并打开发布页；发布包带有 Ad Hoc 安装清单时，可以直接唤起系统安装。未配置 Apple 签名时提示暂无可安装包，并提供网页版测试链接。安装设备必须包含在签名 profile 中。Android 的 GitHub 资源缓存切换设置不移植到 iOS。

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
