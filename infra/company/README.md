# 官网发布与回滚

`apps/company-web` 是现有官网。入口由独立的 [Caddy 运维流程](../caddy/README.md)负责 HTTPS、自动续期、容器和备份。普通官网更新只发布静态文件并原子切换 `current`，不调用 Docker、不重启或重载 Caddy。

当前主域 `nenggongzhiren.cn`，`www.nenggongzhiren.cn` 保留路径跳转至主域。游戏继续使用原有内部入口 `127.0.0.1:8080`；官网不加入游戏网络，`api` / `admin` 尚未开放。不使用游戏的 `deploy:tencent --public` 发布官网。

## 日常操作

在仓库根目录执行，使用锁定的 Node/pnpm 及 Playwright Chromium：

```sh
pnpm deploy:company --check
pnpm deploy:company
pnpm deploy:company --rollback
```

`--check` 只读核对 SSH、DNS 和独立 Caddy 的官网目录标记。正常发布会检查相关源码已提交、运行官网现有构建与浏览器测试、打包上传、校验摘要，然后切换服务器版本并核对两个域名的可信 HTTPS 和准确版本。公网核对失败会报错；服务器本机检查通过不等于公网发布成功。

`--rollback` 使用本地仓库的链接切换脚本，把 `previous` 恢复为当前版本，并检查服务器本机两个 HTTPS 域名。即使上一版来自拆分前，也不会执行上一版内的旧脚本或 Compose。回滚之后仍应从外网检查两个域名。再次回滚会切回刚才的版本。

只在本地构建和打包，不改服务器：

```sh
pnpm deploy:company --prepare
pnpm test:deploy-company
```

官网与部署相关变更需先提交，以便 `site/release.json` 记录准确 `sourceSha`；不要求推送远端。官网原有 1440/1024/768/390/320 宽度、键盘、触屏及无 JavaScript 测试继续保留。

## 配置与目录

根目录 `.env.company.local` 参考 [.env.example](.env.example)，SSH 可复用 `.env.tencent.local`，进程环境优先。两份 env 都被忽略，不进入发布包。无需数据库、COS 或 DNSPod 密钥。备案号校验为完整 `沪ICP备2026053115号-1`，链接至工信部网站。

```text
/opt/small-games/company/
  incoming/                  上传压缩包
  releases/<release>/site/    不可变的公开静态文件
  current -> releases/...    当前版本
  previous -> releases/...   上一版本
/opt/small-games/caddy/      独立入口运维目录
```

官网包输出到 `outputs/company-deploy/`，只有 `site/`、`deploy.sh` 和 `SHA256SUMS`；不包含 Caddyfile、Compose、证书、密钥或游戏代码。静态内容不变时重复发布仍有新的版本记录。

发布先验证全部文件，再在同一文件系统原子替换 `current`。HTTPS 校验失败自动恢复旧链接，其他容器不受影响。发布与 Caddy 运维共用锁，不能并发切换。旧版本和上传包保留，暂不自动清理。

## 首次拆分及注意事项

现有服务器先执行一次 `pnpm deploy:caddy`，将 Caddy 改为挂载官网父目录。首次调整挂载会替换 Caddy 容器，可能短暂中断官网；之后官网更新不再操作该容器。执行前保留旧官网目录和 Compose，并成功创建证书备份。Caddy 部署失败会尝试恢复原配置。

当前命令针对已有官网和已有证书卷的维护；全新服务器需要先准备初始官网版本和两个命名卷，不能把空目录直接当作成功部署。

不要手动覆盖当前版本文件或从旧版本目录运行旧 `deploy.sh`。使用根目录命令回滚，不在官网版本目录执行 Compose。证书卷、自动续期、备份与官网版本无关，详见 [Caddy 运维说明](../caddy/README.md)。

原子切换保证单次文件请求读取完整版本；多个请求跨越发布时间时，旧页面可能需要刷新后取得新资源。未宣称跨请求事务一致性，也不自动删除旧产物。

本次迁移的版本、发布/回滚及备份恢复证据见 [2026-10-16 验收记录](../../docs/operations/company-caddy-separation-2026-10-16.md)。
