import { useRef, useState, type ReactNode } from 'react';
import { Alert, App, Button, type ButtonProps } from 'antd';

/** Loading decoration must never change an action's accessible name. */
export function ActionButton({ children, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      aria-label={props['aria-label'] ?? (typeof children === 'string' ? children : undefined)}
      aria-busy={Boolean(props.loading)}
    >
      {children}
    </Button>
  );
}
/** Native semantic tables avoid rc-table's non-nonced scrollbar-measure style injection. */
export function DataTable<T extends { id: string }>({
  dataSource,
  columns,
  'aria-label': label = '数据列表',
}: {
  dataSource: T[];
  rowKey?: string;
  pagination?: false;
  'aria-label'?: string;
  columns: {
    title: string;
    key?: string;
    dataIndex?: keyof T;
    render?: (value: unknown, row: T) => ReactNode;
  }[];
}) {
  return (
    <table className="control-table" aria-label={label}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th scope="col" key={column.key ?? String(column.dataIndex ?? column.title)}>
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataSource.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column.key ?? String(column.dataIndex ?? column.title)}>
                {column.render
                  ? column.render(column.dataIndex ? row[column.dataIndex] : undefined, row)
                  : String(column.dataIndex ? (row[column.dataIndex] ?? '') : '')}
              </td>
            ))}
          </tr>
        ))}
        {!dataSource.length && (
          <tr>
            <td colSpan={columns.length}>暂无记录</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function useOperation() {
  const { message } = App.useApp();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作暂未完成，请稍后手动重试。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    run,
    clearError: () => setError(''),
    success: (text: string) => {
      void message.success(text);
    },
  };
}
export function Failure({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <Alert
      type="error"
      title={error}
      showIcon
      action={retry && <Button onClick={retry}>重新读取</Button>}
    />
  ) : null;
}
export function PageTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="control-title">
      <span className="eyebrow">CONTROL CENTER</span>
      <h1 id="page-title" tabIndex={-1}>
        {title}
      </h1>
      <p>{note}</p>
    </div>
  );
}
export const gameNames: Record<string, string> = {
  'cops-robbers': '围捕小队',
  'cops-robbers-realtime': '街区追捕',
  'letters-words2': '字母拼词',
  'vibeJam-myself-history-guess': '历史猜想',
  'xiangqi-five': '象五子棋',
  'flick-arena': '弹击竞技场',
  'carrom-club': '卡罗姆俱乐部',
  'cage-rescue': '笼中救援',
  'tower-brake': '穿云落星',
  'three-choose-two': '三选二',
  'carding-car': '卡丁车',
};
