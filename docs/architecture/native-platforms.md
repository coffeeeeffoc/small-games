# 独立小游戏平台工程

微信小游戏与 B 站小游戏共用 `packages/native-game-shell`，由 `apps/shell-minigame` 生成每款游戏各自的工程。当前游戏选择见 `apps/shell-minigame/scripts/games.mjs`；不把大厅或其他游戏打进单款工程。

## 目录分工

```text
platforms/
  wechat/       # 微信运行入口、AppID 校验、工程配置生成
  bilibili/     # B站运行入口、渠道功能、工程配置生成
packages/
  native-game-shell/  # 共享输入、媒体、生命周期与 Game Host 组装
apps/
  shell-minigame/     # 选择游戏和平台，构建单款发行工程
games/
  local/game-*/       # 游戏规则、内容与渲染入口
```

每个已接入渠道是独立 pnpm workspace 包，公开运行入口及 `./build` 构建描述，通过包名引用。新增渠道在 `platforms/<渠道名>` 实现适配与工程配置，再注册到 `shell-minigame` 的构建清单；不复制公共 Shell，不预建未知渠道的空目录。游戏不能直接依赖这些平台包，仓库依赖检查覆盖 `platforms/`。海外渠道也按渠道名放在同一目录。

## 运行边界

`GameDefinition<CanvasGameTarget>` → `native-game-shell` → 微信 `wx` / B 站 `bl`。

游戏继续使用 Game Host 的内容、存档、广告和导航契约，不直接访问平台 SDK。共享运行层复用原 B 站宿主的触摸取消、多指输入、前后台暂停、图片与音频清理、存档和激励视频实现。存档以平台及 Game ID 隔离，广告位只存在于 Shell；只有 SDK 明确返回 `isEnded === true` 才完成奖励。

平台入口只处理平台差异：微信直接运行选中的游戏；B 站启动页上报 `launchSuccess`，提供侧边栏及桌面入口。从指定入口进入可每日各获得一枚持久化收藏签，与游戏数值无关；添加桌面成功本身不发奖励。入口判断使用最新 `onShow` 的 `scene`，按北京时间每日幂等。存档读取失败时不覆盖旧记录。

后续平台先接入共享运行层所需的 SDK 端口，再增加平台入口和构建配置。平台能力语义不同的地方在入口转换，游戏不增加平台分支。尚未实现其他平台、内购或登录服务。

## 构建与检查

在仓库根目录执行：

```powershell
# 首款两平台预览
pnpm minigame:build --platform wechat --game moss-garden --preview
pnpm minigame:build --platform bilibili --game moss-garden --preview

# 两平台 × 四款独立预览工程，然后运行实际构建文件回归
pnpm minigame:preview
pnpm minigame:smoke
pnpm --filter @coffeeeeffoc/shell-minigame test
```

## 填写账号后发行

复制 `apps/shell-minigame/release-config.example.json` 为同目录的 `release-config.local.json`（已被 Git 忽略）。按游戏/平台填写 AppID 与激励广告位 ID；不需要在仓库保存 AppSecret。

```powershell
pnpm minigame:build --platform wechat --game moss-garden --config release-config.local.json
pnpm minigame:build --platform bilibili --game moss-garden --config release-config.local.json
```

这里配置路径相对 `apps/shell-minigame`，因为 pnpm 在该包目录运行构建脚本。也可传绝对路径。填写八组配置后可运行 `pnpm minigame:build --all --config release-config.local.json` 一次生成全部正式工程。

本地测试在没有 DOM 和远程传输的 VM 中运行八份实际构建文件，验证游戏操作、音频、暂停、资源隔离和监听清理；单元测试补充存档恢复、广告判断、入口奖励与构建参数拒绝。这些检查不能证明官方工具兼容、真机性能、真实广告库存或审核通过。当前尚无账号 AppID/广告位，未上传或提交平台审核。
