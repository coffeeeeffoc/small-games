# 结构来源与建模核对

本目录替换了原来的 20 个叉槽拼接演示，收录 **10 个有公开结构资料、完整装配形态和可验证拆装路径的互锁拼图**。其中三套为经典六根锁结构，其余为具名设计师的三件或四件互锁，包含十字、阶梯球、实心方块、带内部空位的小盒以及三层套匣。它们属于鲁班锁／孔明锁所对应的 burr / interlocking puzzle 家族；现代设计不冒称中国传统历史款式。

原五关资料检索与核对日期：2026-10-04；新增五关核对日期：2026-10-05。目录面向可玩且忠实的结构，不宣称穷尽全部鲁班锁变体。

## 原创上手练习

第 1 关 `first-lift-v1`「初识 · 一提一合」是单独的原创教学模型，不冒称完整的传统鲁班锁或某位设计师的作品。两根 4×1×1 木条在交叉处各去掉 1×0.5×1 的半槽，单件体积均为 3.5。上方青色横榫沿 Y 轴提起即可分离，沿原路放回即可复原；不要求旋转、组合选择、隐藏钥匙或换轴。初始接触仍有真实阻挡，玩家能直接体验拖动、让位和凹槽配合。

它置于以下十件资料结构之前，总目录为 11 关。原十关 ID 不变，既有存档仍对应原结构。测试验证入门关只需一次单件平移拆开、一次反向平移复原，并可从半程拖动状态继续提示。

## 已收录结构

