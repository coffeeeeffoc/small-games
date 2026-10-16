import { useEffect, useState } from 'react';
import { Card } from 'antd';
import { dateLabel, type Audit, type ControlApi } from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  PageTitle,
  useOperation,
} from './control-common';

export function AuditPage({ api }: { api: ControlApi }) {
  const operation = useOperation();
  const [rows, setRows] = useState<Audit[]>([]);
  const load = async () => setRows(await api.read<Audit[]>('audit'));
  useEffect(() => {
    void operation.run(load);
  }, [api]);
  return (
    <>
      <PageTitle title="审计" note="查看最近 100 条追加式操作记录；只读展示，不修改历史。" />
      <Failure error={operation.error} />
      <div className="control-actions">
        <Button loading={operation.busy} onClick={() => void operation.run(load)}>
          刷新审计
        </Button>
      </div>
      <Card>
        <div className="table-scroll">
          <Table
            pagination={false}
            rowKey="id"
            aria-label="审计记录"
            dataSource={rows}
            columns={[
              {
                title: '时间 / 操作',
                key: 'action',
                render: (_, row) => (
                  <>
                    {dateLabel(row.createdAt)}
                    <small className="control-id">{row.action}</small>
                  </>
                ),
              },
              {
                title: '操作者 / 对象',
                key: 'target',
                render: (_, row) => (
                  <>
                    <span className="control-id">{row.actor}</span>
                    <small className="control-id">{row.target}</small>
                  </>
                ),
              },
              {
                title: '记录',
                key: 'detail',
                render: (_, row) => (
                  <pre className="audit-detail">{JSON.stringify(row.detail, null, 2)}</pre>
                ),
              },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
