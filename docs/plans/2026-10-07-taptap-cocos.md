# TapTap Cocos 本地构建与 CI Implementation Plan

**Goal:** 保留现有工作区，生成两款真实 Creator 3.8.8 / 官方 v1.2.2 转换预览，自动记录来源与路径，补齐准确 SHA 的 CI 制品验证。

**Architecture:** 复用 native staging、Creator builder、Tap 登录 staging、inventory 和增量门禁。官方插件固定下载 SHA256；转换后的 JS 用相同官方转换器重放复验，二进制资源仍逐字节检查。CI 在同一次运行的准确 checkout 上生产与消费制品，不接收外部分支或任意 run 的制品。

**Tech Stack:** Node 24.21.0、pnpm 12.6.0、Creator 3.8.8、TapTap 插件 1.2.2、GitHub Actions。

1. 读交接及发布约定，fetch dev 并检查根仓库及子模块；保留象五子棋现有 gitlink 差异。
2. 下载官方插件，核对版本与固定 ZIP 指纹，安装插件冻结依赖；实际构建 WeChat 源工程，记录 canonical/native hash、配方和完整文件清单。
3. 调用插件实际导出的转换函数，独立接入空身份预览登录；自动配置本地忽略路径。严格检查源文件、转换文件、资产及 ZIP，保留官方工具/真机未验证标记。
4. 补齐 CI 同 SHA 生产、下载及复验；测试版本/路径/篡改/旧制品拒绝，运行相应增量校验。
5. 更新交接记录，列出 AppID、后台登录、Secret Store、官方开发工具和真机步骤。未经最终候选门禁通过不推送。
