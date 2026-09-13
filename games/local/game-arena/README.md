# 秋夜斗蛐蛐

Game ID 仍为 `arena`。独立网页、Shell 内嵌和 Bilibili Canvas 共用同一套实时战斗规则。

挑选稳健、快须或重牙斗虫，调养两次后开盆，连续挑战五擂。按住拨草／空格蓄势，在金色区松手扑咬；对手抬头后等半拍，点击闪避／A；安全空当按住回气／S。离对手太远会扑空，过度蓄势消耗体力，回气时受击更重。单局限时 60 秒，以剩余斗志比例判定；相同则我方负。

胜负由实际出手决定，结算只奖励一次。暂停、切后台和取消触控都会取消蓄势，不会偷偷攻击。游戏内可静音，第一次主动操作解锁声音。七段本地 WAV 为程序合成的虫鸣、摩擦、碰撞及结算音色；场景、砂土纹理、蟋蟀关节和草梗均由 Canvas 绘制，无远程素材依赖。它是带夜市氛围的动作游戏，并非生物行为模拟。

```powershell
pnpm --filter @coffeeeeffoc/game-arena dev --port 43117 --strictPort
```

另一终端运行：

```powershell
pnpm --filter @coffeeeeffoc/game-arena test
pnpm --filter @coffeeeeffoc/game-arena build
pnpm --filter @coffeeeeffoc/game-arena lint
node scripts/arena-playtest.mjs
pnpm --filter @coffeeeeffoc/shell-bilibili build
node apps/shell-bilibili/scripts/smoke.mjs arena
```

浏览器检查使用已安装的 Chrome，覆盖真触控、取消与移出释放、键盘、闪避、音频启停、后台暂停、胜利存档及 390/320px 首屏布局。截图输出至 `.tmp/arena/`。可通过 `ARENA_URL` 指向构建后的预览地址。
