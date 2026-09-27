import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const option = (name,fallback) => { const i=argv.indexOf(name); return i<0?fallback:argv[i+1]; };
const port = Number(option('--port','4402')), host = option('--host','127.0.0.1');
if (!Number.isInteger(port) || port<1 || port>65535 || !host) throw new Error('无效端口或主机');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    let urlPath = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (urlPath === '/weather-command') {res.writeHead(308,{Location:'/weather-command/'}).end();return;}
    if (urlPath.startsWith('/weather-command/')) urlPath=urlPath.slice('/weather-command'.length);
    if (urlPath.includes('\\') || urlPath.includes('\0')) {res.writeHead(400).end();return;}
    let file=path.resolve(root,'.'+urlPath);
    if (file!==root && !file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
    if ((await stat(file)).isDirectory()) file=path.join(file,'index.html');
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  } catch(error) {res.writeHead(error instanceof URIError?400:404).end('Not found');}
});
server.on('error',e=>{console.error(`天气指挥部启动失败：${e.code} ${e.message}`);process.exitCode=1;});
server.listen(port,host,()=>console.log(`天气指挥部 http://${host}:${port}/`));
