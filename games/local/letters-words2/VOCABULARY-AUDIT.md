# 词库与教材对应关系复核

复核日期：2026-10-02。对象为本游戏生成目录、共享 SQLite 源库、`reviewed-units` 源数据，以及记录 SHA-256 对应的原始教材 PDF。

## 发现与修正

1. `build_dictionary.py:describe_list()` 将所有 `WaiYanSheChuZhong_*` 直接标为“孙有中主编”。逐册与陈琳／Simon Greenall 旧版 PDF 词表比较，确认其对应旧版；现改为“陈琳旧版词表，具体印次未核验”，不再作为孙有中新版的候选。SQLite 覆盖报告中因此移除 9 条错误候选关系；这是历史导入词表的覆盖统计，独立核验教材仍以 `reviewed-units/catalog.json` 为准。
2. 历史词表有真实错误，例如七下 `2ussian`（释义为俄罗斯），九上 `broad`（释义为到国外）、`keep x`。核验版分别为 `Russia`（Module 11 · Unit 1）、`abroad`（Module 3 · Unit 1）、`keep`（Module 10 · Unit 1）。
3. 已有同册 PDF 核验词库，因此游戏目录使用其替代重复历史入口，不修改原始采集文件、不靠词序补造单元。替代前校验出版社、年级、册次一致；以后运行同步脚本也不会重新引入这六份错误词表。

| 原历史 ID | 使用的核验教材 ID | 年级／册次 |
| --- | --- | --- |
| WaiYanSheChuZhong_1 | fltrp-chenlin-2011-grade7-upper | 七上 |
| WaiYanSheChuZhong_2 | fltrp-chenlin-2011-grade7-lower | 七下 |
| WaiYanSheChuZhong_3 | fltrp-chenlin-2011-grade8-upper | 八上 |
| WaiYanSheChuZhong_4 | fltrp-chenlin-2011-grade8-lower | 八下 |
| WaiYanSheChuZhong_5 | fltrp-chenlin-2011-grade9-upper | 九上 |
| WaiYanSheChuZhong_6 | fltrp-chenlin-2011-grade9-lower | 九下 |

## 对照范围与结果

| 数据组 | 册数／条目／分组 | 本轮证据与结论 |
| --- | --- | --- |
| 外研陈琳小学三至六年级上下册 | 8／1,063／80 | 核对全部 PDF 哈希和封面；7 册文字层逐词比对 Module 归属，四上扫描词表两页人工对照，未发现错配。按原表保留 Module 粒度，不猜分课内 Unit 1/2。 |
| 外研陈琳初中七至九年级上下册 | 6／2,161／159 | 从固定哈希 PDF 重新提取整份词表，并按原表页码定位正文 Unit，所有条目、单元和页码与现有核验 JSON 一致。七上 PDF 第 122 页为扫描页，沿用已有人工转录。Starter、Revision 单独保留。 |
| 外研孙有中新版 | 12／2,364／74 | 核对全部 PDF 哈希、封面与清单；扫描词表按左右栏 OCR 辅助比对，2,264 条直接命中对应分组，100 条未命中或歧义项查看原图核实；Welcome、Starter、Unit 边界未发现错配。OCR 把 Unit 3 读作 Unit 5 等误报未写回数据。 |
| 人教历史词表 | 13／3,169／0 | 出版社、年级、册次与 kajweb 原始目录及分册 ID 一致；本轮未取得对应版次的教材原书进行逐词核验，仍为历史词表、只可整册练习。九年级是全册，不能当作上册。 |
| 综合词表 | 3／4,643／0 | 保持“综合词表（不按出版社）”，年级和册次为空，不虚构教材关系。 |

更新后共 **42 份词库、13,400 条记录**；核验教材仍为 **26 册、5,588 条、313 个学习分组**。26 册词条文件保留原始字节与下载哈希；本轮改的是历史版次元数据、替代关系和生成目录。

本轮检查针对现有词条的教材归属，不代表已覆盖所有出版年份、印次、出版社或当前在用教材，也不是对全部中文释义、音标进行语言学审校。孙有中新版六下、九下未在本批已核验来源中收录；未以陈琳旧版冒充。人教词表仍缺可靠单元依据。

## 可重复验证

- `python assets/english-dict/完整素材/scripts/test_build.py`：防止陈琳历史词表再被标成孙有中新版候选。
- `python assets/english-dict/完整素材/scripts/verify.py`：原始来源哈希、22 份导入词表及 SQLite 关系。
- `python assets/english-dict/完整素材/scripts/review_fltrp_sun.py --check`：新版转录、分组计数与生成字节。
- `python assets/english-dict/完整素材/scripts/review_fltrp_middle.py --check`：旧版初中条目、页码及单元关系。
- `pnpm --filter ciyu-word-tiles test`：42 份目录的出版社、年级、版次与核验源一致，六组替代关系、全部哈希、完整单元与批次隔离。
- `pnpm --filter ciyu-word-tiles test:library:browser`：全部出版社／年级／书册／单元选项，旧版替代单元实际加载，新版 Welcome 的 31 词、6 批、刷新恢复与缓存离线练习。

原始证据地址及 SHA-256 保留于共享的 `sources/primary-manifest.json`、`sources/fltrp-sun-manifest.json`、`fltrp-middle-sources.json` 和游戏目录各册 `verification.evidence`。此次重建使用本地原始 PDF，未把网上二手整理词表作为核验依据。
