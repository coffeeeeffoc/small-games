# pnpm 12 迁移记录

2026-09-29，在 `codex/pnpm-12` 工作树完成迁移。全局默认 Node.js 为 **24.21.0 LTS**，pnpm 为 npm `latest` 指向的 **12.6.0**，均通过 Volta 安装。其他工作树仍服从各自的版本声明。

## 改动范围

| 位置                                               | 改动                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 根 `package.json`                                  | 固定 pnpm 12.6.0、Volta Node 24.21.0，Node engines 提升至 24.21.0；删除过时的 Volta pnpm 8 声明   |
| 根与 delivery 的 `.npmrc`                          | 删除旧 `use-node-version`；由 Volta、CI、Docker 显式选择 Node                                     |
| `pnpm-workspace.yaml`                              | 仅允许 esbuild、sharp、workerd 的依赖构建脚本；保留默认安全策略                                   |
| 根及六份独立锁文件                                 | 经 pnpm 9 转换旧 v6 锁文件，再迁移至 pnpm 12 格式；保留各 Game 独立安装能力                       |
| Turbo                                              | 2.5.6 → 2.11.5，支持 pnpm 多文档锁文件；安装生成的发布时间例外仅限该版本及其六个原生平台包        |
| `scripts/check-game-config.mjs`                    | 从多文档锁文件读取最后的项目依赖图；回归测试仍拦截缺失的 Shell 链接                               |
| Shell Web、Workspace Agent、游戏检查、腾讯部署脚本 | 直接执行 pnpm 原生可执行文件，移除用 Node 解释 pnpm 的旧调用方式                                  |
| 根四份 GitHub Actions 工作流                       | Node 统一至 24.21.0，pnpm 从根 `packageManager` 读取                                              |
| 腾讯 Dockerfile                                    | Node 24.21.0、pnpm 12.6.0、独立的 pnpm 12 BuildKit 缓存；保留 frozen/prod/ignore-scripts 安装约束 |
| 本地 Game 与三个 pnpm 子模块                       | 同步现有版本声明、独立锁文件、CI 与启动文档；tower-defense-game 增加依赖构建许可                  |

根锁文件迁移前后的直接依赖解析版本比较，只有 Turbo 发生版本变化。未批量升级游戏依赖。`fishing` 的独立 npm 安装流程、历史测试报告和软著材料保持原样。

## 验证

以下是迁移工作树首次验证的记录，执行环境为 Windows / PowerShell、Node 24.21.0、pnpm 12.6.0。当时夜航改动尚未完成；移植到 main 时保留 main 后续的夜航修复和 Pages 超时调整，这些历史失败不代表移植后的 main 状态。

| 检查                                                  | 结果                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 根冷安装、再次 `pnpm install --frozen-lockfile`       | 通过，原生依赖安装脚本成功                                                                         |
| `pnpm check:games` 与 `--artifacts`                   | 39 个 Game，0 个问题                                                                               |
| 游戏配置、平台进程、腾讯部署脚本测试                  | 31/31 通过                                                                                         |
| Workspace Agent 测试                                  | 16 项通过，包括真实 pnpm 启动及失败退出码传播                                                      |
| 依赖边界检查及边界测试                                | 通过，8/8 测试通过                                                                                 |
| Turbo typecheck/test/contract/integration/build/smoke | 192/194 任务成功；失败项见下文                                                                     |
| lint                                                  | 87/87 任务成功                                                                                     |
| Pages 构建                                            | 52/52 任务成功                                                                                     |
| 三个 pnpm 子模块独立冷安装、测试、构建                | 全部通过；office-slacking 24 项、xiangqi-five 20 项测试通过，tower-defense-game 规则及交互检查通过 |
| 六份嵌套锁文件的独立 frozen 检查                      | 通过                                                                                               |
| 腾讯后端打包上下文及生产依赖 frozen 安装              | 通过，安装 228 个生产依赖包                                                                        |

Pages 浏览器验证中懒加载检查通过；33/34 个独立 Game 的桌面嵌入及手机触控通过，其中 rule-thief 在前一项失败后单独补验通过。

### 未通过与未验证项

- `night-overwatch` 的既有未提交改动存在 11 个类型错误及 8 个规则测试失败；在旧 Node 24.12.0 下也复现。迁移没有修改这些游戏源码或测试。
- `pnpm test:pages` 在同一 Game 启动后的 `press('help')` 断言超时，当前开发界面与既有 Shell 测试预期不一致，因此完整 Pages 门禁仍未通过。
- Docker Desktop 的 Linux engine 管道不可用，因此没有完成 Linux Docker 镜像构建。Windows 下后端生产依赖安装通过不能替代此项。
- 本地验证使用匹配源码的卡丁车预构建产物，以及当前夜航源码经本机 Cocos Creator 构建的产物。没有执行远程 CI、部署或原生手机验收。
- 详细本地日志位于忽略目录 `.scratch/pnpm12/`。
- 自动审批策略拒绝了清理验证产物的命令，未提供具体原因。以下文件因此保留，不属于迁移源码：carding-car 与 night-overwatch 的 `cc.d.ts`，night-overwatch 的 `CameraMath.ts.meta`、`Flight.ts.meta`、`reports/web-mobile-size.json`，ghost-shift-manager 的 `docs/rules-report.json`，rule-thief 的 `docs/rules-check.json`。提交迁移时应与原有夜航开发改动一起排除。

## 子模块发布顺序

三个子模块已各自建立本地 `codex/pnpm-12` 分支及提交，尚未推送：

| 子模块             | 本地提交                                   |
| ------------------ | ------------------------------------------ |
| office-slacking    | `93ff827a71160a2df06aa4c6b95c91f0c1fa8ced` |
| tower-defense-game | `b3966ed4c0b59061ed03d0e1738b1713977e8b6e` |
| xiangqi-five       | `6634abaa161f35bce360311634cc24ac8b1e7920` |

发布时先让子模块提交在远端可获取，再推送父仓库的 gitlink，避免递归克隆找不到提交。
