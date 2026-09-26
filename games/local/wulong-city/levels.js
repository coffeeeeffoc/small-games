(() => {
const {C,ctx,rect,line,ellipse,text,poly,face,actor,bird,sign,handle,door,background,hit,near,win,say,tone,clamp}=W;
W.add(19,{
 init:()=>({facing:[1,-1],echoes:[{from:0,to:1,t:0}],light:1.8,lastHeard:0,heard:0,curtain:0}),
 update(s,dt){echoUpdate(s,dt);if(!s.echoes.length&&s.t-s.lastHeard>1.5){s.curtain=Math.min(1,s.curtain+dt*.65);if(s.curtain===1)win();}},
 draw(s){background('inside');rect(127,237,278,194,'#69816b',2);rect(116,428,300,8,C.yellow,2);text('今日维修庆祝会',264,85,23,C.green);parrots(s,178);actor(264,424,1,1.2);if(s.light>0){text('谢谢！再来一个！',260,289,16,C.paper);text('鞠躬…',271,327,12,C.yellow);}else text('终于可以收工了',265,311,15,C.paper);rect(123,234,282,Math.max(16,197*s.curtain),C.orange,3);for(let x=137;x<402;x+=25)line(x,238,x,234+Math.max(16,197*s.curtain),'#b75e44',2);ellipse(57,302,28,23,C.paper);text('👏',57,299,24);hit('encore','再拍一次手',27,274,63,57,()=>{s.echoes.push({from:-1,to:0,t:0});s.light=1.8;s.lastHeard=s.t;s.curtain=0;say('演员又回来了：只要还有掌声，我就继续！');});}
});
W.add(20,{
 floor:false,
 init:()=>({fold:0,fallen:0}),
 platforms:s=>[{x:0,y:436,w:186,h:100},{x:340-149*s.fold,y:284+152*s.fold,w:151,h:18},...(s.fold>.96?[{x:181,y:436,w:19,h:18}]:[])],
 update(s){const hx=340-149*s.fold,hy=284+152*s.fold;if(s.p.y>488){s.p.x=113;s.p.y=436;s.p.vy=0;s.fallen++;say('纸边轻轻接住了你。两处街口还没有接到一起。');}if(s.p.x>hx+59&&s.p.x<hx+113&&Math.abs(s.p.y-hy)<3)win();},
 draw(s){background();rect(186,437,294,70,'#d3ddca',0,null);const hx=340-149*s.fold,hy=284+152*s.fold;poly([[29,432],[184,432],[208,188],[365,155],[hx+142,hy],[hx,hy],[186,446],[28,446]],C.paper);line(186,434,263,190,C.orange,2,[7,6]);line(263,190,hx+75,hy,'#8ca081',2,[7,6]);for(let i=0;i<4;i++){let x=210+i*33-s.fold*i*19,y=236+i*13+s.fold*45;rect(x,y,25,41,i%2?C.mint:'#e4c791',2);rect(x+7,y+11,9,11,C.paper,1);poly([[x-3,y],[x+12,y-16],[x+28,y]],i%2?C.green:C.orange);}rect(0,436,186,13,C.green,1);rect(hx,hy,151,13,C.green,1);if(s.fold>.96)rect(181,436,19,13,C.orange,1);door(hx+86,hy,true,'小岔的家');poly([[168,424],[181,416],[181,432]],C.orange);poly([[hx+14,hy-12],[hx+1,hy-20],[hx+1,hy-4]],C.orange);if(s.fold<.98){line(182,437,hx,hy,C.orange,2,[4,6]);text('同一个街口标记',139,145,13,C.green);}let ringX=263-s.fold*70,ringY=180+s.fold*220;handle(ringX,ringY);hit('city-fold','城市长纸折痕上的圆环',ringX-25,ringY-25,50,50,()=>say('折痕只朝下方收拢，街口间有虚线对齐预览。'),(x,y)=>{s.fold=clamp((y-180)/220,0,1);if(s.fold>.9){s.fold=1;say('咔嗒，两个街口对上了。还差亲自走回家这一步。');}});text('今天走过的路',102,76,19,C.green);if(s.fold>.96){bird(353,401,-1,C.orange);sign('值班员的新邻居',407,358,124);}
 }
});
const steps=[{x:145,y:389,w:75,h:19},{x:216,y:341,w:72,h:19},{x:282,y:293,w:74,h:19},{x:348,y:245,w:73,h:19}];
W.add(14,{
 init:()=>({long:false,growth:1,options:false,attempted:false}),
 platforms:s=>[...steps.slice(0,Math.floor(s.growth)),{x:416,y:210,w:64,h:15}],
 update(s,dt){if(s.long)s.growth=Math.min(4,s.growth+dt*1.8);if(!s.long&&s.p.x>191&&!s.attempted){s.attempted=true;say('这句「天冷」太短了，只够垫一小步。');}if(s.p.x>431&&s.p.y<=212)win();},
 draw(s){background();rect(414,210,66,15,C.green,2);text('检修平台',433,180,13,C.green);line(448,225,470,250,C.green,3);actor(81,436,1,1.13);text('……',79,327,28,C.orange);hit('talk','爱讲话的居民，交谈',45,345,72,89,()=>{s.options=true;say('居民深吸一口气：你想听简短的，还是详细的？');});steps.slice(0,Math.floor(s.growth)).forEach((b,i)=>{rect(b.x,b.y-27,b.w,46,C.paper,16);poly([[b.x+12,b.y+14],[b.x+4,b.y+27],[b.x+28,b.y+17]],C.paper);line(b.x+6,b.y,b.x+b.w-6,b.y,C.green,2);text(['天冷。','话说当年','从头讲起','还有一点'][i],b.x+b.w/2,b.y-11,12,C.green);});if(s.options&&!s.long){rect(26,238,133,39,C.paper,13);text('您展开说说',92,257,14,C.green);hit('detail','对居民说：您展开说说',22,232,141,49,()=>{s.long=true;s.options=false;say('这下可让他讲开了。话语一节一节长成了阶梯。');});rect(27,287,100,30,C.paper,11);text('说重点吧',77,302,12);hit('brief','对居民说：说重点吧',22,282,114,40,()=>{s.options=false;say('居民：天冷。——只有这短短一截。');});}if(s.long)text('第一点还没说完呢',116,179,14,C.orange);}
});
W.add(15,{
 init:()=>({mapDrag:false,mapPreview:null,origin:null,blocked:false}),
 cancel(s){if(s.mapDrag){s.p.x=s.origin.x;s.p.y=s.origin.y;s.p.vy=0;s.mapDrag=false;s.mapPreview=null;s.manual=false;s.locked=false;}},
 platforms:()=>[{x:313,y:281,w:33,h:155,solid:true}],
 update(s){if(s.p.x>294&&!s.mapDrag&&!s.blocked&&s.p.x<346){s.blocked=true;say('围栏太高，跳不过去。地图小人也被挡在外面。');}if(!s.mapDrag&&s.p.x>369&&s.p.y===436)win();},
 draw(s){background();rect(349,291,124,145,'#d5dfbf',2);for(let x=315;x<347;x+=9)line(x,281,x,436,C.orange,4);line(309,318,351,318,C.ink,3);line(309,377,351,377,C.ink,3);text('维修区域',407,328,15,C.green);rect(389,375,44,61,C.mint,7);text('修',411,404,24,C.green);rect(72,80,335,163,C.paper,8);text('乌龙城 · 特殊导览图',238,103,17,C.green);rect(92,149,288,70,'#e6e7d5',3);rect(306,151,66,66,C.mint,2);text('维修区',340,167,12,C.green);line(287,149,287,221,C.orange,4);line(92,216,380,216,C.green,2);let mx=92+s.p.x*.6,my=161+(s.p.y-280)*.35;ellipse(mx,my-10,8,8,C.orange);line(mx,my-3,mx,my+6,C.orange,4);text('您在此处',mx,133,11,C.orange);hit('map-person','地图上的小人标记',mx-22,my-32,44,51,()=>say('你动一下，它就动一下。小人标记有可抓的小把手。'),(x,y)=>{if(!s.mapDrag){s.origin={x:s.p.x,y:s.p.y};s.mapDrag=true;s.manual=true;s.locked=true;}let wx=(x-92)/.6,wy=(y-161)/.35+280,valid=wx>=22&&wx<=448&&(wx<293||wx>367)&&Math.abs(wy-436)<56;s.mapPreview={x:clamp(wx,22,458),valid};if(valid){s.p.x=wx;s.p.y=436;}},()=>{if(!s.mapDrag)return;if(!s.mapPreview?.valid){s.p.x=s.origin.x;s.p.y=s.origin.y;say('这不是能站的地方。小人弹回原位。');}else say('标记到哪，你就到哪。');s.mapDrag=false;s.manual=false;s.locked=false;s.p.vy=0;s.mapPreview=null;});if(s.mapPreview){ctx.save();ctx.globalAlpha=.4;actor(s.mapPreview.x,436,1);ctx.restore();ellipse(s.mapPreview.x,441,22,5,s.mapPreview.valid?C.green:C.orange,null);}
 }
});
function silhouette(x,y,k=1){ellipse(x,y-44*k,13*k,15*k,'#485446',null);rect(x-12*k,y-30*k,24*k,29*k,'#485446',7*k,null);line(x-7*k,y-3*k,x-9*k,y,'#485446',4*k);line(x+7*k,y-3*k,x+9*k,y,'#485446',4*k);}
W.add(16,{
 init:()=>({p:{x:211,y:436,vx:0,vy:0,dir:1,grounded:true},flash:true,failedPhoto:false,goodPhoto:false,shot:0,shotFlash:false,photoWait:0}),
 update(s,dt){if(s.shot>0){s.shot-=dt;if(s.shot<=0){if(s.shotFlash){s.failedPhoto=true;say('照片空空的。闪光亮起时，影子也跟着不见了。');}else{s.goodPhoto=true;say('影子的轮廓，清清楚楚留在了照片上。');}}}if(s.goodPhoto){s.photoWait+=dt;if(s.photoWait>.7)win();}},
 draw(s){background('inside');rect(151,270,175,165,'#dbdec7',6);line(57,373,57,436,C.ink,4);poly([[40,367],[75,367],[82,385],[35,385]],C.yellow);poly([[75,381],[321,272],[325,432]],'#f6e4a940',null);if(!(s.shot>0&&s.shotFlash))silhouette(clamp(s.p.x+53,160,309),431,1.55);text('环境灯 · 保持照明',102,327,11,C.green);
  rect(337,332,89,61,C.green,9);ellipse(366,365,21,21,C.paper);ellipse(366,365,13,13,'#455a4b');line(378,394,355,436,C.ink,4);line(378,394,409,436,C.ink,4);rect(356,319,29,13,C.orange,3);hit('shutter','场景相机的快门',349,312,46,43,()=>{if(s.shot>0||s.goodPhoto)return;s.shot=.32;s.shotFlash=s.flash;tone(900,.06);});rect(391,338,29,31,s.flash?C.yellow:'#a1b29a',4);text('ϟ',406,353,25,s.flash?C.ink:C.paper);if(!s.flash)line(396,364,417,342,C.ink,2);hit('flash','场景相机闪光灯开关',389,337,45,45,()=>{s.flash=!s.flash;say(s.flash?'闪光灯亮起了，环境灯也还亮着。':'闪光灯关掉了，环境灯仍照着影子。');});text('快门',369,301,12,C.green);
  if(s.failedPhoto){rect(39,91,159,153,C.paper,3);rect(48,101,141,109,'#d9ddc8',1);text('闪光：只有一片亮',120,228,11,C.orange);}if(s.goodPhoto){rect(216,91,159,153,C.paper,3);rect(225,101,141,109,'#d9ddc8',1);silhouette(295,205,1.35);text('影子证件照',295,228,12,C.green);}if(s.shot>0&&s.shotFlash)rect(0,0,480,475,'#fffceb99',0,null);
 }
});
W.add(17,{
 init:()=>({brake:true,entered:false,counterX:95,stamped:[false,false,false],service:[0,0,0]}),
 jump(s){if(s.entered){say('办事窗口很稳当，只需要左右推。');return false;}},
 update(s,dt){if(s.entered){s.hideActor=true;s.counterX=s.p.x;[233,321,411].forEach((x,i)=>{if(!s.stamped[i]&&Math.abs(s.counterX-x)<35){s.service[i]+=dt;if(s.service[i]>.58){s.stamped[i]=true;say(`咚！第${i+1}位居民的申请盖好了。`);tone(180,.09);}}});if(s.stamped.every(Boolean))win();}},
 draw(s){background();text('便 民 服 务 处',239,137,26,C.green);text('队伍扎根，服务扎实',239,177,13,C.green);[233,321,411].forEach((x,i)=>{actor(x,436,-1,.88);for(let j=-1;j<=1;j++){line(x,431,x+j*20,456,C.green,3);line(x+j*20,456,x+j*25+7,452,C.green,2);}rect(x-24,362,32,24,C.paper,2);if(s.stamped[i]){text('✓',x-8,373,21,C.orange);text('办好了',x,336,11,C.green);}else{text(String(i+1),x-8,373,13);if(s.service[i]>0){rect(x-22,339,44,5,'#cad5c0',2);rect(x-22,339,44*Math.min(1,s.service[i]/.58),5,C.orange,2,null);}}});const x=s.counterX;rect(x-52,299,104,121,C.mint,8);rect(x-45,308,90,53,C.paper,7);rect(x-57,369,114,10,C.green,2);text('办事窗口',x,398,13,C.green);ellipse(x-34,427,10,10,C.ink);ellipse(x+34,427,10,10,C.ink);if(s.entered){actor(x,365,1,.65);}else{door(x,368,true,'');hit('counter-enter','走近进入办事窗口',x-39,305,78,66,()=>{if(!near(x,70)){say('走到窗口跟前，才能进去。');return;}if(s.brake){say('轮子被刹车卡住了。右下方有刹车杆。');return;}s.entered=true;s.p.x=x;say('小岔进入窗口。左右移动把服务送到每位居民面前。');});}if(!s.entered){line(x+49,416,x+66,s.brake?396:421,C.orange,5);handle(x+65,s.brake?394:422);hit('brake','办事窗口的刹车杆',x+39,s.brake?371:400,52,47,()=>{s.brake=!s.brake;say(s.brake?'刹车锁住了轮子。':'刹车松开，窗口轻轻滑了一下。');if(!s.brake)s.counterX+=5;});} }
});
W.add(6,{
 init:()=>({grassX:130,grassY:309,zebras:[{x:75,y:369},{x:128,y:376},{x:181,y:371}],aligned:false,carsStop:false,blocked:false}),
 update(s,dt){if(s.grassX>225)s.carsStop=true;let ready=s.grassX>275&&s.grassX<357&&s.grassY>370;s.zebras.forEach((z,i)=>{let tx=s.grassX-64+i*53,ty=clamp(s.grassY+29,340,430);z.x+=(tx-z.x)*Math.min(1,dt*2.8);z.y+=(ty-z.y)*Math.min(1,dt*2.8);if(Math.abs(z.x-tx)>5||Math.abs(z.y-ty)>5)ready=false;});if(ready&&!s.aligned){s.aligned=true;say('条纹排成一条路，车子停稳了。现在可以通过。');}if(!s.aligned&&s.p.x>208){s.p.x=208;if(!s.blocked){s.blocked=true;say('没有斑马线，先别过马路。小斑马们正扭头找草。');}}if(s.aligned&&s.p.x>420)win();},
 draw(s){background();rect(224,181,154,255,'#9bada0',0,null);line(231,180,231,436,C.paper,3);line(371,180,371,436,C.paper,3);for(let y=190;y<429;y+=41)line(300,y,300,y+18,C.yellow,2);for(let x=243;x<373;x+=43)rect(x,382,23,41,'#d9e0cf33',2,'#d0d8c3');let cy=s.carsStop?262:245+Math.sin(s.t*2)*25;rect(269,cy-63,62,76,C.orange,10);rect(280,cy-48,40,23,C.blue,5);ellipse(276,cy+4,6,9,C.ink);ellipse(324,cy+4,6,9,C.ink);if(s.carsStop)text('已停车',302,cy-84,12,C.green);s.zebras.forEach((z,i)=>{ellipse(z.x,z.y-19,22,14,C.paper);for(let j=-12;j<=12;j+=10)line(z.x+j,z.y-29,z.x+j+6,z.y-9,C.ink,4);line(z.x-13,z.y-7,z.x-13,z.y,C.ink,3);line(z.x+10,z.y-7,z.x+10,z.y,C.ink,3);ellipse(z.x+18,z.y-32,11,15,C.paper);line(z.x+15,z.y-46,z.x+13,z.y-55,C.ink,3);ellipse(z.x+22,z.y-34,2,3,C.ink,null);});
  rect(s.grassX-81,s.grassY-14,159,26,C.yellow,5);for(let x=s.grassX-70;x<s.grassX+73;x+=12){line(x,s.grassY-5,x-3,s.grassY-20,C.green,3);line(x,s.grassY-5,x+6,s.grassY-22,C.green,3);}handle(s.grassX,s.grassY+3);hit('grass','长条草槽的把手',s.grassX-85,s.grassY-26,170,52,()=>say('小斑马的鼻子都朝着草槽。'),(x,y)=>{if(s.aligned)return;s.grassX=clamp(x,100,372);s.grassY=clamp(y,280,405);});text('过街条纹去哪了？',299,140,18,C.green);
 }
});
W.add(7,{
 init:()=>({lift:0,blocked:false}),
 platforms:s=>s.lift>105?[]:[{x:207,y:188,w:170,h:248,solid:true}],
 update(s){if(s.p.x>188&&s.lift<=105&&!s.blocked){s.blocked=true;say('撞上去是「咚」的一声，像敲在舞台板上。');}if(s.p.x>418&&s.lift>105)win();},
 draw(s){background();line(225,236,244,432,'#a98e67',8);line(357,240,338,432,'#a98e67',8);line(231,369,344,369,'#a98e67',6);ellipse(297,432,107,5,'#71816a33',null);const base=436-s.lift;poly([[186,base],[281,159],[393,base]],C.green);poly([[259,205],[281,159],[311,224],[285,211],[273,218]],C.paper);poly([[393,base],[402,base-8],[288,160],[281,159]],'#305844');rect(186,base-5,209,16,C.mint,7);ellipse(395,base+3,8,8,C.green);if(s.lift<10)poly([[192,base-2],[235,base-4],[229,base-20-Math.sin(s.t*3)*6]],C.paper);hit('mountain','布景山脚宽卷边',176,base-28,228,57,()=>say('山脚被风吹起，背后露出木支架。'),(x,y)=>{s.lift=clamp(436-y,0,165);if(s.lift>105)say('布景卷好了，下面真的空出来一条路。');});text('下周旅游景点',290,116,18,C.green);sign('前方是山',82,325,95);door(438,436,true,'山那边');}
});
W.add(10,{
 init:()=>({donutX:124,donutY:244,dragging:false,installed:false,carOffset:0}),
 cancel(s){if(!s.installed){s.donutX=124;s.donutY=244;s.dragging=false;}},
 update(s,dt){if(s.installed){s.carOffset+=dt*100;if(s.carOffset>225)win();}},
 draw(s){background();rect(43,135,164,209,C.green,10);rect(53,145,144,188,'#e1d8b4',6);text('今日菜单',125,167,18,C.green);text('甜甜圈',125,298,14);line(67,182,183,182,'#9d9c7f');line(85,344,85,436,C.ink,5);line(173,344,173,436,C.ink,5);let drip=(s.t*.6)%1;ellipse(139,310+drip*67,3,5,C.yellow,null);ellipse(145,418,17,3,'#d9bb6980',null);
   const ox=s.carOffset;rect(264+ox,351,147,54,C.mint,10);rect(274+ox,326,75,25,C.yellow,4);text('热饭速达',333+ox,375,16,C.green);ellipse(291+ox,418,20,20,C.ink);ellipse(291+ox,418,8,8,C.paper);line(351+ox,417,395+ox,417,C.ink,5);ellipse(383+ox,418,7,7,C.ink);if(!s.installed){line(360,397,371,403,C.orange,2);line(383,391,383,401,C.orange,2);line(402,397,396,404,C.orange,2);}let dx=s.installed?383+ox:s.donutX,dy=s.installed?418:s.donutY;ctx.save();ctx.translate(dx,dy);ctx.rotate(s.t*(s.installed?5:.5));ellipse(0,0,26,26,C.yellow);ellipse(0,0,11,11,s.installed?'#d9ddc8':'#e1d8b4');for(let i=0;i<7;i++){let a=i/7*Math.PI*2;line(Math.cos(a)*18,Math.sin(a)*18,Math.cos(a)*20+2,Math.sin(a)*20,C.orange,3);}ctx.restore();
   if(!s.installed)hit('donut','菜单里的甜甜圈',s.donutX-34,s.donutY-34,68,68,()=>say('甜甜圈的油，正一滴一滴落出屏幕。'),(x,y)=>{s.dragging=true;s.donutX=clamp(x,28,453);s.donutY=clamp(y,50,470);},()=>{if(Math.hypot(s.donutX-383,s.donutY-418)<46){s.installed=true;say('甜甜圈卡上车轴，小车又能转起来了！');tone(580,.15);}else{s.donutX=124;s.donutY=244;s.dragging=false;say('没装稳，甜甜圈弹回菜单，油却留在了外面。');}});if(s.installed)bird(231+ox,399,1,C.orange);
 }
});
W.add(12,{
 init:()=>({back:false,flip:1,delivered:false,receipt:0,flippedGesture:false}),
 cancel(s){s.flippedGesture=false;},
 update(s,dt){s.flip=Math.min(1,s.flip+dt*2.2);if(s.delivered){s.receipt+=dt;if(s.receipt>.6)win();}},
 draw(s){background();const showing=s.flip<.5?!s.back:s.back;ctx.save();ctx.translate(318,0);ctx.scale(Math.max(.06,Math.abs(Math.cos(s.flip*Math.PI))),1);ctx.translate(-318,0);poly([[199,216],[314,143],[439,216]],showing?C.green:C.orange);rect(207,216,226,220,showing?'#d0debd':'#e6d3af',3);rect(227,244,64,71,C.blue,8);actor(258,311,-1,.62);line(283,289,306,279,C.orange,4);text(showing?'背面 · 12 号':'正面 · 21 号',320,234,15,C.green);rect(304,321,84,73,C.green,6);rect(312,332,68,9,C.ink,2);text(showing?'12':'21',346,365,24,C.paper);line(423,217,423,435,'#819077',1,[5,4]);poly([[405,212],[433,188],[433,239]],C.paper);ctx.restore();
  hit('house-flip','贺卡房屋的翻页角',390,180,56,61,()=>{if(s.flip===1){s.back=!s.back;s.flip=0;say('房子翻到了另一面，包裹还在手里。');}},(x)=>{if(x<340&&s.flip===1&&!s.flippedGesture){s.back=!s.back;s.flip=0;s.flippedGesture=true;say('房子翻页了！看看这面的门牌。');}},()=>{s.flippedGesture=false;});
  if(s.flip===1)hit('mailbox',(s.back?'12':'21')+'号信箱（走近投递）',302,316,91,83,()=>{if(!s.back){say('这里是21号。居民往房子背面指了指。');return;}if(!near(346,75)){say('信箱在背面，走近才能把包裹放进去。');return;}s.delivered=true;say('包裹滑进12号信箱，里面传来一声「收到」。');});if(!s.delivered){rect(s.p.x+14,s.p.y-39,26,24,C.yellow,2);line(s.p.x+27,s.p.y-39,s.p.x+27,s.p.y-15,C.orange,3);text('12',s.p.x+27,s.p.y-28,10);}else{rect(319,326+Math.min(1,s.receipt)*15,47,14,C.yellow,2);text('收到',347,290,15,C.orange);}
 }
});
W.add(1,{
 init:()=>({doorX:338,opened:false,fled:false}),
 update(s,dt){if(!s.opened){const watching=s.p.dir===(s.doorX>s.p.x?1:-1);if(watching){if(Math.abs(s.p.x-s.doorX)<190){s.doorX=clamp(s.doorX+Math.sign(s.doorX-s.p.x)*85*dt,47,432);if(!s.fled){s.fled=true;say('门捂住了脸，踩着小碎步往后退。');}}if(Math.abs(s.p.x-s.doorX)<55)s.p.x=s.doorX-55;}else{s.doorX+=Math.sign(s.p.x-s.doorX)*70*dt;if(Math.abs(s.p.x-s.doorX)<44){s.opened=true;say('门偷偷凑到背后，把自己打开了。');}}}else if(Math.abs(s.p.x-s.doorX)<22)win();},
 draw(s){background('inside');rect(46,124,125,153,C.blue,50);line(108,124,108,277,C.paper,5);line(46,202,171,202,C.paper,5);ellipse(81,168,15,15,C.yellow,null);rect(70,347,68,18,C.yellow,5);line(78,365,78,436);line(130,365,130,436);sign('小岔的家',125,60,111);let x=s.doorX;rect(x-29,322,58,100,s.opened?'#56735c':C.mint,22);if(s.opened)rect(x-18,339,36,83,'#344e40',14);else{face(x,351,s.p.dir,'shy');ellipse(x-22,375,8,12,C.mint);ellipse(x+22,375,8,12,C.mint);}line(x-15,422,x-19+Math.sin(s.t*12)*3,436,C.ink,4);line(x+15,422,x+19-Math.sin(s.t*12)*3,436,C.ink,4);text('出 口',x,303,13,C.green);hit('shy-door','有脚的害羞门',x-31,321,63,114,()=>say(s.opened?'门已放行，走进去就能出门。':'门：别盯着我嘛……'));}
});
function dog(x,y,holding=false){ellipse(x,y-22,25,23,C.yellow);ellipse(x,y-47,23,22,C.yellow);ellipse(x-24,y-47,8,17,'#ac8655');ellipse(x+24,y-47,8,17,'#ac8655');ellipse(x-7,y-50,2.5,3,C.ink,null);ellipse(x+7,y-50,2.5,3,C.ink,null);ellipse(x,y-39,5,4,C.ink,null);line(x-14,y-8,x-19,y,C.ink,4);line(x+14,y-8,x+19,y,C.ink,4);line(x-23,y-23,x-37,y-40,C.yellow,10);line(x+23,y-23,x+37,y-40,C.yellow,10);if(holding)actor(x,y-43,1,.64);}
W.add(3,{
 init:()=>({dogX:167,dogCarry:false,holdingDog:false,grab:false,failed:false}),
 cancel(s){if(s.grab){s.p.x=65;s.p.y=436;s.p.vy=0;s.grab=false;s.manual=false;s.locked=false;}},
 platforms:s=>s.dogCarry?[]:[{x:306,y:292,w:28,h:144,solid:true}],
 update(s){if(!s.dogCarry&&s.p.x>285&&!s.failed){s.failed=true;s.holdingDog=false;s.dogX=218;say('乘客坐反了！小狗被请下来，重新张开前爪。');}if(s.dogCarry){s.hideActor=true;s.dogX=s.p.x;if(s.p.x>412)win();}},
 draw(s){background();rect(286,278,66,18,C.orange,4);rect(302,293,35,143,C.mint,4);if(!s.dogCarry){line(318,337,278,368,C.orange,6);line(318,337,354,368,C.orange,6);}else line(318,337,318,303,C.green,6);text('宠 物 通 道',321,246,18,C.green);rect(272,77,126,142,C.paper,8);dog(335,167,true);text('乘客示意图',335,201,12,C.green);
  if(s.dogCarry)dog(s.p.x,s.p.y,true);else if(s.holdingDog){dog(s.p.x+27,s.p.y-27,false);}else dog(s.dogX,436,false);
  if(!s.dogCarry){hit('dog','伸出前爪的小狗',s.dogX-40,356,80,79,()=>{if(near(s.dogX,80)){s.holdingDog=true;say('小岔抱起小狗，似乎又哪里不对。');}else say('小狗把前爪张得更开了，像要接住谁。');});hit('grab-person','小岔的背带，本关可以抓起',s.p.x-27,s.p.y-76,54,79,()=>say('背带两侧有抓取标记，小狗正在等抱抱。'),(x,y)=>{s.grab=true;s.manual=true;s.locked=true;s.holdingDog=false;s.p.x=clamp(x,30,285);s.p.y=clamp(y+34,120,436);},()=>{if(s.grab&&Math.abs(s.p.x-s.dogX)<65&&s.p.y>300){s.dogCarry=true;s.p.x=s.dogX;s.p.y=436;s.p.vy=0;say('现在由小狗抱着小岔！方向键开始控制小狗。');}else{s.p.x=65;s.p.y=436;s.p.vy=0;}s.grab=false;s.manual=false;s.locked=false;});}
 }
});
W.add(4,{
 init:()=>({p:{x:208,y:436,vx:0,vy:0,dir:1,grounded:true},fear:0,gooseX:339,hidden:false,blocked:false}),
 platforms:s=>s.hidden?[]:[{x:317,y:290,w:40,h:146,solid:true}],
 update(s,dt){s.shadow=clamp(1+(160-s.p.x)/38, .65,3.25);if(s.shadow>2.5)s.fear=Math.min(1,s.fear+dt*1.3);if(s.fear>=1){s.hidden=true;s.gooseX=Math.min(423,s.gooseX+140*dt);}if(s.p.x>299&&!s.hidden&&!s.blocked){s.blocked=true;say('大鹅一伸脖子拦住你。它的目光又落回影子。');}if(s.hidden&&s.p.x>422)win();},
 draw(s){background();rect(97,126,284,307,'#d4ddc5',7);const k=s.shadow||1;ctx.save();ctx.globalAlpha=.26;ctx.translate(245,431);ctx.scale(k,k);ellipse(0,-42,15,18,C.ink,null);rect(-13,-27,26,28,C.ink,7,null);line(-8,-1,-10,0,C.ink,5);line(8,-1,10,0,C.ink,5);ctx.restore();rect(38,407,34,29,C.green,4);ellipse(57,403,13,10,C.yellow);poly([[61,398],[342,126],[363,430]],'#fae0a530',null);line(65,405,128,353,'#e5c778',1,[4,5]);rect(397,297,69,139,C.green,8);text('岗亭',431,318,15,C.paper);let gx=s.gooseX;ellipse(gx,414,21,18,C.paper);line(gx+8,403,gx+10,369,C.paper,12);ellipse(gx+10,363,12,14,C.paper);poly([[gx-1,361],[gx-19,365],[gx-1,371]],C.orange);ellipse(gx+7,360,2.5,3,C.ink,null);line(gx-10,430,gx-13,436,C.orange,3);line(gx+8,430,gx+13,436,C.orange,3);if(s.fear>0)text('!',gx+27,359-s.fear*12,20,C.orange);text('只认影子',241,104,15,C.green);}
});
W.add(5,{
 init:()=>({offset:0,busX:371,stopped:false,walked:false}),
 update(s,dt){if(!s.stopped){s.busX=373+Math.sin(s.t*.8)*17;if(s.offset>204){s.offset=219;s.stopped=true;say('站牌追上来了。公交靠站，门开了！');}}if(s.p.x>230&&!s.stopped){s.p.x=230;if(!s.walked){s.walked=true;say('司机只认站牌，不认一路小跑的乘客。');}}if(s.stopped&&Math.abs(s.p.x-(s.busX+18))<30)win();},
 draw(s){background();let bx=s.busX;rect(bx-84,282,157,119,C.yellow,17);rect(bx-73,298,85,44,C.blue,5);line(bx-32,300,bx-32,340,C.ink,2);rect(bx+23,298,35,92,s.stopped?'#435e4a':C.mint,5);ellipse(bx-48,402,16,16,C.ink);ellipse(bx+42,402,16,16,C.ink);ellipse(bx-48,402,7,7,C.paper);ellipse(bx+42,402,7,7,C.paper);text('乌龙 · 01',bx-31,363,13);let ox=s.offset;rect(0,437,480,38,'#e9d9b3',0,null);for(let x=-100+ox%80;x<480;x+=80)line(x,448,x+34,448,C.paper,3);line(0,475,480,475,C.ink,2);for(const x of [18,460])ellipse(x,456,12,20,C.mint);sign('1 路 · 此处候车',91+ox,245,121);line(35+ox,432,152+ox,432,C.orange,5);line(31+ox,432,31+ox,420,C.orange);line(154+ox,432,154+ox,420,C.orange);let hx=192+ox;poly([[hx-20,439],[hx+21,440],[hx+4,473]],C.paper);handle(hx,451);hit('road','道路纸带卷边',hx-27,427,57,51,()=>say('纸带两端有滚轴，站台和路灯都立在纸带上。'),x=>{if(s.stopped)return;let next=clamp(x-192,0,219),delta=next-s.offset;s.offset=next;s.p.x=clamp(s.p.x+delta,22,458);});}
});
W.add(18,{
 init:()=>({inPainting:false,exposure:0,transferred:false,frame:0}),
 platforms:s=>s.inPainting?[{x:28,y:400,w:148,h:15},{x:186,y:353,w:133,h:15},{x:330,y:312,w:139,h:15}]:[{x:404,y:306,w:45,h:132,solid:true}],
 update(s,dt){if(!s.inPainting){let center=254+Math.sin(s.t*.75)*42;if(Math.abs(s.p.x-center)<64){s.exposure+=dt;if(s.exposure>.75){s.inPainting=true;s.p.x=69;s.p.y=400;s.p.vy=0;s.p.grounded=true;say('小岔被挂进了第一幅画。腿还能走，脚还能跳！');tone(860,.1);}}else s.exposure=Math.max(0,s.exposure-dt);if(s.p.x>380)say('正门上了锁。巡逻相机还在四处找「作品」。');}else{if(s.p.y>426){s.p.x=70;s.p.y=400;s.p.vy=0;say('画框接住了你。靠近边缘再轻轻跳过去。');}if(s.p.x>=188&&s.p.x<320&&s.p.y<=355&&s.p.grounded){s.transferred=true;s.frame=1;}if(s.p.x>415&&s.p.y<=314&&s.transferred)win();}},
 draw(s){background('inside');if(!s.inPainting){text('乌 龙 美 术 馆',237,104,27,C.green);rect(57,153,127,113,C.yellow,2);rect(64,160,113,99,C.blue,0);rect(203,153,126,113,C.yellow,2);rect(210,160,112,99,C.mint,0);let bx=90+(Math.sin(s.t)*.5+.5)*205;bird(bx,230,1);line(180,211,208,211,C.orange,3,[3,3]);door(426,436,false,'内厅 · 闭馆');line(407,383,444,414,C.orange,4);line(407,414,444,383,C.orange,4);hit('gallery-door','锁着的美术馆正门',395,337,65,96,()=>say('入口关了。可是展品好像可以进去。'));let center=254+Math.sin(s.t*.75)*42;poly([[252,302],[center-62,436],[center+62,436]],'#efc56140',null);rect(224,277,64,41,C.green,8);ellipse(256,300,14,14,C.paper);ellipse(256,300,7,7,C.ink);rect(231,269,19,10,C.orange,2);line(251,319,251,350);line(251,350,232,362);line(251,350,270,362);if(s.exposure>0){rect(center-26,354,52,6,'#ecedda',2);rect(center-26,354,52*s.exposure/.75,6,C.orange,2,null);}text('自动肖像收集器',252,382,12,C.green);}else{
   text('内 厅 · 画 中 有 人',238,90,22,C.green);const fs=[[22,248,157,177,400],[179,201,143,177,353],[322,159,150,179,312]];fs.forEach(([x,y,w,h,base],i)=>{line(x+w/2-20,y,x+w/2,y-22,'#9ba68c',2);line(x+w/2,y-22,x+w/2+20,y,'#9ba68c',2);rect(x,y,w,h,C.yellow,2);rect(x+7,y+7,w-14,h-14,i===1?'#d6bbab':C.blue,0);ellipse(x+w*.65,y+43,15,15,C.paper,null);poly([[x+8,base],[x+w*.4,base-46],[x+w-7,base]],'#9fb897',null);rect(x+6,base,w-12,13,C.green,1);text(['Ⅰ 日常','Ⅱ 走动','Ⅲ 外出'][i],x+w/2,y+h+15,11,C.green);});line(170,387,192,347,C.orange,3);line(313,341,336,306,C.orange,3);door(433,312,true,'出口');bird(240+Math.sin(s.t)*44,260,1,C.orange);text('↑',156,349,20,C.orange);text('↑',303,298,20,C.orange);
 }}
});
function keyShape(x,y){ellipse(x,y,10,10,C.yellow);ellipse(x,y,4,4,C.paper);line(x+8,y+5,x+29,y+22,C.yellow,7);line(x+23,y+18,x+18,y+24,C.yellow,5);line(x+29,y+22,x+24,y+28,C.yellow,5);}
W.add(13,{
 init:()=>({time:0,open:false,keyAway:false,keyX:318,keyY:234,draggingKey:false,aftermath:0}),
 cancel(s){if(!s.keyAway){s.draggingKey=false;s.keyX=318;s.keyY=234;}},
 update(s,dt){if(s.keyAway){s.keyX=s.p.x+31;s.keyY=s.p.y-43;s.aftermath+=dt;if(s.aftermath>.85)win();}},
 draw(s){background('inside');ellipse(91,125,29,29,C.paper);line(91,125,91,104);line(91,125,105,125);text('今天 · 08:00',91,171,13,C.green);line(76,253,95,253,C.ink,3);line(95,253,95,264);text('空挂钩',91,288,13,C.green);
   rect(215,143,230,238,C.green,8);rect(224,174,211,195,s.time===0?'#dce2cc':'#e5cda7',3);text('记 忆 窗',329,125,20,C.green);text(['今天 08:00','昨天 20:00','昨天 17:00'][s.time],329,160,14,C.paper);ellipse(263,215,19,19,C.paper);line(263,215,263,201);line(263,215,s.time===1?250:275,220);line(308,211,319,211);line(319,211,319,224);
   if(s.time>0){actor(391,349,-1,.72);if(s.keyAway)text('钥匙呢？报修！',331,287,14,C.orange);}else text('这里也空了',329,273,14,C.green);
   if(s.time===2){keyShape(377,317);text('还没挂上',329,287,13);}if(s.time===1&&!s.keyAway&&!s.draggingKey)keyShape(318,234);
   if(!s.open){rect(225,175,210,193,'#c2d6ca66',2);line(329,176,329,367,'#56745d',4);line(245,200,280,250,'#f7f3df',3);rect(420,253,9,37,C.yellow,2);}else{poly([[435,174],[467,193],[467,358],[435,367]],'#b8cfb7');line(453,271,460,271,C.yellow,5);}
   hit('memory-open','记忆窗窗扣，开合窗户',412,244,53,62,()=>{s.open=!s.open;say(s.open?'昨天的风，真的吹到手上了。':'窗户关上了，玻璃挡住了手。');});
   rect(230,391,58,30,C.paper,4);text('◀ 时段',259,406,11);rect(369,391,65,30,C.paper,4);text('时段 ▶',401,406,11);const shift=d=>{s.time=(s.time+d+3)%3;s.keyX=318;s.keyY=234;s.draggingKey=false;say(['现在的挂钩是空的。','昨天晚上，它还好好挂着。','昨天傍晚，小岔还把钥匙攥在手里。'][s.time]);};hit('memory-prev','记忆窗上一个时段',224,383,71,44,()=>shift(1));hit('memory-next','记忆窗下一个时段',361,383,78,44,()=>shift(-1));
   if(s.time===1&&!s.keyAway){hit('past-key','过去挂钩上的钥匙',295,215,61,57,()=>say(s.open?'钥匙就在开着的窗里，伸手拖出来试试。':'手碰到了玻璃，要先开窗。'),(x,y)=>{if(!s.open){say('手碰到了玻璃，要先开窗。');return;}s.draggingKey=true;s.keyX=x;s.keyY=y;},()=>{if(s.draggingKey&&s.keyX<220&&s.keyY>291){s.keyAway=true;say('钥匙离开了昨天。窗里的小岔摸了摸空挂钩……');}else{s.draggingKey=false;s.keyX=318;s.keyY=234;}});}
   if(s.draggingKey||s.keyAway)keyShape(s.keyX,s.keyY);const paperX=202-Math.sin(s.t*.8)*33;poly([[paperX,371],[paperX+28,364],[paperX+25,387],[paperX-4,391]],C.paper);text('昨',paperX+12,376,10,C.green);line(184,355,159,361,'#aebba1',1,[3,4]);
 }
});
function echoUpdate(s,dt){s.light=Math.max(0,s.light-dt);const old=s.echoes;s.echoes=[];for(const e of old){e.t+=dt;if(e.t<.65){s.echoes.push(e);continue;}if(e.to<0)continue;if(e.from<0||s.facing[e.to]===(e.from===0?-1:1)){s.light=1.8;s.lastHeard=s.t;s.heard++;tone(e.to?620:510,.07);const direction=s.facing[e.to],target=e.to===0?1:0;s.echoes.push({from:e.to,to:direction===(e.to===0?1:-1)?target:-2,t:0});}}}
function parrots(s,y=272){const xs=[161,315];for(let i=0;i<2;i++){line(xs[i]-24,y+14,xs[i]+24,y+14,'#9fa990',4);bird(xs[i],y,s.facing[i],i?C.orange:C.green);text(i?'阿橘':'阿绿',xs[i],y+36,11,C.green);text('↻',xs[i]+29,y-16,20,'#788c70');hit('bird'+i,(i?'阿橘':'阿绿')+'鹦鹉，点击转身',xs[i]-29,y-47,67,64,()=>{s.facing[i]*=-1;say(s.facing[0]===1&&s.facing[1]===-1?'它们终于看见了彼此。':'这只鹦鹉转头看向别处。');});}for(const e of s.echoes){let start=e.from<0?80:xs[e.from],end=e.to<0?(e.from===0?-35:500):xs[e.to],p=e.t/.65;let x=start+(end-start)*p;ellipse(x,y-20,13,13,'#e8cb7050',null);text('♪',x,y-20,23,C.orange);line(x-10,y-8,x+9,y-8,C.yellow,2);}}
W.add(11,{
 init:()=>({facing:[1,1],echoes:[],light:0,lastHeard:0,heard:0,blocked:false}),
 update(s,dt){echoUpdate(s,dt);if(s.light<=0&&s.p.x>184){s.p.x=177;if(!s.blocked){say('灯灭了，小岔摸着墙退回来。一次拍手只能撑一小会儿。');s.blocked=true;}}if(s.p.x>420&&s.light>0)win();},
 draw(s){background('inside');rect(204,174,276,262,s.light>0?'#ece8c4':'#58665a',3,null);for(let x=223;x<470;x+=65){line(x,180,x,424,s.light>0?'#d5d3b8':'#6c7969',2);}door(432,436,true,'楼道出口');line(239,36,239,121,C.ink,2);poly([[217,119],[260,119],[271,141],[207,141]],C.yellow);if(s.light>0){poly([[209,144],[270,144],[414,428],[103,428]],'#ffeec438',null);ellipse(238,142,10,5,C.paper,null);}text(s.light>0?'灯 亮 着':'声 控 灯',239,76,13,C.green);parrots(s);ellipse(78,346,33,27,C.paper);text('👏',78,342,27);text('拍手',78,386,13,C.green);hit('clap','小岔拍手',43,310,70,72,()=>{s.light=1.8;s.echoes.push({from:-1,to:0,t:0});s.blocked=false;tone(250,.08);say('啪！阿绿听见了。看看另一只朝着哪边。');});
 }
});
W.add(9,{
 init:()=>({coinT:0,flight:false,landed:false,preview:1.6}),
 platforms:()=>[{x:288,y:237,w:192,h:14}],
 update(s,dt){s.preview=Math.max(0,s.preview-dt);if(s.coinT>0)s.coinT=Math.max(0,s.coinT-dt);if(s.flight){s.p.x+=140*dt;s.p.vy+=1050*dt;s.p.y+=s.p.vy*dt;if(s.p.vy>0&&s.p.y>=237&&s.p.x>288){s.p.y=237;s.p.vy=0;s.flight=false;s.manual=false;s.locked=false;s.landed=true;say('成功退到二楼。工具包就在旁边。');}if(s.p.y>450){s.flight=false;s.manual=false;s.locked=false;s.p.x=175;s.p.y=436;s.p.vy=0;}}if(s.p.x>393&&s.p.y<241&&s.landed)win();},
 draw(s){background('inside');rect(288,237,192,14,C.green,2);line(317,251,345,279,'#abbba0',4);rect(394,202,40,33,C.yellow,4);line(405,202,405,194);line(405,194,422,194);line(422,194,422,202);text('工具包',414,176,13,C.green);hit('bag','二楼的工具包',384,185,61,50,()=>say('工具包在二楼，手还够不到。它不是能隔空拖动的。'));
   rect(125,278,116,158,C.orange,8);rect(137,293,69,81,C.paper,6);text('只 售 饮 料',172,310,11);for(let x=150;x<199;x+=21){rect(x-5,331,12,29,C.mint,3);line(x-3,329,x+5,329);}rect(214,319,17,5,C.ink,1);rect(146,392,61,44,'#895845',5);rect(139,430,73,9,C.yellow,3);text('退币',174,412,13,C.paper);line(124,260,172,257,C.green,1,[3,4]);ellipse(106,260,16,16,C.yellow);text('¥',106,260,18);text('投币',106,230,12,C.green);hit('coin','投币硬币',79,232,53,58,()=>{s.coinT=1.5;tone(180,.18);if(Math.abs(s.p.x-175)<36&&s.p.y>422){s.flight=true;s.manual=true;s.locked=true;s.p.vy=-740;s.p.x=175;say('咔哒——退币槽把你一起弹出去了！');}else say('硬币飞上二楼又滚回来。托盘里，刚才好像还站得下一个人。');});
   ctx.save();ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(175,416);ctx.quadraticCurveTo(212,135,351,223);ctx.strokeStyle=C.orange;ctx.setLineDash([4,7]);ctx.stroke();ctx.restore();if((s.coinT>0||s.preview>0)&&!s.flight){let t=1-(s.coinT||s.preview)/1.6;let x=175+180*t,y=420-660*t+470*t*t;ellipse(x,y,9,9,C.yellow);text('¥',x,y,10);}face(223,359,1,'shy',.45);
 }
});
W.add(8,{
 init:()=>({wall:238,meal:false,delivered:false,blocked:false}),
 update(s){if(s.meal&&s.p.x>s.wall-23){s.p.x=s.wall-23;if(!s.blocked){say('饭不能离开本店！服务员指了指地上的店界。');s.blocked=true;}}if(s.wall>423&&!s.inside){s.inside=true;say('岗亭也在店里了！值班员被分到了靠窗包厢。');}if(s.wall<420)s.inside=false;},
 draw(s){background();rect(27,182,s.wall-27,254,'#efe2b7',4);rect(27,180,s.wall-27,28,C.orange,3);for(let x=31;x<s.wall-10;x+=31)rect(x,182,14,26,C.paper,0,null);text('不外带饭馆',Math.min(145,s.wall/2+12),155,23);line(29,431,s.wall,431,C.orange,4);for(let x=40;x<s.wall;x+=25)line(x,424,x+13,431,'#dfc58c',1);rect(373,246,73,190,C.mint,5);poly([[365,248],[409,214],[454,248]],C.green);text('值班',410,265,15,C.paper);actor(407,430,-1,1.1);line(378,435,444,435,C.orange,4);text('不可离岗',410,457,12,C.green);rect(70,365,75,12,C.green,3);line(80,377,80,436);line(135,377,135,436);if(!s.meal){ellipse(106,358,22,6,C.paper);ellipse(106,353,13,8,C.yellow);hit('meal','餐桌上的饭（走近拿取）',75,326,62,46,()=>{if(!near(106)){say('走到桌边，才能稳稳端起饭。');return;}s.meal=true;say('饭端好了。值班员还在窗外望着你。');});}else if(!s.delivered){ellipse(s.p.x+22,s.p.y-31,17,4,C.paper);ellipse(s.p.x+22,s.p.y-35,11,7,C.yellow);}
   rect(s.wall-8,210,16,213,C.mint,3);for(const y of [260,330])line(s.wall-5,y,s.wall-26,y-20,'#99ae90',3);ellipse(s.wall,431,9,9,C.ink);handle(s.wall,322);hit('wall','餐厅伸缩侧墙把手',s.wall-24,295,48,61,()=>say('侧墙脚下有轮子，墙上还有伸缩铰链。'),(x)=>{s.wall=clamp(x,195,458);s.blocked=false;});
   actor(175,365,-1,.85);text('只 准 堂 食',177,276,13,C.orange);hit('diner','岗亭里的值班员（走近送饭）',375,343,66,93,()=>{if(!s.meal){say('他肚子咕咕响。饭还在店里桌上。');return;}if(!near(407,65)){say('他伸长了手，还是够不到饭。');return;}if(s.wall<423){say('服务员：这里还是店外，饭不能过去。');return;}s.delivered=true;win();});if(s.delivered){ellipse(416,350,20,5,C.paper);ellipse(416,346,12,7,C.yellow);}
 }
});
W.add(2,{
 init:()=>({curtain:0,liftY:436,liftMode:'idle',scared:0,rider:false}),
 platforms:s=>[{x:285,y:252,w:195,h:14},{x:155,y:s.liftY,w:135,h:12}],
 update(s,dt){
   if(s.liftMode==='up'){s.liftY=Math.max(252,s.liftY-80*dt);s.p.x=220;s.p.y=s.liftY;s.p.vy=0;s.manual=true;s.locked=true;
     if(s.curtain<.9&&s.liftY<398){s.liftMode='down';s.scared=2;say('哇！好高！它看了一眼窗外，立刻往回缩。');tone(130,.25);}
     else if(s.liftY<=252){s.liftMode='arrived';s.manual=false;s.locked=false;s.p.x=275;s.p.grounded=true;say('电梯松开了扶手。二楼到了，走到右边下梯吧。');}
   }else if(s.liftMode==='down'){s.liftY=Math.min(436,s.liftY+100*dt);s.p.y=s.liftY;s.p.x=220;s.p.vy=0;if(s.liftY===436){s.liftMode='idle';s.manual=false;s.locked=false;}}
   s.scared=Math.max(0,s.scared-dt);if(s.liftMode==='arrived'&&s.p.x>350&&s.p.y<=254)win();
 },
 draw(s){background('inside');
   rect(323,66,113,149,C.blue,36);for(let i=0;i<3;i++)rect(332+i*31,163-i*20,22,43+i*20,'#83a9a2',2,null);line(380,67,380,214,'#f7f1df',5);line(325,139,434,139,'#f7f1df',5);
   rect(316,57,127,10,C.green,4);if(s.curtain>0){rect(320,66,119,148*s.curtain,C.orange,2);for(let x=333;x<440;x+=18)line(x,66,x,66+145*s.curtain,'#b55e43',2);}line(447,63,447,97+s.curtain*127,C.green,2);handle(447,107+s.curtain*127);hit('curtain','窗帘拉环',423,85+s.curtain*127,46,48,()=>say('圆环连着窗帘。试着顺着绳子往下拉。'),(x,y)=>{s.curtain=clamp((y-107)/127,0,1);if(s.curtain>.9)say('窗外被遮住了，电梯不再盯着高处。');});
   line(150,46,150,438,'#b1bca8',5);line(294,46,294,438,'#b1bca8',5);rect(145,39,155,22,C.mint,4);text('慢 慢 来 电 梯',221,51,12);
   const shake=s.scared>0?Math.sin(s.t*45)*3:0;ctx.save();ctx.translate(shake,0);rect(163,s.liftY-127,123,127,C.mint,14);rect(175,s.liftY-82,97,77,'#809982',4);face(222,s.liftY-108,1,s.scared>0?'fear':s.curtain>.9?'happy':'shy',.75);rect(159,s.liftY,130,10,C.green,3);rect(248,s.liftY-61,22,31,C.yellow,6);text('2',259,s.liftY-45,17);hit('lift','电梯内二楼按钮（走进电梯后操作）',238,s.liftY-73,44,52,()=>{if(s.liftMode!=='idle'){say('电梯正在慢慢来。');return;}if(!near(220,62)){say('按钮在电梯里面，先走进去。');return;}s.rider=true;s.liftMode='up';s.p.x=220;say('电梯攥紧了扶手，开始上楼……');});ctx.restore();
   rect(285,252,195,14,C.green,2);door(411,252,true,'二楼');text('1F',111,403,18,'#7c9173');text('2F',111,250,18,'#7c9173');sign('禁止吓唬电梯',73,319,107);
 }
});
})();
