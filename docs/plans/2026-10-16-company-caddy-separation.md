# 官网发布与 Caddy 运维拆分 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 官网发布和回滚只切换静态版本，Caddy 容器、证书及每日本地备份独立运行。

**Architecture:** 保留现有 `company-web` Compose 项目及证书卷名称，Caddy 配置迁至 `/opt/small-games/caddy` 的独立版本目录。Caddy 只读挂载官网稳定父目录并读取 `current/site`；官网发布通过同文件系统的原子符号链接替换生效。仅支持当前官网，不增加多站点管理。

**Tech Stack:** Node.js、Bash、Docker Compose、Caddy、Python、systemd。

---

### Task 1: 分离发布包和入口运维

- 修改 `scripts/deploy-company.mjs`、`infra/company/deploy.sh`：官网包仅包含静态文件、发布脚本和摘要；服务端先校验，切换链接后验证两个 HTTPS 域名，失败恢复旧链接；回滚不执行旧版本内的脚本。
- 新建 `scripts/deploy-caddy.mjs`、`infra/caddy/deploy.sh`：独立生成/部署 Caddy 配置，挂载稳定父目录，显式复用两个已有命名卷。迁移失败恢复旧 Compose 配置；校验失败不修改在线容器。
- 保留旧版本和旧配置，以便迁移失败时恢复；不停止游戏容器，不开启 api/admin。

### Task 2: 独立备份和文档

- 将 Python 备份及 systemd 配置从 `infra/company` 移至 `infra/caddy`，备份配置来源改为 Caddy 自身的当前版本，保留每日 03:30 上海时区、30 天本地保留与私钥权限。
- 更新两个 README、官网 README、`.env.example`、根部署命令及精确发布范围；记录 ADR-0014。

### Task 3: 验证事务和发布边界

- 更新 `scripts/deploy-company.test.mjs`、`infra/company/deploy.test.sh`，覆盖成功、显式回滚、HTTPS 失败回退、首次失败及摘要损坏；假 Docker 命令一旦调用即失败。
- 新增 Caddy 运维事务测试，覆盖配置错误、端口冲突、启动失败及旧配置恢复；扩展备份来源测试。
- 运行 `pnpm test:deploy-company`、发布范围测试及修改文件的格式检查；候选提交后运行官网原有构建/浏览器检查。

### Task 4: 迁移与在线验收

- 记录现有容器、证书指纹、卷和官网版本，先成功创建本地备份。
- 独立部署 Caddy，验证可信 HTTPS、同一证书卷和独立备份；迁移 Caddy 挂载可能短暂影响官网。
- 使用新流程发布官网，演练回滚再恢复新版本；每次核对 Caddy 容器 ID/启动时间不变、游戏容器及内部健康不变。
- 保存验证记录，提交代码；不推送远端，不修改 GitHub Pages。
