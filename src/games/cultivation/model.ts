export type Stats={body:number;spirit:number;luck:number};
export type Choice={text:string;result:string;delta:Partial<Stats>};
export type Event={age:number;chapter:number;title:string;text:string;boss?:boolean;choices:Choice[]};
const C=(text:string,result:string,delta:Partial<Stats>):Choice=>({text,result,delta});
export const chapters=[{name:'山门初雪',sub:'凡骨问仙',color:'#bfe3cf'},{name:'秘境惊雷',sub:'金丹试炼',color:'#e9c46a'},{name:'天门无岸',sub:'逆命飞升',color:'#d77768'}];
export const events:Event[]=[
{age:8,chapter:1,title:'石缝里的功法',text:'你在后山捡到一本被鸡啄过的无名功法。',choices:[C('照着练','气走岔了，却意外打通一处经脉。',{spirit:2,body:-1}),C('垫桌脚','桌子稳了，道心也稳了。',{body:1,luck:1})]},
{age:12,chapter:1,title:'会说话的野鸡',text:'它说自己是朱雀后裔，只是暂时落魄。',choices:[C('分它半个馒头','它教你一套扑腾身法。',{luck:2,body:1}),C('抓回去炖汤','鸡跑了，你追了八里山路。',{body:3,luck:-1})]},
{age:16,chapter:1,title:'宗门招生',text:'测灵石先亮后炸，长老们决定再观察一下。',choices:[C('拜入剑峰','每天挥剑一万次，饭量大涨。',{body:3,spirit:1}),C('混进丹房','你学会靠气味判断丹药有没有毒。',{luck:3,spirit:1})]},
{age:19,chapter:1,title:'师兄的赌约',text:'赢了得飞剑，输了替他抄一年门规。',choices:[C('比剑','剑没赢，但把擂台拆了。',{body:3,luck:-1}),C('比谁能熬夜','师兄在子时睡着，你撑到了丑时。',{spirit:2,body:-1})]},
{age:22,chapter:1,title:'藏经阁停电',text:'黑暗里，有一本书自己在发光。',choices:[C('立刻翻开','它记载着早已失传的吐纳术。',{spirit:4}),C('先找管理员','管理员送你一盏不灭灯。',{luck:3})]},
{age:25,chapter:1,boss:true,title:'筑基天问',text:'心魔化成了最害怕的模样：永远写不完的周报。',choices:[C('一剑删掉','你斩断杂念，强行筑基。',{body:-2,spirit:5}),C('认真写完','心魔看完后陷入沉默。',{body:2,luck:3})]},
{age:28,chapter:2,title:'秘境开门',text:'入口写着：机缘与风险概不退换。',choices:[C('正门硬闯','从石兽嘴里抠出一颗灵珠。',{body:-2,spirit:4}),C('翻墙进去','踩中前辈留下的储物袋。',{luck:4})]},
{age:31,chapter:2,title:'倒着流的河',text:'河水从海里爬上山顶，鱼都一脸疲惫。',choices:[C('逆流而上','你悟出一丝逆转灵气之法。',{spirit:4,body:-1}),C('帮鱼搭车','鱼王赠你三片护心鳞。',{body:3,luck:2})]},
{age:35,chapter:2,title:'魔修问路',text:'他客气问青云宗怎么走，袖口却全是血。',choices:[C('指反方向','他走了三天又绕回来，但已忘了你的脸。',{luck:3}),C('拔剑除魔','险胜。你的剑第一次有了名字。',{body:-2,spirit:5})]},
{age:39,chapter:2,title:'拍卖会漏宝',text:'无人问津的破碗里，藏着一声龙吟。',choices:[C('倾家荡产买下','龙吟是真的，龙只剩半条。',{spirit:5,luck:-2}),C('假装不感兴趣','散场后摊主半价塞给你。',{luck:4})]},
{age:43,chapter:2,title:'同门遇险',text:'妖潮将至，撤退还能保住自己的机缘。',choices:[C('回头救人','十二名弟子记住了你的名字。',{body:-3,spirit:3,luck:3}),C('引开妖潮','你跑得比一生中任何时候都快。',{body:5})]},
{age:47,chapter:2,boss:true,title:'金丹雷劫',text:'六道雷霆封住退路，云中有人问：凭什么是你？',choices:[C('凭手中之剑','一剑劈开雷海，也劈裂了虎口。',{body:-3,spirit:7}),C('凭一路善缘','受助之人的愿力化作金光。',{luck:6,spirit:2})]},
{age:51,chapter:3,title:'无名古战场',text:'每一把断剑，都在重复最后一声叹息。',choices:[C('听完所有故事','万千剑意汇入识海。',{spirit:6,body:-2}),C('埋葬无主残剑','荒原开出一夜白花。',{luck:5})]},
{age:56,chapter:3,title:'另一个自己',text:'时间裂隙里，那个人已经飞升，却劝你回头。',choices:[C('与他交手','你证明未来并非唯一。',{body:-2,spirit:6}),C('问他后悔什么','他只说：别忘了山下的人。',{luck:4,spirit:2})]},
{age:61,chapter:3,title:'宗门大火',text:'护山阵崩塌，珍藏与弟子只能先救一边。',choices:[C('护住众人','藏经化灰，人心未散。',{body:-3,luck:6}),C('抢救传承','你背出三千卷经文。',{spirit:7,luck:-2})]},
{age:67,chapter:3,title:'九幽来信',text:'魔尊请你赴宴，信纸背面附了报销标准。',choices:[C('单刀赴会','你们谈崩了，也打服了。',{body:-3,spirit:7}),C('带全宗蹭饭','魔宫库存当晚告急。',{luck:6,body:2})]},
{age:73,chapter:3,title:'人间最后一夜',text:'旧友白发苍苍，为你温了一壶凡酒。',choices:[C('喝到天亮','你记起修仙以前为何出发。',{luck:4,body:2}),C('传他一缕仙气','他多了十年，你少了一点道行。',{spirit:-2,luck:7})]},
{age:81,chapter:3,boss:true,title:'天门无岸',text:'天门已开。九重仙阶上，每一步都在剥去一段往事。',choices:[C('舍身登天','你把这一世押给了更高处。',{body:-4,spirit:10}),C('携人间飞升','你拒绝成为孤身一人的仙。',{luck:8,spirit:4})]}
];
export const realms=['炼气','筑基','金丹','元婴','化神','飞升'];
export function score(s:Stats){return Math.max(0,s.body*2+s.spirit*3+s.luck*2)}
export function realm(s:Stats){return realms[Math.min(5,Math.floor(score(s)/24))]}
export function applyChoice(s:Stats,c:Choice):Stats{return{body:Math.max(0,s.body+(c.delta.body||0)),spirit:Math.max(0,s.spirit+(c.delta.spirit||0)),luck:Math.max(0,s.luck+(c.delta.luck||0))}}
export function chapterProgress(index:number){return Math.min(3,Math.floor(index/6)+1)}
