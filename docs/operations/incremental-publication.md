# 准确候选版本的增量发布验证

使用 Node 24.21.0 / pnpm 12.6.0。先读取远端 dev 的准确 SHA，获取最新提交，正常合并并保留并行改动。候选必须已经提交；禁止把合并前的验证记录当作合并后结果。

```sh
git ls-remote origin refs/heads/dev
git fetch origin dev
# 必要时正常合并 FETCH_HEAD，解决冲突后重新提交
node scripts/validate-candidate.mjs --base <远端准确SHA> --head <合并后的候选准确SHA>
git push origin <已验证候选SHA>:refs/heads/dev
```

本地 push 的正常 pre-push hook 与候选命令复用 `validatePush`：每对 base/head 使用独立、准确 SHA 的 worktree，递归固定 gitlinks，安装冻结依赖并检查生成输入；不使用脏工作区文件，不以当前 HEAD 或旧 tracking ref 替代实际推送 SHA。多 ref 分别检查，相同 SHA 对去重。候选命令完成后输出含 base/head 的验证记录；失败不会输出通过记录。保存完整命令、日志、环境和该记录。

增量层运行格式、注册、依赖边界检查及直接变更项目的构建/规则测试和实际依赖闭包的类型与 lint。Shell 的有限 jsdom 接入契约覆盖目录、模式参数、重载、独立入口及沉浸消息/返回流程。游戏接入使用已有注册结构化 diff；同一 Shell 目录中的单款注册及 workspace wiring 不算通用共享组件。规则模块可证明纯净时不启动浏览器；游戏界面或无法判为纯规则的本游戏代码检查该游戏。共享包按依赖闭包选择真实消费者。通用 Shell 导航检查词屿与象五子棋两个入口家族，使用真实鼠标和手机触屏走通 iframe/独立入口。选择后的构建不调用会准备全部游戏的 Shell `build:pages`。未知仓库级共享路径或无法识别的注册/工具链变化必须定义范围后重试；不能静默改跑全量，也不能伪报通过。新增分支需明确已有比较基线，hook 不猜基线。

入口测试使用语义选择器与实际页面状态，不依赖皮肤、坐标或自动接受截图。主页必须可见，开始后棋盘可操作，暂停/主页/返回目录路径及未完成拼写恢复须保持。入口和导航行为变更必须同步更新测试契约，行为回归仍应失败。增量门禁不能保证大改零失败，线上 CI/Pages 是独立验收；保留其全量兜底和部署检查。

GitHub API 修改分支不会触发本地 hook。云端、worktree、API 发布也必须在更新 ref **之前**用上述命令验证最终候选 SHA；如果 ref 已变化，重新合并、生成候选并重新验证。当前未启用远端分支保护，因此 API/忽略 hook 的发布只能由流程要求约束，不能声称本地 hook 强制保护所有写入方式。最终交付必须核对 CI/Pages 对应 head SHA、状态和部署 URL；本地通过不等于线上发布完成。

Cocos 输入仍严格要求 Creator 3.8.8，或 source hash 匹配且包含 `dist/index.html`、`dist/build-info.json` 和 `cc.d.ts` 的产物，通过既有验证后才查 Turbo 缓存。`KART_PREBUILT_DIR` / `NIGHT_OVERWATCH_PREBUILT_DIR` 可指向匹配制品。源码/运行素材变化需要 Creator 环境重建；源码未改可复用 Windows 缓存并由 Linux 验证。缺递归 gitlinks/素材、缺匹配制品及编辑器、工具链不符均属于明确环境/输入阻塞，区别于规则/导航断言失败；禁止伪造编辑器、声明或制品来通过。
