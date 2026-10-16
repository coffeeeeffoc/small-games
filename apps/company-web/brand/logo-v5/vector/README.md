# 能工智人 SVG 版本（第五版图形）

- logo-symbol-gradient.svg：可编辑渐变无字标，蓝青主体与橙色右侧星
- logo-symbol-monochrome.svg：可编辑深蓝单色无字标
- comparison.png：上方原 PNG、中间渐变 SVG、下方单色 SVG
- gradient-preview.png / monochrome-preview.png：SVG 的透明 PNG 渲染预览

两份 SVG 均使用真实闭合曲线路径，不含内嵌 PNG、字体、脚本或外部图片依赖。viewBox 为 0 0 960 490，可等比例缩放。在矢量编辑软件中可修改颜色、渐变、路径和高光图层。单色版只含 N 和星两个主体路径。

## 还原与区别

轮廓从已批准第五版透明母版提取后简化并平滑；清除了底缘极少量地面反光残留。与 PNG 的二值轮廓重叠比（IoU）约为 98.65%，非逐像素完全一致。N 的结构与右侧星的相对位置保留。

渐变版是更简洁的矢量表现，使用少量渐变和高光形状近似蓝青/橙金效果，不复刻 PNG 中复杂玻璃折射。官网当前继续用原 PNG；SVG 可存档、用于大尺寸排版及单色场景。此次没有重绘中文字标，也没有替换字体。

## 检查

- XML 结构有效；无 image 元素、data URI、脚本、外部链接
- Inkscape 正常渲染，两主体均闭合且互相独立，无意外洞
- 单色栅格检测为两个连通主体：N 和星
- 32px 宽度测试可保留主体和星，但极小尺寸不会显示完整材质细节
- Chromium 实测因本次执行环境无法启动浏览器而未完成；SVG 使用标准 path、linearGradient、clipPath，不使用滤镜或特殊字体

各文件哈希见 manifest.json。
