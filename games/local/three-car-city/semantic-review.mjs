// Development-only TypeSafe review; credentials never enter the browser or evidence.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const key=process.env.TYPESAFE_API_KEY;
if(!key)throw new Error('Set TYPESAFE_API_KEY before running the semantic review');
const candidates=['一城三辆车','小城救援队','小城救急','全城救急','救援接力','城市救援调度'];
const state={
  mechanics:'玩家指挥三辆同能力服务车，在六路口小城处理火情、寻宠、道路清障、停电。必须在期限前赶到并完成服务。清障与复电能恢复道路，使正在赶路的其他车辆加速。车辆有限，选择谁去哪里、何时修路、走哪条路线是关键。不是驾驶竞速，不是城市建设，也不是三人联机。',
  essence:'分派救援、疏通道路，让同伴及时赶到。',
  audience:'中文休闲游戏玩家，鼠标或手机触控，首次操作未读说明。',
  candidates,
  interactions:{old:'点选、拖动车辆、派单或取消均暂停全城，必须另点继续；只支持先选车；拖动没有跟手反馈，只认事件卡片。',proposed:'点车再点现场、先点现场再选车、把车拖到现场都能派遣。选车高亮可派现场，选现场高亮可用车；拖动有连线、跟手车标和目标预览，现场卡片及其路口均可接收。第一次成功派遣自动出发；之后选车、派单、取消不改变运行状态；主动暂停和切后台保持暂停。固定三个车位按钮显示空闲、赶路、处理中，现场显示车号。处理中不能改派，提示换空闲车，不中断服务。'},
  constraint:'只评价语义贴合与操作预期；模型判断不是实际用户测试，也不能证明代码正确。'
};
const questions={
  essence:{type:'choice',instructions:'哪一种语义最准确概括 mechanics 中决定成败的核心玩法？',criteria:{coordination:'调配有限救援车辆，用修路与路线选择互相帮助、及时完成救援',count:'欣赏一座城和三辆车的数量组合',driving:'操纵方向油门赢得赛车比赛',building:'规划建造经营城市',none:'都不符合'}},
  name:{type:'choice',instructions:'给 mechanics 对应的中文休闲小游戏选一个最自然易懂、符合救援协作精髓的名称。不要只数城市或车辆，不暗示驾驶竞速、建造、纯医疗或多人联机。',criteria:Object.fromEntries([...candidates.map(x=>[x,x]),['none','所有候选都不合适']])},
  switching:{type:'choice',instructions:'A车正在处理火情，玩家点击B车准备处理别处。哪种反应符合其操作意图？',criteria:{continue:'只选中B车，A车继续处理；运行时钟不改变',pause:'立即停止所有车辆，必须另点继续',cancel:'终止A车任务',none:'信息不足'}},
  target_first:{type:'choice',instructions:'未选车时玩家先点击火情现场，下一步点击一辆空闲车。哪种解释最自然？',criteria:{dispatch:'把所点车辆派到刚选中的火情现场',ignore:'丢弃第一次点击，要求重新点现场',pause:'暂停全城，不派遣',none:'信息不足'}},
  interaction:{type:'score',instructions:'proposed 相对 mechanics 的派遣操作是否符合首次玩家常见的点击和拖动预期？只评价设计，不把描述当作已经验证的实现。',criteria:['需猜隐藏顺序，反馈误导','能操作但需要记住额外步骤','多数常见尝试有清晰反馈，但存在明显障碍','车先、现场先和拖动均有直接反馈，操作不意外打断其他任务']}
};
for(const [i,name] of candidates.entries())questions['fit_'+i]={type:'score',instructions:`名称「${name}」是否准确表达 mechanics 的城市救援玩法，而非只罗列场景道具或暗示另一种玩法？`,criteria:['与玩法冲突','只表达场景或道具，缺少玩家行动','表达救急或调度，未体现城市救援整体','自然表达城市救援身份或行动，且不引入错误玩法预期']};
const request={model:'jev-latest',state,questions};
const sources={};
for(const file of ['simulation.mjs','game.js','index.html'])sources[file]=createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex');
const evidence={evaluatedAt:new Date().toISOString(),sources,documentation:'https://docs.typesafe.ai/api',request};
const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
if(!response.ok){
  await writeFile(new URL('docs/semantic-review.json',import.meta.url),JSON.stringify({...evidence,status:'blocked',httpStatus:response.status},null,2)+'\n');
  throw new Error(`TypeSafe HTTP ${response.status}; no semantic judgment was obtained`);
}
const result=await response.json();
for(const [id,q] of Object.entries(questions)){
  const a=result.answers?.[id];assert.equal(a?.type,q.type,`Invalid answer ${id}`);
  if(q.type==='choice')assert(Object.hasOwn(q.criteria,a.choice),`Unknown option ${id}`);
  else assert(Number.isFinite(a.score)&&a.score>=0&&a.score<=q.criteria.length-1,`Invalid score ${id}`);
}
await writeFile(new URL('docs/semantic-review.json',import.meta.url),JSON.stringify({...evidence,status:'evaluated',result},null,2)+'\n');
console.log(JSON.stringify({model:result.model,answers:result.answers,usage:result.usage},null,2));
