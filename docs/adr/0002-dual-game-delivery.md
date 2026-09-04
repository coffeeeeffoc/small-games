# 按 Shell 能力采用双重 Game 交付

可信的构建期 Game 以进程内 package 装载，Web Shell 可通过沙箱 iframe 运行 Game Catalog 发布的远程 Game Artifact；B 站 Shell 只能装载审核代码包中预声明的 Game/分包，动态接口仅更新 schema 与资源。这样保留 Web 运行时升级能力，同时遵守 B 站代码包不可在运行后动态修改的限制。
