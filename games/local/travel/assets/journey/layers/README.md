# 连续景深版本：素材待处理

用户要求保持部分景物连续不变，以远近不同层次逐渐过渡。新版已实现一个连续相机，共用远山/天空/湖面，六个独立中景和七个共享近景实例；整张画面不交叉淡化。

- 新实现暂存于根目录 `journey-depth.mjs` / `journey-depth.css`，计算自检为 `journey-depth.test.mjs`。
- 当前 `journey.mjs` / `journey.css` 保留可运行的整图版，等待透明素材后再切换。
- `distant.webp` 是已完成的共享背景。
- 七张 `source-*.png` 为内置 imagegen 编辑生成的中近景源稿。多次输出均为 RGB，棋盘格是实际像素，没有 alpha，因此没有伪装成最终透明素材。
- 正在等待用户明确同意使用本地抠图工具；未执行本地背景去除。批准后保留源稿，输出七个同名去掉 `source-` 前缀的透明 WebP，检查灰瓦、白墙与植物细节没有误删。
- 图层就绪后，用 depth 文件替换当前运行文件，接通六站浏览/实时视差明信片，再运行 `node checks/journey-check.mjs` 与 `node checks/journey-continuity.mjs`。连续性浏览器检查尚未运行，不能视为已通过。

原始生成及编辑提示词分别见 [前三站](prompts-a.md)、[后三站](prompts-b.md)、[共用远近景](prompts-shared.md)。原始完整插画仍在上一级目录。
