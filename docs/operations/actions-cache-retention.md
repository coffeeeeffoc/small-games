# Actions 缓存保留策略

## 写入与命中

CI quality 和 Pages build 仅在 main、dev、test 的 push 成功且精确键未命中时保存 Turbo；PR 只恢复 Turbo。Pages logic 只恢复 Pages build、再回退 CI，不再产生 logic 快照。测试与构建命令始终执行，缓存未命中不改变门禁。

继续使用带 SHA 的不可变键以及 OS 前缀回退，不能改为永不更新的固定键。GitHub 允许读取当前分支与默认分支的缓存，PR 还可读取 base；main 无法读取 dev 的缓存，因此两条发布分支都保留 writer。参见 [GitHub 缓存范围](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)。

`scripts/prune-turbo-cache.mjs` 的 512 MiB 是单次上传前的本地任务组预算，不是远端仓库总额。pnpm store 按锁文件与 OS/架构复用，Creator 编辑器、导入及已验证源码制品缓存有独立用途，本策略不删除或改变其写入。

## 远端清理

`scripts/prune-actions-cache.mjs` 默认 dry-run；必须明确指定仓库和报告文件。现有已授权的 gh 登录即可用于一次性维护，不创建凭据或提高额度。

```sh
node scripts/prune-actions-cache.mjs --repo coffeeeeffoc/small-games --output cache-preview.json
# 审阅报告中的 before.remove 与 before.keep 后执行：
node scripts/prune-actions-cache.mjs --repo coffeeeeffoc/small-games --output cache-applied.json --apply
```

- 仅管理完整匹配 `turbo-bounded-v1` 的 CI、Pages build、旧 Pages logic 键及完整 40 位 SHA。
- main/dev/test 按分支、类别、OS、cache version 保留创建时间最新的两份 CI/build；已停用的 logic 留一份供回退，其余可清理。GitHub 仍可按自身过期策略删除缓存。
- 当前分支 SHA、最近一小时创建或访问的缓存优先保护。任何其他未完成 workflow 都使本轮清理暂缓，覆盖 PR 可能读取 base/default 回退缓存的情形。
- PR merge ref 必须通过 API 确认已关闭才清理，且仍只清理上述 Turbo 键。未知 key、版本格式、ref、缺失分支、pnpm、Creator 一律保留。
- 完整分页，数量漂移、重复 ID、异常字段或任何读取错误均停止删除。每次按唯一 ID 删除前重新读取完整清单、分支、PR 和活动运行；不会对新出现的候选追加删除。
- 删除请求不自动重试。网络失败可能发生在服务端已经删除之后，必须重新预演并核对 ID。报告在每次确认成功后落盘，保留已经执行的动作。
- GitHub 不提供清单读取与删除的原子事务；刷新保护和一小时缓冲降低竞态风险，不能宣称消除服务器端竞态。清理只影响可重建缓存，不触碰 artifact、release 或源码。

删除 API 需要 Actions write 权限，见 [GitHub cache API](https://docs.github.com/en/rest/actions/cache#delete-a-github-actions-cache-for-a-repository-using-a-cache-id)。新增定期自动清理的持续权限必须单独获得用户授权；手动脚本默认预演不代表自动删除已启用。

## 2026-10-12 初始核对

准确基线 dev/main 均为 `82b4e4c30c74f082b52b9a5ef95facbca2e49508`。分页清单含 30 份，共 10,481,018,944 bytes（9.76 GiB）。usage 接口同一时点给出相同 bytes、28 份；该汇总约每五分钟刷新，数量以完整清单为准。没有 PR ref 缓存或活动工作流。

首轮预演选择 dev 的旧缓存 ID `8816849769`、`8806023365`、`8806031542`，合计 1,591,727,259 bytes（1.48 GiB）。最终实际删除量、清理后清单及发布工作流记录在本次交付证据中，不能以预演数字替代实际删除结果。

执行前 main 的旧 logic ID `8807918568` 也已超过访问保护期。最终逐 ID 删除以上四份共 1,757,617,130 bytes（1.64 GiB）。最后一次汇总读取发生 EOF；没有重试删除，而是重新完整读取：26 份、8,723,401,814 bytes（8.12 GiB），四个 ID 均消失，再次预演候选为零。保留全部 8 份 pnpm、9 份 Creator 相关缓存和 9 份受保护 Turbo 缓存；没有可清理的 PR 缓存。后续 CI 会产生新缓存，发布后的占用另行记录。

本次尚未获得新增持续权限的明确授权，因此未启用定期删除工作流。安全清理脚本和写入减少已生效于代码，自动删除不能视为已启用。

## 验证范围

Node 24.21.0、pnpm 12.6.0。缓存策略测试覆盖分页、空清单、未知键、保留分组、当前 SHA、活动运行、新访问、PR 重新打开、失败关闭及按 ID 删除。工作流契约检查保留两个有界 writer 与 logic 只读；无依赖精确摘要证明只认可本次审阅过的工作流变化，执行条件/命令/权限的额外改变仍被拒绝。

缓存工具使用精确路径登记；未知兄弟脚本阻断。因为本次还修改分类器与验证执行器，准确候选门禁保留既有 `letters-words2`、`xiangqi-five` 导航样本，不扩大为全部游戏回归。缓存未命中情况下的实际构建由候选门禁在独立空 Turbo cache 目录中验证。