| 关卡 ID                        | 结构来源                                                                                                                                                                                                     | 原始尺寸或体素                                                                      | 本项目转换                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `burr-interlocking-6-v1`       | [Six-piece interlocking puzzle plan](https://www.craftsmanspace.com/sites/default/files/free-plans-pdf-files/Six-piece%20interlocking%20puzzle%20plan.pdf)，第 2–4 页                                        | 120×20×20 mm 木条；两件 Part 1、两件 Part 2、Part 3 和未开槽 Part 4；最小槽阶 10 mm | 10 mm 对应 0.5 场景单位；完整体积 248 小格，场景体积 31；两对重复件保留，不当成不同形状                              |
| `burr-solid-6-v1`              | [Six-piece burr puzzle without internal voids plan](https://www.craftsmanspace.com/sites/default/files/free-plans-pdf-files/Six-piece%20burr%20%20puzzle%20without%20internal%20voids%20plan.pdf)，第 3–5 页 | 六根不同槽形的 120×20×20 mm 木条；最小槽阶 10 mm                                    | 同上，40+42+38+40+40+48=248 小格；拼合内部无空洞                                                                     |
| `burr-short-6-v1`              | [Six-piece burr puzzle with simple notches plan](https://www.craftsmanspace.com/sites/default/files/free-plans-pdf-files/Six-piece%20burr%20puzzle%20with%20simple%20notches%20plan.pdf)，第 3–8 页          | 102×34×34 mm 木条；最小槽阶 17 mm                                                   | 17 mm 对应 1 单位；18+15+17+16+14+24=104 格；外包络 6×6×6                                                            |
| `knoxli-three-piece-2009-v1`   | [KNOXLI’s 3 Piece Burr](https://www.puzzlewillbeplayed.com/3PieceBurr/KNOXLIs3PieceBurr/)，Roland Koch，2009                                                                                                 | 来源逐层列出 A/B/C：31、31、38 格；外包络 6×6×6；4 个内部空格                       | 逐格转录占用关系，使用保持手性的正交旋转与平移求出完整装配；外形与 104 格六向十字一致，内部缺 4 格                   |
| `crystal-ball-2017-v1`         | [Crystal Ball](https://www.puzzlewillbeplayed.com/3PieceBurr/CrystalBall/)，Andrey Ustjuzhanin，2017                                                                                                         | 来源逐层列出 A/B/C：19、18、17 格；外包络 5×5×5；3 个内部空格                       | 按逐层占用关系重建；完整阶梯球目标为整数格中心满足 `abs(x)+abs(y)+abs(z)≤3`、每坐标在 -2…2 的 57 格轮廓，内部缺 3 格 |
| `min-333-2008-v1`              | [Min 333-1 的完整装配](https://www.puzzlewillbeplayed.com/333/Min333/1/solution.html)，Min S. Shih，2008                                                                                                     | A/B/C 各 9 格，实心 3×3×3                                                           | 原始字母层直接分为三个单件，每格 1 场景单位；练习第一件抽出后两件错位                                                |
| `three-easy-pieces-2011-v1`    | [Three Easy Pieces 的完整装配](https://www.puzzlewillbeplayed.com/333/ThreeEasyPieces/solution.html)，Richard Gain，2011                                                                                     | A/B/C 为 10、10、7 格，实心 3×3×3；来源分离记录 1.4                                 | 每格 1 单位；保留剩余两件沿不同轴依次让位的真实齿口；不是 Min 333-1 换色                                             |
| `beginner-cube-levonen-v1`     | [Basic Cube for Beginners 的完整装配](https://www.puzzlewillbeplayed.com/333/BasicCubeForBeginners/solution.html)，Juha Levonen                                                                              | A/B/C/D 为 8、9、8、2 格，实心 3×3×3；页面未注明设计年份                            | 每格 1 单位；保留第四件两格小钥，三件护榫有各自独立的槽形                                                            |
| `toms-little-box-2009-v1`      | [Tom’s Little Box 的完整装配](https://www.puzzlewillbeplayed.com/333/TomsLittleBox/solution.html)，Tom Jolly，2009                                                                                           | A/B/C 为 11、8、7 格；3×3×3 中央留 1 空格                                           | 每格 1 单位；中央空位留空，不用实心方块外观替代碰撞                                                                  |
| `intricate-puzzle-mochalov-v1` | [Intricate Puzzle 的完整装配](https://www.puzzlewillbeplayed.com/Misc/IntricatePuzzle/solution.html)，Leonid Mochalov                                                                                        | A/B/C 为 214、124、70 格；8×8×8 外包络，24 格内部空腔；页面未注明设计年份           | 每格 0.5 单位；408 小格对应 51 场景体积，保留套壳的内外横挡和缺口                                                    |

[Craftsmanspace 的六根锁总览](https://www.craftsmanspace.com/free-projects/six-piece-burr-puzzles.html)说明六根锁由三组相互垂直的方截面杆构成，也列出了不同槽形及四套制造图。数据采用尺寸事实自行重建几何，不把制造图、图片或原作者文章打包进游戏。现代三件锁在关卡说明和来源链接中保留设计者及年份。

## 几何的可追溯性

`src/levels/burr-models.ts` 中每根六件锁木条先取完整长方体，再减去图纸半开区间 `[min, max)` 中的锯槽。局部长度为 12 或 6，截面均为 2×2。`placements` 保存坐标置换、符号及装配槽位；这些变换的行列式均为 +1，不把镜像当成可旋转的原件。完整装配按 X、Y、Z 三方向各放两根条。`index.ts` 把最后一根未开槽木条放在列表首位，作为通钥；其余名称中的号码对应各数组记录的部件顺序，重复件保留独立编号。

`src/levels/three-piece-models.ts` 中 `layers` 对应来源页面的逐层 ASCII 数据；`#` 是木料，`.` 是空格。数组下标是 Z，同一层的行列是 Y、X。后续只做保持手性的刚体坐标变换。每根木榫内部以相邻体素合并成互不重叠的盒体，绘制和碰撞共用同一份几何。

`src/levels/assembled-models.ts` 保存新增五关来源解答页公开的完整装配字母层。来源每行用 `|` 并排表示 Z 层，本项目拆成每层一个字符串；A/B/C/D 分别是一件连通木料，`.` 保持为空。仅平移到场景中心并按记录比例缩放，不重新猜测零件的朝向和拼法。四种小方块的外轮廓相似，但零件体积、齿口、内部空位、件数或让位顺序不同，不能用颜色变化互相替代。

十一关载入时，所有部件均处于完整装配位置，位移为零。保留原五关的稳定 ID；新增五关分配独立 ID，避免把既有存档套用到不同木件上。

## 可拆解与复原的验证

`src/core/levels.test.ts` 对入门练习和十件资料结构逐一验证：

- 每根木件都是面连通的单一实体，木件内部没有重复体积；
- 完整装配面连通，各部件无重叠，每根木件的体积与原始结构记录一致；
- 固定的独立拆解路径每一步通过连续扫掠碰撞检测，最终所有件彼此分离；
- 同一路径倒序可以完整复原；六根锁包含成组移动，三件锁包含先小幅让位再抽出的步骤。

`src/core/hints.test.ts` 另验证所有关卡的实时提示可完成拆解和复原、离开推荐路线后的复原、浮点拖拽尾差，以及分离后旋转木件的复原。提示从当前几何寻找路径，不把测试见证路线作为强制脚本。

关卡还可提供局部状态规则：双对榫的起始规则解释通钥的作用；Three Easy Pieces 为相扣的 A/B 两件提供三个拆解和四个复原接触区间。区间以 A 榫的位置为参考，整体搬移机关后仍然有效，也包含拖到一半的位置。规则检查当前朝向，再交给同一碰撞系统验证实际动作；第三件没有挪开时不会穿过它执行。条件不符时继续用通用搜索。测试清空操作历史后验证七个半程位置和整体平移后的半程位置，确认它不依赖“当前是第几步”或固定的世界坐标。

## 检索覆盖与暂不收录的结构

[Puzzle will be played…](https://www.puzzlewillbeplayed.com/) 提供按件数、板条、框架、目标外形及设计者分类的互锁拼图目录；本次读取了其[机器可读索引](https://www.puzzlewillbeplayed.com/-/puzzle-index.xml)，并核对三件、六件与板条类别。索引包含数千种条目，且来源目录最近更新日期为 2024-04-04，不能把一次检索称为当前全球所有鲁班锁的清单。以下是实际查阅过、但没有为了凑关卡数直接放入游戏的类别：

| 来源                                                                                                                                                                                                                       | 已核对信息                                                                                 | 暂不收录原因                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同一[六根锁总览](https://www.craftsmanspace.com/free-projects/six-piece-burr-puzzles.html)的 beveled notches 变体                                                                                                          | 80×80×80 mm，含斜切缺口                                                                    | 当前木件和碰撞以正交盒体表示；把斜面填成阶梯会改变锁合与旋转通道，不能称为忠实复原                                                                                                           |
| [Wooden knot puzzle](https://www.craftsmanspace.com/free-projects/wooden-knot-puzzle-plan.html)及 [Knot Burr Puzzle PDF](https://www.craftsmanspace.com/sites/default/files/free-plans-pdf-files/Knot%20Burr%20Puzzle.pdf) | 两件 C 形、一件 O 形；外料 80×60×20 mm；O 孔 50×20 mm；整体 80 mm 立体十字                 | 忠实几何可以局部拆出第三件，但剩余两件的所有整数正交平移可达状态没有分离出口。PDF 的第一步已经预先套好这两件，没有交代最初的套合动作；尚未验证连续斜插／旋转路线，不能交付只能部分拆开的关卡 |
| [Three-Piece Burr Puzzle](https://www.puzzlewillbeplayed.com/444Cross/3PieceBurr/)                                                                                                                                         | 引自 Edwin Mather Wyatt《Puzzles in Wood》(1956)，长度 6；来源明确标注 “Rotation required” | 来源未给可直接复现的完整动作路径；仅增加 90° 自转并不证明所需旋转轴、支点和连续路径均受支持，留待专项复现                                                                                    |
| [18、15、21 件制造图](https://www.craftsmanspace.com/free-projects/3-burr-puzzle-plans.html)                                                                                                                               | 18 件传统条锁，以及 15/21 件 chuck puzzle，含制造与装配图；18 件图纸有 13 步装配图         | 多件锁需要更多组选择与有界提示策略；现有枚举组集合的提示搜索不宜直接扩到 18 件。另有圆形钥匙细节的变体需要不同几何表示                                                                       |
| [6 Board Burr](https://www.puzzlewillbeplayed.com/6BoardBurr/)                                                                                                                                                             | 有 6×4、7×5、8×6 板条、笼框和混合条形变体；记录解数、分离步数及部分旋转要求                | 仅目录条目或图片不足以保证精确槽口和完整可达路径；高步数／带笼模型需要逐一导入制造数据并核验，未作为看起来相似的演示形状凑数                                                                 |
| [Burr of Three Boxes 2x4x6](https://www.puzzlewillbeplayed.com/3PieceBurr/BurrOfThreeBoxes2x4x6/)                                                                                                                          | Andrey Ustjuzhanin，2015；3 件、9 个空格、2.3 步分离记录                                   | 有部件图和编码，但本次没有完成编码格式与制造尺寸的独立核对，优先采用同一作者可直接核对逐层占用数据的 Crystal Ball                                                                            |

后续增加一种结构时，应先收集完整槽口数据、明确装配目标，再通过连续碰撞验证完整拆装路径；名称或外观相似不能代替结构证据。
