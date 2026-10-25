# 器物纹样生成记录

工具：内置 imagegen（2026-10-25）。下列十张图是本项目生成的平面纹样素材，不是实物照片。使用 Three.js 离线旋转曲面与釉面光照烘焙为 100 张透明 WebP；运行时仍由 Cocos 显示，不加载 Three.js。源纹样位于 `textures/`，成品位于 `../../assets/vessels/`。

共同提示词：

> Use case: product-mockup. Create a single square production ceramic/glass albedo texture map (flat unwrapped painting, NOT a photo of an object). Full bleed flat evenly lit surface. Main hand-crafted decoration in central 70 percent; elegant fine horizontal ornamental borders across top and bottom 10 percent. Left/right edges plausibly wrap on a cylinder. Extremely fine exquisite museum quality artisan detail, not vector clipart, not geometric cartoon. NO object silhouette, no perspective, no shadows, no 3d lighting, no frame, no letters or labels. Will be wrapped onto physically shaped ceramic game objects.

- `blue-white.png`: deep cobalt blue underglaze peony blossoms, lotus scrolls and elegant curling foliage, individually painted with delicate brush shading, white porcelain negative space, Ming inspired craftsmanship.
- `landscape.png`: cobalt blue Chinese shanshui landscape, distant misty mountains, pine trees, a small pavilion and a river, exquisite fine ink brushwork, pale blue washes and generous ivory negative space.
- `famille-rose.png`: famille rose enamel peonies, tiny spring birds and flowering branches, soft rose pink coral flowers with jade green leaves, delicate traditional overglaze brushwork, generous warm white negative space.
- `red-fish.png`: copper red underglaze slender koi carp swimming among fine water plants, elegant brushwork, rust red and vermilion, white porcelain negative space.
- `celadon.png`: restrained bamboo leaves and slim stems painted in soft deep jade on pale celadon glaze, very delicate subtle glaze crackle, sage green and pale jade, uncluttered.
- `star-glass.png`: art glass decoration of a deep indigo and cyan night sky with delicate tiny warm gold stars, wisps of blue cloud, rich lapis blue translucent luminous material, no text.
- `amber-glass.png`: amber art glass surface design, elegant arabesque leaded floral window tracery in bronze and warm honey gold, subtle golden translucent amber variations, intricate fine detail.
- `rose-crystal.png`: rose pink and lavender art glass, subtle refractive crystal facets and finely etched white frosty flowers, elegant understated faceted glints, no harsh black lines.
- `silver-moon.png`: silver and pale blue decorative mirror enamel, delicate silver moon amid flowing pale blue cloud scrolls, engraved silver filigree, luminous pale silver background.
- `gold-flowers.png`: midnight cobalt blue glazed porcelain adorned with exquisite fine gold peonies, trailing golden leaves and thin golden tendrils, rich royal blue negative space, elegant museum quality gilding.

青花首张完整提示词：

> Use case: product-mockup. Create a single square 1536x1536 production ceramic albedo texture map (flat unwrapped painting, NOT a photo of a vessel). deep cobalt blue underglaze peony blossoms, lotus scrolls and elegant curling foliage, individually painted with delicate brush shading, white porcelain negative space, Ming inspired craftsmanship. Full bleed flat evenly lit surface. Main hand painted decoration in the central 70 percent; finely detailed horizontal ornamental borders across top and bottom 10 percent. Left and right edges continue plausibly for wrapping on a cylinder. Real artisanal brush-painted ceramic ornament, high detail, tasteful and refined, never vector clipart, never repeated identical cartoon flowers. NO vase silhouette, no perspective, no shadows, no 3d lighting, no frame, no text or labels. This will be wrapped onto physically shaped porcelain game objects.

其他九张按共同提示词插入各自主题描述生成。重新烘焙：在本游戏目录执行 `pnpm art:render`（需要已安装的 Playwright Chromium）。正常构建直接核对并复制成品，不重新生成美术。
