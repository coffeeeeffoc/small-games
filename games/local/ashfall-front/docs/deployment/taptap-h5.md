# 灰烬防线 · TapTap H5

当前版本2.0.0，真实Cocos Creator3.8.8 Web Mobile。目标为手机横屏H5，上传方向参数screenOrientation:2；独立入口为dist/index.html。旧Canvas源码只作历史与离线美术输入，发行目录不包含旧入口、fullscreen.js或src/\*.mjs。

## 构建与包体

仓库根目录使用Node24.21.0、pnpm12.6.0和真实Creator3.8.8：

```powershell
pnpm --filter @coffeeeeffoc/ashfall-front build
pnpm --filter @coffeeeeffoc/ashfall-front typecheck
pnpm --filter @coffeeeeffoc/ashfall-front test
pnpm --filter @coffeeeeffoc/ashfall-front test:browser
pnpm --filter @coffeeeeffoc/ashfall-front package:taptap
```

Windows打包使用PowerShell/.NET；逐项读取ZIP并比较资源大小和SHA-256，验证通过才替换outputs/ashfall-front/ashfall-front-taptap-h5.zip。顶层唯一dist目录，内有index.html、Cocos application/引擎/资源bundle、ashfall.css和公共奖励适配脚本。构建目录本身可传官方H5上传工具的gamePath，不能传ZIP路径或仓库根目录。包体清单保留为[历史包体验证](../qa/taptap-h5-package.json)；本轮Web玩法改版后，正式上传前需要重新打包并核验当前源码。

ASHFALL_FRONT_PREBUILT_DIR可复用带dist与cc.d.ts的真实制品，必须通过当前源码摘要及逐文件输出摘要；不接受旧Canvas包或手写引擎声明。HTTP服务器须正确返回js/json/wasm/png/wav的MIME，直接双击file://不算入口验证。

## 应用、广告与发布边界

2026-10-27用户确认App1000862，Developer492506，替代旧998795映射；MCP当次确认广告生效，但方向读取失败，未返回广告位。根配置保留用户手填1054323，归属待核实，当前批次未选择本游戏。奖励已接公共SmallGamesRewardAds：主动补给回复40生命并装备机关枪160发、失败续战恢复50%生命，各限每次战区行动一次；经验升级提供两个免费增益和一个广告超载强化，只在完整观看完成回调后发放。无SDK或广告不可用时仍可免费游玩。解除MCP阻塞后重新查询并核实本应用广告位，通过既有H5配置注入并重新构建，不复用其他应用的ID。

本次未上传、未提交审核、未在TapTap真机或原生小游戏宿主验收。正式上传前重新核对当前应用身份、H5通道和平台要求，准备目录后再按明确发布授权上传。H5包不是原生Tap小游戏，不使用原生game.js/game.json转换流程。素材和当前阶段统一见[publishing/STATUS.md](../../publishing/STATUS.md)，游戏级检查见[verification.md](../qa/verification.md)。
