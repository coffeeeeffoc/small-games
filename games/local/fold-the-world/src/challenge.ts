export function readChallenge(search:string,count:number):{index:number;target:number|null}|null {
  const query=new URLSearchParams(search);
  if(query.get('challenge')!=='fold-v1')return null;
  const raw=query.get('level')??'';if(!/^\d{1,3}$/.test(raw))return null;
  const index=Number(raw)-1;if(index<0||index>=count)return null;
  const score=query.get('targetFolds')??'';const target=/^\d{1,4}$/.test(score)&&Number(score)<=1000?Number(score):null;
  return {index,target};
}
