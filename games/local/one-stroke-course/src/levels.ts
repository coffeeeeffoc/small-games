export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Challenge =
  | { kind: 'key'; position: Point; noInk: Rect }
  | { kind: 'gate'; x: number; width: number; closed: number; travel: number; open: number; offset?: number }
  | { kind: 'parking'; left: number; right: number; edge: number; speed: number; hold: number }
  | { kind: 'charge'; x: number; y: number; width: number; speed: number; hold: number }
  | { kind: 'saw'; x: number; y: number; amplitude: number; period: number; radius: number; offset?: number }
  | { kind: 'wind'; area: Rect; force: number };
export type Level = {
  id: string; name: string; lesson: string; hint: string; start: Point; end: Point;
  solids: Rect[]; hazards: Rect[]; stars: (Point & { id: string })[];
  inkBudget: number; parInk: number; parTime: number; slowTime: number; reference: Point[];
  challenges: Challenge[];
  alternate?: Point[];
  guide?: string;
  alternateGuide?: string;
};
export const WIDTH = 1100, HEIGHT = 560, TRACK_RADIUS = 6, BALL_RADIUS = 14;
export const RULES_VERSION = '1.2.0';
const p = (x: number, y: number): Point => ({ x, y });
const make = (id: string, name: string, lesson: string, hint: string, route: number[][],
  stars: number[][], inkBudget: number, parInk: number, solids: Rect[] = [], hazards: Rect[] = []): Level => ({
  id, name, lesson, hint, start: p(155, 410), end: p(955, route.at(-1)![1]), solids, hazards,
  stars: stars.map(([x, y], i) => ({ x, y, id: `${id}-${i}` })),
  inkBudget, parInk, parTime: 4, slowTime: 16, reference: route.map(([x, y]) => p(x, y)),challenges:[],
});
export const levels: Level[] = [
  make('connect', '简单连接', '第一笔，交给你', '从左侧圆环起笔，接到右侧圆环。平坦的线最容易试跑。',
    [[155,410],[955,410]], [[330,382],[560,382],[810,382]], 1060, 815),
  {...make('jump-key', '借坡取钥', '路画好了，还要跳得刚好', '金色虚框内不能画线，但小球可以进入。起跳取钥匙，再落回赛道解锁终点。',
    [[155,410],[290,410],[410,370],[560,370],[750,410],[955,410]], [[310,375],[560,281],[815,382]], 1010, 840),
    challenges:[{kind:'key',position:p(560,296),noInk:{x:495,y:240,w:130,h:78}}],
    alternate:[[155,410],[955,410]].map(([x,y])=>p(x,y)),
    guide:'缓坡托高小球：向右加速，靠近金框之前起跳，在空中取钥匙后落回线条。',
    alternateGuide:'直线更省墨，但钥匙更高：在金框前起跳，让球在最高点附近碰到钥匙。'},
  {...make('saw-crossing','巡游锯轮','危险，也会移动','锯轮上下巡游。观察节奏，在锯轮远离赛道时通过；低位路线和高位路线的窗口不同。',
    [[155,410],[955,410]],[[300,382],[680,382],[850,382]],1040,830),
    challenges:[{kind:'saw',x:550,y:350,amplitude:105,period:2.4,radius:28,offset:1.2}],parTime:6,
    alternate:[[155,410],[330,460],[740,460],[955,410]].map(([x,y])=>p(x,y)),
    guide:'不要直冲。在锯轮前减速，等它向上离开赛道，再从下面通过。',alternateGuide:'低路空间更宽，但要避开锯轮最低点；星星需要起跳取。'},
  {...make('pulse-gate', '等门一拍', '先停一下，才过得去', '压门会周期落下。画出等待区，按反方向减速；看到门抬起后再通过。',
    [[155,410],[955,410]], [[320,382],[715,382],[840,382]], 1010, 840),
    challenges:[{kind:'gate',x:570,width:44,closed:2.4,travel:.35,open:1.15}],parTime:5.5,slowTime:20,
    alternate:[[155,410],[310,455],[465,455],[660,410],[955,410]].map(([x,y])=>p(x,y)),
    guide:'直线快，但需要主动等门：在门前虚线左侧反向减速，等门抬起后向右通过。',
    alternateGuide:'低洼等待区让你更容易留在门前；开门后爬出缓坡。近处的一颗星需要起跳取。'},
  {...make('charge-stop','驻足充能','有时候，停下才有进展','在蓝色充能台低速停稳 0.5 秒，解锁终点。直接冲过去不会充能。',
    [[155,410],[955,410]],[[300,382],[560,382],[830,382]],1060,850),
    challenges:[{kind:'charge',x:555,y:410,width:120,speed:.8,hold:.5}],parTime:7,
    alternate:[[155,410],[330,450],[490,410],[650,410],[955,410]].map(([x,y])=>p(x,y)),
    guide:'快到充能台时按左刹车，整球停在台上等进度填满，再向右出发。',alternateGuide:'先下后上的缓坡帮助减速；蓝台完全充满后再出发。'},
  {...make('soft-landing', '收住惯性', '到终点，还要停得住', '终点后面是断崖。画一段缓冲坡，按反方向刹车，整颗球在框内低速停稳 0.6 秒。',
    [[155,410],[300,410],[470,330],[700,365],[955,455]], [[350,363],[630,330],[880,420]], 1060, 875),
    challenges:[{kind:'parking',left:977,right:1045,edge:1057,speed:.65,hold:.6}],parTime:5.5,slowTime:18,
    alternate:[[155,410],[370,480],[650,480],[955,455]].map(([x,y])=>p(x,y)),
    guide:'长下坡：看到终点前的刹车标记后按左减速，再轻点左右把球停进框内。',
    alternateGuide:'低路先下坡再缓缓爬升，入场速度更容易控制；上方两颗星需要额外操作。'},
  {...make('double-jump','连续双跳','落稳，再跳一次','两把悬空钥匙都要拿。第一跳落稳后才能再次起跳，坡度会改变落点。',
    [[155,410],[955,410]],[[380,292],[750,292],[900,382]],1040,830),
    challenges:[{kind:'key',position:p(380,296),noInk:{x:330,y:240,w:100,h:78}},{kind:'key',position:p(750,296),noInk:{x:700,y:240,w:100,h:78}}],
    guide:'在第一把钥匙左侧起跳，落回线条后，在第二把钥匙左侧再跳一次。'},
  {...make('double-gate','双门错拍','过了第一门，别急着冲','两道压门错峰开放。门间需要再次减速，观察第二盏灯。',
    [[155,410],[955,410]],[[280,382],[570,382],[870,382]],1040,830),
    challenges:[{kind:'gate',x:420,width:36,closed:1.8,travel:.3,open:1.2},{kind:'gate',x:760,width:36,closed:1.8,travel:.3,open:1.2,offset:1.5}],parTime:9,slowTime:25,
    guide:'第一门前刹车等绿灯；通过后在两门之间再刹一次，等第二门放行。'},
  {...make('key-parking','取钥急停','跳得出去，也要收得回来','先在坡顶跳跃取钥，再提前反向刹车，停进终点框。',
    [[155,410],[290,410],[410,370],[560,370],[750,410],[955,410]],[[310,375],[560,281],[815,382]],1010,840),
    challenges:[{kind:'key',position:p(560,296),noInk:{x:495,y:240,w:130,h:78}},{kind:'parking',left:977,right:1045,edge:1057,speed:.65,hold:.6}],parTime:6,
    guide:'先照借坡取钥的方法跳跃；到终点锚点附近按左刹车，再微调停进框内。'},
  {...make('charge-gate','蓄能发车','等待之后，抓住窗口','先在充能台停稳，再穿过压门。可以等下一轮，但要多花时间。',
    [[155,410],[955,410]],[[340,382],[575,382],[870,382]],1040,830),
    challenges:[{kind:'charge',x:380,y:410,width:110,speed:.8,hold:.5},{kind:'gate',x:730,width:44,closed:3.4,travel:.35,open:1.4}],parTime:9,slowTime:25,
    guide:'先刹车在蓝台充满电；观察远处的门，合适时再向右加速。'},
  {...make('wind-key','逆风取钥','风，会改变你的落点','箭头区域持续向左吹。坡可以托高小球，空中右键要坚持到取到钥匙。',
    [[155,410],[290,410],[410,370],[630,370],[770,410],[955,410]],[[310,375],[570,281],[840,382]],1030,850),
    challenges:[{kind:'wind',area:{x:340,y:220,w:400,h:260},force:-.0013},{kind:'key',position:p(570,296),noInk:{x:520,y:240,w:100,h:78}}],parTime:6,
    guide:'逆风会缩短跳跃距离：比第二关更靠近钥匙再起跳，空中持续向右。'},
  {...make('final-exam','一笔终章','取钥、等门，最后停稳','三个动作连起来：先跳起取钥，落地后门前刹车等待，过门后在终点停稳。',
    [[155,410],[955,410]],[[350,292],[770,382],[900,382]],1030,830),
    challenges:[{kind:'key',position:p(350,296),noInk:{x:300,y:240,w:100,h:78}},{kind:'gate',x:650,width:44,closed:3,travel:.35,open:1.2},{kind:'parking',left:977,right:1045,edge:1057,speed:.65,hold:.6}],parTime:9,slowTime:25,
    guide:'早跳拿钥匙，落地后按左在门前等绿灯。通过后再次加速，终点前别忘了第二次刹车。'},
  make('free', '自由实验', '这一页，没有标准答案', '宽松墨水，自由试验上坡、下坡和回弯。仍需从起点一笔连到终点。',
    [[155,410],[955,410]], [[330,382],[560,310],[800,382]], 1700, 1000),
];
export function validateLevel(level: Level): void {
  if (!(level.inkBudget > level.parInk && level.slowTime > level.parTime)) throw new Error(`关卡 ${level.id} 评分参数无效`);
  if (level.stars.length !== 3 || new Set(level.stars.map(s => s.id)).size !== 3) throw new Error('星星必须有三个唯一 ID');
  for(const c of level.challenges){
    if(c.kind==='gate'&&!(c.width>0&&c.closed>0&&c.open>0&&c.travel>0))throw new Error('压门宽度和周期必须为正');
    if(c.kind==='saw'&&!(c.radius>0&&c.period>0&&c.amplitude>=0))throw new Error('锯轮参数无效');
    if((c.kind==='charge'||c.kind==='parking')&&!(c.speed>0&&c.hold>0))throw new Error('停留速度和时间必须为正');
    if(c.kind==='charge'&&c.width<=BALL_RADIUS*2)throw new Error('充能台必须能容纳整颗球');
  }
}
levels.forEach(validateLevel);
