import { Alert, Card, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import { ruleAdvice, ruleKinds, ruleSupport, runtimeReport } from './night-compatibility';
import type { NightRuleKind, NightRuntimeStatus } from './night-compatibility';

export function NightRuleStatus({
  kind,
  rule,
  status,
  block,
  preview = false,
}: {
  kind: NightRuleKind;
  rule: string;
  status?: NightRuntimeStatus;
  block?: string;
  preview?: boolean;
}) {
  const support = ruleSupport(kind, rule, status);
  const server = runtimeReport(status)?.[kind];
  const [color, label] = {
    current: ['green', '支持当前规则'],
    retained: ['green', '支持保留规则'],
    unsupported: ['red', '缺少规则执行器'],
    unknown: ['orange', '待核实'],
    partial: ['orange', '部分实例待核实'],
  }[support];
  const admission = !preview && (support === 'current' || support === 'retained');
  return (
    <div className="night-rule-status">
      <Tag color={block ? undefined : color}>
        {block ??
          (admission ? (support === 'retained' ? '可开新局 · 保留规则' : '可开新局') : label)}
      </Tag>
      <code>{rule}</code>
      {block && <small className="control-help">{label}</small>}
      {support === 'unsupported' && server && (
        <small className="control-help">{ruleAdvice(rule, server)}</small>
      )}
    </div>
  );
}

export function NightRuntimeView({
  status,
  refresh,
  loading,
}: {
  status?: NightRuntimeStatus;
  refresh: () => void;
  loading: boolean;
}) {
  const report = runtimeReport(status);
  return (
    <Card
      title="运行实例支持的规则"
      extra={
        <Button color="primary" variant="filled" loading={loading} onClick={refresh}>
          刷新服务端规则
        </Button>
      }
    >
      <p className="control-help">
        单人规则用于回放和成绩校验，双人规则用于联机匹配和对战。每 30 秒读取运行实例，60 秒后过期。
      </p>
      {report ? (
        <>
          <p>
            读取于 {dateLabel(status!.checkedAt)} · 实例 <code>{report.instanceId}</code>
          </p>
          <div className="table-scroll night-runtime-rules">
            <Table
              aria-label="服务端实际规则"
              dataSource={ruleKinds.map(([id, label]) => ({ id, label, ...report[id] }))}
              columns={[
                { title: '规则类型', dataIndex: 'label' },
                { title: '部署默认规则', dataIndex: 'current' },
                {
                  title: '仍受支持的旧规则',
                  key: 'supported',
                  render: (_, row) => {
                    const retained = row.supported.filter((rule) => rule !== row.current);
                    return retained.length
                      ? retained.map((rule) => <Tag key={rule}>{rule}</Tag>)
                      : '无';
                  },
                },
              ]}
            />
          </div>
          {status!.otherInstances.length > 0 && (
            <Alert
              type="warning"
              title="发现其他活跃实例，兼容覆盖尚未核实"
              description={`已读取上方实例；其他心跳实例：${status!.otherInstances.join('、')}。请检查是否混合部署了不同版本。`}
            />
          )}
        </>
      ) : (
        <Alert
          type="warning"
          title="服务端规则待核实"
          description={
            status?.error === 'NOT_CONFIGURED'
              ? '后管尚未配置 ADMIN_RUNTIME_ORIGIN。请指向同环境的内部 Runtime 地址并部署新版服务。'
              : '读取失败、报告过期或服务端尚未支持版本查询。请检查 Runtime 与后管部署及内部连接；暂不能判断兼容。'
          }
        />
      )}
    </Card>
  );
}
