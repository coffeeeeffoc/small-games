# 忙碌的电工

单人「邻里救急」游戏。线路检修期间，两栋楼的四户家庭共用受限的临时供电支路。居民下班后要做饭、洗澡、工作、看电视和降温；电工协调错峰，同时照顾晚归步道和停车库的照明。场景限定为这些住户和公共用电点，不把几千瓦说成整个小区的正常供电能力。

## 怎么玩

- 点电器直接接电，再点暂停；可以把已供电电器拖到另一台来转接。取消、落空、多指干扰不会提前断开原连接。
- 每户最多三项并发生活需求，逐步出现；居民会说明着急的事情，通电时电器运转、表情和对白改变，完成时道谢并结算。
- 盯住「用电 / 当前可用」和天气预告。太阳能自动补充整条支路，无需选择或争抢太阳能插口。
- 空调与风扇是同一项降温任务的两种做法，切换保留进度。风扇55W，空调1100W；35℃时风扇效果弱，凉雨天可以更快满足舒适需求。界面显示按当前天气估算的剩余服务时间。
- 微波炉、热水器、电饭锅等大负载错开；可协商请求有两次延后机会，最多15游戏秒且不跨下一批需求。一次应急电池输出1.5kW，支援8游戏秒。
- 超载积热至60会跳闸。错过太多住户请求或漏掉一组公共照明会失败。步道/车库照明服务的是一批晚归居民/进库车辆，服务窗口结束后释放功率。
- 20班包含夏日、冬夜、阴雨、晚归场景，住户的电器组合轮换。每班从八条有限且已验证的天气序列中随机选择；同天气重试可复盘，也能主动换天气。没有商业援助也能达到通关目标。
- 声音、减少动态、暂停/前后台冻结、键盘辅助、手机触摸、浏览器真实全屏和三种装饰外观继续可用。

## 功率与物理边界

显示的是电功率 W/kW，不能叫“度电”。1度电=1kWh；本作限制同时用电的功率，不是消耗100度电的电量关卡。

| 设备 | 本作工作输入功率 |
| --- | ---: |
| 手机充电 / 电脑 / 电视 | 20 / 180 / 90W |
| 电饭锅 / 微波炉 / 热水器 | 700 / 1300 / 2000W |
| 空调 / 风扇 / 电热毯 | 1100 / 55 / 80W |
| 洗衣机 | 500W，短暂启动按800W处理 |
| 步道路灯组 / 车库引导灯组 | 360 / 240W |
| 通信、控制等不可调基础负载 | 80W |

这些是代表性设备配置，不是所有家电的统一功率。空调参考[小米1.5匹变频机规格](https://www.mi.com/aircondition/third/specs)的1090W额定制冷输入，取整为1100W，不能把3500W制冷量当耗电功率。两秒启动只表示未产生有效降温的延迟，没有人为放大成固定压缩机浪涌。

屋顶为6块450W组件，总装机2.7kWp，组件面积约12平方米（不含安装间距和检修通道）。参考[天合450W组件规格](https://static.trinasolar.com/sites/default/files/VertexS-450W.pdf)。游戏里的交流侧输出为晴天2.2kW、多云0.65kW、阵雨0.12kW、夜间0；都低于标称装机容量。这些是游戏选用的天气工况，不是对真实所在地天气的发电预测。真实输出还受辐照、温度、朝向、遮阴和逆变损耗影响，见[美国能源部光伏系统说明](https://www.energy.gov/cmei/systems/photovoltaic-system-design-and-energy-yield)。

ponytail: 简化边界：生活任务、天气及应急支援的时长压缩为90/135秒一班；舒适进度与电闸热量是游戏模型，不用于估算真实电费、房间温度或保护器整定。当前需求由每45秒一批的有限事件表构成；扩展更长开放式值班时再改连续到访排程。

## 运行与验证

在仓库根目录运行：

    pnpm --filter @coffeeeeffoc/game-building-power dev --port 4176
    pnpm --filter @coffeeeeffoc/game-building-power test
    pnpm --filter @coffeeeeffoc/game-building-power typecheck
    pnpm --filter @coffeeeeffoc/game-building-power lint
    pnpm --filter @coffeeeeffoc/game-building-power build
    pnpm --filter @coffeeeeffoc/game-building-power smoke

独立入口 http://localhost:4176/，大厅路由 #/games/building-power。smoke使用已安装Chrome，针对构建产物操作；先运行test以生成整班输入见证，产物写入test-results/building-power。BUILDING_POWER_URL可指定大厅入口。

验证覆盖20班×8天气的无援助可通关调度、第一班每600ms至多一次操作的八种天气、全开跳闸、零服务失败、公共照明必保、功率边界、动作重放、迁移存档、输入事务、奖励幂等、暂停释放，以及四种窄屏尺寸的完整可操作布局。浏览器脚本通过真实输入完成第一班并刷新验证进度。自动化证明规则有解和功能正常，不代表真人试玩已确认“好玩”。

保存键仍为building-power:progress和building-power:last-run。v2保留旧解锁、装饰币、外观与设置；旧版星级/成绩保存在legacyScores，新规则成绩另计。重放记录关卡规则版本、天气种子和tick动作，不提供跨进程局中续玩。

## 原生预览

    pnpm minigame:build --platform wechat --game building-power --preview
    pnpm minigame:build --platform bilibili --game building-power --preview
    pnpm minigame:build --platform douyin --game building-power --preview
    node scripts/native-game-smoke.mjs --standalone --game building-power

原生VM检查真实打包脚本的输入、转接、取消、多指隔离、前后台冻结、失败重试、整班获胜、结算、保存和释放。输出在apps/shell-minigame/dist/<platform>/building-power，正式发布需要渠道真实AppID。官方开发工具、真机、真实广告库存和线上发布仍未验收。
