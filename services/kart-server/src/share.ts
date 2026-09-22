// The tunnel client manages its own account and credentials. Only its public origin is needed here.
const address = process.argv[2];
let url: URL;
try {
  url = new URL(address);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error();
} catch {
  throw new Error('用法：pnpm --filter @coffeeeeffoc/kart-server share https://你的隧道域名');
}
process.env.KART_ALLOWED_ORIGINS = [
  url.origin,
  `http://127.0.0.1:${process.env.KART_SERVER_PORT ?? 43003}`,
  `http://localhost:${process.env.KART_SERVER_PORT ?? 43003}`,
  process.env.KART_ALLOWED_ORIGINS,
]
  .filter(Boolean)
  .join(',');
await import('./main.ts');
console.log(`好友联机地址：${url.origin}/play/`);
console.log(
  `将隧道转发到 127.0.0.1:${process.env.KART_SERVER_PORT ?? 43003}。保持电脑、此服务和隧道客户端运行。`,
);
