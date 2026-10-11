export function readChallenge(search,levels) {
  const query=new URLSearchParams(search);
  if(query.get('challenge')!=='box-v1')return null;
  const index=levels.findIndex(level=>level.id===query.get('level'));
  if(index<0)return null;
  const faces=(query.get('faces')??'').split(',');
  if(faces.length!==2||faces[0]===faces[1]||faces.some(face=>!['front','back','top','bottom','left','right'].includes(face)))return null;
  const eligible=levels[index].initialViews?.eligiblePairs;
  if(eligible&&!eligible.some(pair=>pair.every(face=>faces.includes(face))))return null;
  const value=query.get('targetMoves')??'';
  const target=/^\d{1,7}$/.test(value)&&Number(value)<=10000?Number(value):null;
  return {index,target,faces};
}
