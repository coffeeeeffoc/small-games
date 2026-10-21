import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function sourceHash(directory=root){
  const files=['package.json','tsconfig.json'];
  for(const dir of ['assets','scripts','settings','startup'])for(const e of await readdir(path.join(directory,dir),{recursive:true,withFileTypes:true}))if(e.isFile())files.push(path.relative(directory,path.join(e.parentPath,e.name)).replaceAll('\\','/'));
  const h=createHash('sha256');
  for(const file of files.sort()){const b=await readFile(path.join(directory,file));h.update(file+'\0');h.update(/\.(ts|js|mjs|json|meta|scene|html|css|svg)$/.test(file)?b.toString().replaceAll('\r\n','\n'):b);}
  for(const file of ['toolchain.mjs','cocos-branding.mjs'])h.update(await readFile(new URL('../../carding-car/scripts/'+file,import.meta.url),'utf8').then(s=>s.replaceAll('\r\n','\n')));
  for(const file of ['game-rewards.js','platform-ads.js','interstitial.js','publishing.js'])h.update(await readFile(new URL('../../../../platforms/h5/'+file,import.meta.url),'utf8').then(s=>s.replaceAll('\r\n','\n')));
  h.update(await readFile(new URL('../../../../scripts/h5-ad-config.mjs',import.meta.url),'utf8').then(s=>s.replaceAll('\r\n','\n')));
  return h.digest('hex');
}
export async function verifyPrebuilt(directory){
  const dist=path.resolve(directory,'dist'),info=JSON.parse(await readFile(path.join(dist,'build-info.json'),'utf8'));
  if(info.creator!=='3.8.8'||info.target!=='web-mobile'||info.sourceHash!==await sourceHash())throw Error('归途站预构建与当前源码不匹配，请在 Creator 3.8.8 重新构建。');
  await access(path.join(dist,'index.html'));await access(path.resolve(directory,'cc.d.ts'));return dist;
}
