# 第五版 Logo 入库与官网使用

生产素材来自用户批准的第五版 N 与右侧星图形；没有重新生成或重画。完整素材包 Library ID 为 `libfile_5c644fefe774819184f9e566a1040b40`，ZIP SHA256 为 `843113d1ea095e9643a11cfe9dedc98479fb7c0496c714a48048463652162cd1`。源确认图为 `libfile_90f382db8bf48191847da31fd0d61dbb`。

全部 30 个交付文件已下载到 Windows 本地并核对清单、尺寸与 SHA256。独立 Library 无字 1024 PNG `libfile_ae92a89a7c7c8191976424b13d739b84`、带字 1024 PNG `libfile_8bf7f497fef48191a15a53921a6b04ce` 与 ZIP 内对应文件逐字节一致。已实际查看两个主 PNG 的像素。

- `masters/`、`png/` 和 `icons/` 为生产素材，保留所有最终变体。
- `qa/` 为白底、深底、联系表和 favicon 验证图，不作为生产标识。
- 官网仅复制 `png/logo-symbol-512.png` 与 `icons/favicon.ico` 到 `public/`。公开文件名包含内容摘要；页面继续使用既有布局，图片用 contain 保持比例。
- 此目录位于 Vite public 之外，不自动进入页面下载、官网构建或任何小游戏包。带字版和其余尺寸按需人工选用。
- 素材为 PNG/ICO 栅格文件。960 像素宽母版生成的 1024/2048 版本为等比放大，不是原生矢量图。16px favicon 的星仅少量像素可见，不为小图擅自改动已批准图形。

`README.md` 仅做仓库 Markdown 格式规范化，文字语义未改；manifest 记录其原交付摘要和规范化后摘要。所有 PNG/ICO 字节保持原交付内容。

追加的真正 SVG 包来自 `libfile_96c9ea70bc6c8191a00b8ab355737e46`：渐变版 `libfile_d6de86e1afc48191bf1bd47a95a707ce`、单色版 `libfile_c4093ca3e4188191a82be89fc4c6f440`。其两个 SVG 保存在 `vector/svg/`，渲染预览与对比图在 `vector/qa/`，独立 manifest 保留交付摘要、当前摘要和原文件名。N 与星两个主体轮廓闭合，渐变版保留一条开放的高光描线；没有内嵌图片、字体、脚本或外链。渐变效果较 PNG 平面，源包报告轮廓 IoU 约 98.65%，不能称为完全复刻。SVG 仅归档，不替换官网 PNG；带字 PNG 保留原字形。

消费端已补 Chrome 155 实测：两个 SVG 均按 960×490 解码显示，无加载错误；[截图与记录](../../docs/design/logo-v5/svg-browser/receipt.json) 与源包的历史检查区分。官网本地浏览器验证覆盖 1440/1024/768/390/320 宽度、触屏、键盘和无 JavaScript，且实际检查公开构建没有归档素材。
