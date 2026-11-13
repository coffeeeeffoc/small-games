import { Alert, Card, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import {
  buildCompatibility,
  ruleAdvice,
  ruleKinds,
  runtimeReport,
  type NightRuntimeStatus,
} from './night-compatibility';
import type { NightBuild } from './night-operations-model';

export function Compatibility({
  build,
  status,
}: {
  build: Pick<NightBuild, 'ranked' | 'multiplayer'>;
  status?: NightRuntimeStatus;
}) {
  const result = buildCompatibility(build, status),
    report = runtimeReport(status);
  return (
    <div>
      <Tag color={result === '兼容' ? 'green' : result === '不兼容' ? 'red' : 'orange'}>
        {result}
      </Tag>
      {ruleKinds.map(([kind, label]) => (
        <div key={kind} className="control-help night-rule-comparison">
          <span>
            {label}客户端 <code>{build[kind]}</code>
          </span>
          {report && (
            <>
              <span>
                服务端 <code>{report[kind].current}</code>
              </span>
              <small>{ruleAdvice(build[kind], report[kind])}</small>
            </>
          )}
        </div>
      ))}
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
      title="当前运行服务端"
      extra={
        <Button color="primary" variant="filled" loading={loading} onClick={refresh}>
          刷新服务端版本
        </Button>
      }
    >
      <p className="control-help">
        直接读取运行实例实际加载的规则；每 30 秒刷新，60
        秒后过期。版本登记和“启用”开关不代表服务端支持。
      </p>
      {report ? (
        <>
          <p>
            读取于 {dateLabel(status!.checkedAt)} · 实例 <code>{report.instanceId}</code>
          </p>
          <div className="table-scroll">
            <Table
              aria-label="服务端实际规则"
              dataSource={ruleKinds.map(([id, label]) => ({ id, label, ...report[id] }))}
              columns={[
                { title: '规则类型', dataIndex: 'label' },
                { title: '当前规则版本', dataIndex: 'current' },
                {
                  title: '实际支持（含保留旧版）',
                  key: 'supported',
                  render: (_, row) =>
                    row.supported.map((rule) => (
                      <Tag key={rule} color={rule === row.current ? 'blue' : undefined}>
                        {rule}
                      </Tag>
                    )),
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
          <p className="control-help">
            结论限于已读取的实例；未发现的实例不在覆盖范围内。后端兼容版本是登记绑定标识，实际部署版本见下方部署记录。
          </p>
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
