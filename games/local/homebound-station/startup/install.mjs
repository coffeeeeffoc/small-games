import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
function runtime(){
  const panel=document.getElementById('station-loading'),status=document.getElementById('loading-status'),retry=document.getElementById('loading-retry');
  let engine,settled=false;
  const timer=setTimeout(fail,60000);
  function clean(){clearTimeout(timer);window.removeEventListener('homebound-ready',ready);}
  function fail(){if(settled)return;settled=true;clean();engine?.game.pause();panel.setAttribute('aria-busy','false');status.textContent='车站暂未打开，请检查网络后重试';panel.querySelector('progress').hidden=true;retry.hidden=false;}
  function ready(){status.textContent='车站就绪，欢迎接班';engine.director.once(engine.Director.EVENT_AFTER_DRAW,()=>{if(settled)return;settled=true;clean();panel.remove();document.getElementById('GameDiv')?.removeAttribute('inert');});}
  retry.onclick=()=>location.reload();window.addEventListener('homebound-ready',ready);
  window.HomeboundStartup={async boot(applicationPath){
    document.getElementById('GameDiv')?.setAttribute('inert','');
    try{const {Application}=await System.import(applicationPath);engine=await System.import('cc');if(settled)return;
      engine.game.onPostBaseInitDelegate.add(()=>{engine.settings.overrideSettings('splashScreen','totalTime',0);engine.settings.overrideSettings('splashScreen','logo',{type:'none'});engine.settings.overrideSettings('screen','exactFitScreen',true);});
      status.textContent='正在布置车站、出租车与乘客…';const app=new Application();await app.init(engine);await app.start();
    }catch(error){fail();console.error('[homebound-station startup]',error);}
  }};
}
export async function installStartup(directory){
  const file=path.join(directory,'index.html');let html=await readFile(file,'utf8');
  const entry=html.match(/System\.import\(['"](\.\/index(?:\.[\w-]+)?\.js)['"]\)/)?.[1];if(!entry)throw Error('Unknown Creator web bootstrap');
  const source=await readFile(path.join(directory,entry),'utf8'),app=source.match(/['"](\.\/application(?:\.[\w-]+)?\.js)['"]/)?.[1];if(!app)throw Error('Missing Creator application module');
  html=html.replace(/<html(?:\s[^>]*)?>/,'<html lang="zh-CN">').replace(/<title>.*?<\/title>/,'<title>归途站 · Homebound Station</title>').replace('minimal-ui=true','viewport-fit=cover');
  html=html.replace('</head>',`<link rel="icon" href="./station-icon.png"><link rel="apple-touch-icon" href="./station-icon.png"><style>
  html,body,#GameDiv{margin:0;width:100%;height:100%;overflow:hidden}canvas{touch-action:none} [hidden]{display:none!important}
  #station-loading{position:fixed;inset:0;z-index:100;background:#fcf4e2;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;color:#225953;font:16px system-ui;text-align:center;padding:max(20px,env(safe-area-inset-top)) 24px;box-sizing:border-box}
  #station-loading img{width:min(46vw,220px);height:auto}#station-loading h1{font-size:36px;margin:0;letter-spacing:6px}#station-loading p{margin:0;max-width:90%;line-height:1.6}#station-loading small{letter-spacing:3px;font-size:10px}#station-loading progress{width:min(65vw,280px);height:8px;accent-color:#225953}#loading-retry{min-height:48px;border:0;border-radius:24px;background:#225953;color:#fff4de;padding:10px 28px;font:inherit}
  @media(max-height:440px){#station-loading{gap:8px}#station-loading img{width:110px}#station-loading h1{font-size:27px}}
  </style><script src="./dev-mode.js"></script><script type="module" src="./game-rewards.js"></script><script type="module">import {shareChallenge} from "./publishing.js";globalThis.HomeboundShare=(station)=>shareChallenge({title:"归途站 · 同班接驳",text:"一起接旅客回家",params:{station}});</script></head>`);
  html=html.replace(/<body([^>]*)>/,`<body$1><section id="station-loading" aria-label="归途站加载中" aria-busy="true"><img src="./station-icon.png" alt="归途站出租车图标"><h1>归途站</h1><small>HOMEBOUND STATION</small><progress aria-label="正在加载"></progress><p id="loading-status" role="status">正在打开车站…</p><button id="loading-retry" hidden>重新加载</button></section><script>(${runtime.toString()})();</script>`);
  let replaced=0;html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>{if(!script.includes(`System.import('${entry}')`)&&!script.includes(`System.import("${entry}")`))return script;replaced++;return `<script>window.HomeboundStartup.boot(${JSON.stringify(app)});</script>`;});
  if(replaced!==1)throw Error('Ambiguous Creator web bootstrap');
  await cp(new URL('./icon.png',import.meta.url),path.join(directory,'station-icon.png'));await writeFile(file,html);
}
