import { createServer,request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { readFile,stat,realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../apps/shell-web/dist/',import.meta.url));
const rootReal=await realpath(root);
const runtime=Number(process.env.COMPETITION_PORT||43002),kart=Number(process.env.KART_SERVER_PORT||43003),port=Number(process.env.COMPETITION_GATEWAY_PORT||43010);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Permissions-Policy','fullscreen=(self)');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname.startsWith('/api/competition/v1/')) {
    if(url.pathname.startsWith('/api/competition/v1/internal/') || !/^\/(?:api\/competition\/v1\/(?:sessions\/(?:guest|platform)|me|boards\/[^/]+|rooms(?:\/[^/]+)?(?:\/(?:ready|leave|rematch|actions))?))$/.test(url.pathname)){res.writeHead(404);res.end();return;}
    const proxy=httpRequest({host:'127.0.0.1',port:runtime,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${runtime}`}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
    proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"SERVICE_UNAVAILABLE"}');});req.pipe(proxy);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(url.pathname==='/health'){
    const probe=httpRequest({host:'127.0.0.1',port:runtime,path:'/health',timeout:3000},upstream=>{res.writeHead(upstream.statusCode,{'content-type':'application/json'});upstream.pipe(res);});
    probe.on('timeout',()=>probe.destroy());probe.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end('{"status":"unavailable"}');});probe.end();return;
  }
  try {
    const decoded=decodeURIComponent(url.pathname);
    if(decoded.split('/').some(part=>part.startsWith('.')) || /[\\\0]/.test(decoded))throw new Error('Denied path');
    const filename=path.resolve(root,'.'+decoded+(decoded.endsWith('/')?'index.html':''));
    const resolved=await realpath(filename);
    if(!resolved.startsWith(rootReal+path.sep)||!(await stat(resolved)).isFile())throw new Error('Denied path');
    let content=await readFile(resolved);
    if(path.extname(resolved)==='.html') {
      const config=`<script>globalThis.__COMPETITION_CONFIG__={apiUrl:location.origin+'/api/competition/v1'};globalThis.__kartServerUrl=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/kart';</script>`;
      content=Buffer.from(content.toString().replace('<head>','<head>'+config));
    }
    res.setHeader('content-type',mime[path.extname(resolved)]||'application/octet-stream');res.setHeader('cache-control','no-cache');res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/kart'){socket.destroy();return;}
  const upstream=connect(kart,'127.0.0.1',()=>{
    upstream.write(`${req.method} /kart HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')+'\r\n\r\n');
    if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
  });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
});
server.listen(port,'127.0.0.1',()=>console.log(`Game test gateway http://127.0.0.1:${port} (static build + public API + /kart only)`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
