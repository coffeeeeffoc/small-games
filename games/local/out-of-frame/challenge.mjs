export function readChallenge(search,levels) {
  const query=new URLSearchParams(search);
  if(query.get('challenge')!=='frame-v1')return null;
  const index=levels.findIndex(level=>level.id===query.get('level'));
  if(index<0)return null;
  const value=query.get('targetMs')??'';
  const target=/^\d{1,7}$/.test(value)&&Number(value)<=3600000?Number(value):null;
  return {index,target};
}
