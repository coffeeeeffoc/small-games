# Game 拥有自己的 Dynamic Content schema

公共 `content-schema` package 只定义版本化 Envelope、校验结果和迁移 interface，各 Game 在自身 package 内拥有领域 schema 与迁移实现。Management Service 通过 GameManifest 发现它们，避免中央 schema 随游戏数量增长成为耦合所有 Game 的浅模块。
