// Only data captured by the competition client can reach this UI. In particular,
// an Error message or arbitrary object is never rendered as connection metadata.
const panels = new WeakMap();
const stages = {
  session_transport: '建立会话：网络请求未完成',
  session_response: '建立会话：响应无法解析',
  session_http: '建立会话：服务未接受请求',
  request_transport: '业务请求：网络请求未完成',
  request_response: '业务请求：响应无法解析',
  request_http: '业务请求：服务未接受请求',
};
export function renderConnectionInfo(host, error) {
  panels.get(host)?.remove();
  panels.delete(host);
  const info = globalThis.__competition?.connectionInfo?.(error);
  if (!info || !Object.hasOwn(stages, info.stage)) return;
  const details = document.createElement('details');
  details.className = 'competition-connection-info';
  details.style.cssText =
    'font:12px/1.6 system-ui;text-align:left;overflow-wrap:anywhere;max-width:100%;max-height:40dvh;overflow:auto;flex:none;color:inherit';
  const summary = document.createElement('summary');
  summary.textContent = '查看连接信息';
  summary.style.cssText = 'min-height:44px;display:list-item;align-content:center;cursor:pointer';
  details.append(summary);
  for (const [label, value] of [
    ['页面来源（页面推导，未验证请求 Origin）', info.pageOrigin],
    ['API 地址', info.apiBase],
    ['失败阶段', stages[info.stage]],
    ['请求方法', info.method],
    ['请求头名称', info.headerNames.join(', ')],
  ]) {
    const row = document.createElement('div');
    row.textContent = `${label}：${value}`;
    details.append(row);
  }
  host.after(details);
  panels.set(host, details);
}
