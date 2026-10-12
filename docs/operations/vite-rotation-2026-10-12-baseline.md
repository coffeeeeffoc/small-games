# Vite 修复的原基线复验与门禁保留

在独立工作树检出 dev 原基线 `a3e7551ec8ab5eb323a97ffe3e4c5481e72dfd11`，
使用相同 Windows 账户、权限与 Node 24.21.0，不安装依赖，实际执行：

```sh
node --test apps/shell-minigame/scripts/alipay-package-budget.test.mjs apps/shell-minigame/scripts/kuaishou-cocos-import.test.mjs apps/shell-minigame/scripts/night-native-project.test.mjs
```

[原始复验日志](./vite-rotation-2026-10-12-baseline.log)记录 53 项中 48 项通过、5 项失败、0 项跳过，退出码 1。
失败与候选的原生聚合测试完全对应：Alipay 测试 163/180 行、Kuaishou 测试 171 行因文件 symlink 返回 `EPERM`；
Night 测试 40/119 行预期 `d1fe27c4d4816adf0ca4d526158e3e92d79bc99c5ee2ac531d9f3c359a4dbdb3`，
实际均为 `8dc663c4ed3afed646c806be4586990a9b0fc6758cb57f9e1cb41135f1ff7307`。
这五项仍是已知失败，不计入本次通过数量。

传递依赖复核：Alipay 预算实现仅用 Node fs/path；Kuaishou 转换校验仅用 Node fs/path/crypto；
Night 适配动态加载自身 artifact 模块，读取 Night 的 assets/scripts/settings/startup/package.json 及三个 Carding 工具源码计算哈希，
不读取根锁或执行 Vite。另两个无 Vite 的 Node 文件为 TapTap 登录与 Cocos 平台配置：
前者到 nine-games-targets、platforms/taptap/login.cjs；后者到上述三个校验及 Carding 素材/artifact 模块，
均无 Vite、Vitest、Rolldown、esbuild、PostCSS 执行依赖。
`a3e7551e` 到本次候选的 shell-minigame/scripts、platforms/taptap、Night 全部源码与 Carding 脚本 diff 为空。
实际调用 Vite parseAst 的 TapTap package/cocos，以及相关 build/input/smoke 六文件仍执行，未因失败删除测试。

main `7446f42f`、dev `a3e7551e` 和本次修复三者的 `runNineNativeChecks` 函数 SHA-256 均为
`438e1bda97334088c157905f8fa4fdcf928cd6aa6ec1206f2f9062c20ecadef0`；
`scripts/nine-native-scope.mjs` 均为 `1dfbbf98bc58a35f27b83a40fed33eb68d81f046682532a0addf86b3cfa71d89`。
原生开关为 1 时的完整 shell-minigame 测试与构建门禁保留，为 0 时仍按原规范 deferred。
main 累计候选保留 Night Web 入口和六个平台原生目标，不以 Vite 证明吞掉已有游戏改动。

## 开发者模式固定用例依赖

`14b98cfe` 的最终候选检查实际通过 26 个 Pages 入口、Shell 旋转、30 个 Vitest 消费者及相关 Node 测试、
8 项 smoke、5 个发布流程专项，以及 31 款游戏的 248 项开发开关检查；随后固定触控用例被缺失的 Wulong City 构建产物阻断，整次候选没有通过。
该共享用例始终打开 Wulong City，增量准备必须构建它，即使游戏不在变更矩阵中。
执行器现显式校验并运行原有 `node build.mjs` 构建，再执行原触控、取消、旋转及外部 iframe 用例；
不删除用例、不扩大产品变更范围。新增候选仍须从准确 base 完整重验。

最终准确候选、正常 pre-push、远端 CI/Pages 和实际部署 SHA 以最终交付记录为准。
原生平台按原规范 deferred，桌面 Chromium 触屏模拟不等于真机或原生平台验收。
