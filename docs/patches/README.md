# 象五子棋改动补丁

`xiangqi-five-experience.patch` 包含从公开版本 `6634abaa161f35bce360311634cc24ac8b1e7920` 开始的三轮象五子棋提交：键盘焦点与全屏修复，六道入门战术题，以及两道红黑红两步连招、快速练习与成长目标。包括独立进度、同题分享及对应验证；第三轮本地提交为 `23c1d65`。

主仓库可推送，但 `coffeeeeffoc/xiangqi-five` 的推送返回 HTTP 401。为避免父仓库指向无法下载的提交，子模块指针仍保留公开版本；补丁让这些源码可从主仓库审查和复现。当前云工作区已经包含完整源码与本地提交，无需重复应用。

在新的干净 checkout 中，可运行：

```bash
git submodule update --init games/submodules/xiangqi-five
git -C games/submodules/xiangqi-five switch -c review/xiangqi-experience 6634abaa161f35bce360311634cc24ac8b1e7920
git -C games/submodules/xiangqi-five am ../../../docs/patches/xiangqi-five-experience.patch
```

使用游戏 README 的规则、构建、键盘与战术浏览器命令验证。浏览器测试需要实际可用的 Chromium；当前云环境可指定 `/usr/bin/chromium`。补丁经过独立临时仓库顺序应用检查，并逐个比较了提交中所有文件内容。

在环境取得独立仓库写入认证后，先推送象五仓库的新提交，再提交并推送父仓库的新子模块指针。补丁本身不会自动改变发行版本、部署站点或更新父仓库指针。
