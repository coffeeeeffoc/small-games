import { useRef, useState } from 'react';
import { Alert, Card, Input, Modal, Select, Spin } from 'antd';
import { type ControlApi, dateLabel } from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  PageTitle,
  useOperation,
} from './control-common';
import './players-page.css';

type Query = { from?: string; to?: string; nickname?: string; shortId?: string; page: number };
type Player = {
  id: string;
  shortId: string;
  nickname: string | null;
  platform: string;
  createdAt: number;
  observedFrom: number | null;
  observedTo: number | null;
  coins: number | null;
  xp: number | null;
};
type List = {
  items: Player[];
  page: number;
  pageSize: number;
  total: number;
  nextPage: number | null;
};
type Detail = {
  player: Player;
  section: string;
  page: number;
  pageSize: number;
  total: number;
  nextPage: number | null;
  items: unknown[];
  truncated: boolean;
  coverage: Record<string, string>;
  excluded: string[];
};
const sections = [
  ['wallet', '资产与钱包'],
  ['records', '业务事件与对局'],
  ['results', '逐场成绩'],
  ['best', '最佳成绩'],
  ['rooms', '留存房间'],
  ['social', '社交关系与记录'],
  ['messages', '公聊'],
  ['directMessages', '私聊'],
  ['reports', '举报'],
  ['presence', '在线与禁言'],
].map(([value, label]) => ({ value, label }));
const day = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const observed = (at: number | null) => (at === null ? '未知' : dateLabel(at));

export function PlayersPage({ api }: { api: ControlApi }) {
  const operation = useOperation(),
    detailOperation = useOperation();
  const [from, setFrom] = useState(() => day(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(() => day(Date.now()));
  const [nickname, setNickname] = useState(''),
    [shortId, setShortId] = useState('');
  const [result, setResult] = useState<List>(),
    [query, setQuery] = useState<Query>();
  const [selected, setSelected] = useState<Player>(),
    [detail, setDetail] = useState<Detail>();
  const [section, setSection] = useState('wallet'),
    [size, setSize] = useState(20);
  const detailGeneration = useRef(0);
  async function search(input: Query) {
    setResult(undefined);
    const next = await api.queryPlayers<List>(input);
    setQuery(input);
    setResult(next);
  }
  async function loadDetail(player: Player, area = section, page = 1, pageSize = size) {
    const generation = ++detailGeneration.current;
    setSelected(player);
    setSection(area);
    setSize(pageSize);
    setDetail(undefined);
    const next = await api.playerDetail<Detail>({ id: player.id, section: area, page, pageSize });
    if (generation === detailGeneration.current) setDetail(next);
  }
  function close() {
    ++detailGeneration.current;
    setSelected(undefined);
    setDetail(undefined);
    detailOperation.clearError();
  }
  function clear() {
    setFrom('');
    setTo('');
    setNickname('');
    setShortId('');
    setResult(undefined);
    setQuery(undefined);
    operation.clearError();
  }
  const valid = Boolean(from && to) || Boolean(nickname.trim() || shortId.trim());
  return (
    <>
      <PageTitle
        title="夜航守望 · 玩家查询"
        note="只读查询玩家概览及业务 JSON；输入筛选后点击查询。"
      />
      <Alert
        type="info"
        showIcon
        title="基于留存登录 / 活跃记录"
        description="按北京时间整日范围匹配每日首次/末次访问观测，保留约 120 天，并非逐次登录流水。仅覆盖记录功能启用后的数据；没有观测的玩家显示未知，时间筛选不会命中。"
      />
      <Card title="筛选玩家">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void operation.run(() =>
              search({
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
                ...(shortId.trim() ? { shortId: shortId.trim() } : {}),
                page: 1,
              }),
            );
          }}
        >
          <div className="player-filters">
            <label>
              开始日期（北京时间）
              <Input
                aria-label="开始日期（北京时间）"
                type="date"
                min={day(Date.now() - 120 * 86400000)}
                max={to || day(Date.now())}
                value={from}
                disabled={operation.busy}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setResult(undefined);
                }}
              />
            </label>
            <label>
              结束日期（北京时间）
              <Input
                aria-label="结束日期（北京时间）"
                type="date"
                min={from || undefined}
                max={day(Date.now())}
                value={to}
                disabled={operation.busy}
                onChange={(e) => {
                  setTo(e.target.value);
                  setResult(undefined);
                }}
              />
            </label>
            <label>
              昵称
              <Input
                aria-label="昵称"
                placeholder="包含匹配"
                maxLength={100}
                allowClear
                value={nickname}
                disabled={operation.busy}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setResult(undefined);
                }}
              />
            </label>
            <label>
              短 ID
              <Input
                aria-label="短 ID"
                placeholder="#c3f58a3a"
                maxLength={9}
                allowClear
                value={shortId}
                disabled={operation.busy}
                onChange={(e) => {
                  setShortId(e.target.value);
                  setResult(undefined);
                }}
              />
            </label>
          </div>
          <p className="control-help">
            可清空时间，只按昵称或短 ID 查询。短 ID 匹配 UUID 前 8
            位，重号会分别列出；所有条件同时满足。
          </p>
          <div className="control-actions">
            <Button
              htmlType="submit"
              type="primary"
              loading={operation.busy}
              disabled={!valid || Boolean(from) !== Boolean(to)}
            >
              查询玩家
            </Button>
            <Button disabled={operation.busy} onClick={clear}>
              清空筛选
            </Button>
          </div>
        </form>
      </Card>
      <Failure error={operation.error} />
      <div aria-live="polite">
        {operation.busy ? (
          <Spin aria-label="正在查询玩家" />
        ) : !result ? (
          <p>尚未查询。请保留日期范围，或填写昵称 / 短 ID。</p>
        ) : null}
      </div>
      {result && (
        <Card title={`玩家概览 · 共 ${result.total} 人`}>
          <div className="table-scroll">
            <Table
              aria-label="玩家列表"
              dataSource={result.items}
              columns={[
                {
                  title: '玩家',
                  key: 'player',
                  render: (_, row) => (
                    <>
                      <strong>{row.nickname ?? '未设置昵称'}</strong>
                      <small className="control-id">{row.shortId}</small>
                    </>
                  ),
                },
                {
                  title: '最近留存访问',
                  key: 'seen',
                  render: (_, row) => observed(row.observedTo),
                },
                {
                  title: '金币 / 经验',
                  key: 'assets',
                  render: (_, row) => `${row.coins ?? '未知'} / ${row.xp ?? '未知'}`,
                },
                { title: '平台', dataIndex: 'platform' },
                {
                  title: '详情',
                  key: 'detail',
                  render: (_, row) => (
                    <Button
                      disabled={detailOperation.busy}
                      onClick={() => void detailOperation.run(() => loadDetail(row, 'wallet', 1))}
                    >
                      查看 JSON
                    </Button>
                  ),
                },
              ]}
            />
          </div>
          <div className="control-actions" aria-label="玩家分页">
            <Button
              disabled={operation.busy || result.page <= 1}
              onClick={() => void operation.run(() => search({ ...query!, page: result.page - 1 }))}
            >
              上一页
            </Button>
            <span>
              第 {result.page} 页 · 每页 {result.pageSize} 人 ·{' '}
              {result.nextPage ? '还有下一页' : '已到末页'}
            </span>
            <Button
              disabled={operation.busy || result.nextPage === null}
              onClick={() =>
                void operation.run(() => search({ ...query!, page: result.nextPage! }))
              }
            >
              下一页
            </Button>
          </div>
        </Card>
      )}
      <Modal
        title={`玩家业务 JSON${selected ? ` · ${selected.shortId}` : ''}`}
        open={Boolean(selected)}
        onCancel={close}
        width={1000}
        footer={<Button onClick={close}>关闭详情</Button>}
      >
        <p>
          按分类读取允许范围内的完整业务字段；当前 JSON
          只含所选分类当前页。历史按最新优先分页，跨页查询期间数据可能更新。
        </p>
        <div className="control-actions">
          <Select
            aria-label="业务分类"
            value={section}
            options={sections}
            disabled={detailOperation.busy}
            onChange={(value) => void detailOperation.run(() => loadDetail(selected!, value, 1))}
          />
          <Select
            aria-label="每页记录数"
            value={size}
            options={[1, 20, 50].map((value) => ({ value, label: `每页 ${value} 条` }))}
            disabled={detailOperation.busy}
            onChange={(value) =>
              void detailOperation.run(() => loadDetail(selected!, section, 1, value))
            }
          />
          <Button
            loading={detailOperation.busy}
            onClick={() =>
              void detailOperation.run(() => loadDetail(selected!, section, detail?.page ?? 1))
            }
          >
            重新读取详情
          </Button>
          <Button
            disabled={!detail || detailOperation.busy}
            onClick={() =>
              void detailOperation.run(async () => {
                await navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
                detailOperation.success('已复制当前分类 / 当前页 JSON');
              })
            }
          >
            复制 JSON
          </Button>
        </div>
        <Failure error={detailOperation.error} />
        {detailOperation.busy && <Spin aria-label="正在读取详情" />}
        {detail && (
          <>
            <Alert
              type={detail.truncated ? 'warning' : 'info'}
              title={detail.truncated ? '内容有截断，请勿当作完整记录' : '当前页业务记录未截断'}
              description={detail.coverage[detail.section]}
            />
            <p>
              本分类共 {detail.total} 条 · 第 {detail.page} 页 ·{' '}
              {detail.nextPage ? '还有下一页，尚未展示全部记录' : '已到本分类末页'}
              。其他分类请切换查看。
            </p>
            <details>
              <summary>JSON 覆盖范围与排除项</summary>
              <ul>
                {Object.entries(detail.coverage).map(([key, value]) => (
                  <li key={key}>{value}</li>
                ))}
              </ul>
              <p>
                排除：{detail.excluded.join('；')}
                。原始仿真快照及动作回执是执行/重放内部数据，本查询提供对局业务与结算字段。
              </p>
            </details>
            <pre className="player-json" tabIndex={0} aria-label="玩家业务 JSON">
              {JSON.stringify(detail, null, 2)}
            </pre>
            <div className="control-actions">
              <Button
                disabled={detailOperation.busy || detail.page <= 1}
                onClick={() =>
                  void detailOperation.run(() => loadDetail(selected!, section, detail.page - 1))
                }
              >
                详情上一页
              </Button>
              <Button
                disabled={detailOperation.busy || detail.nextPage === null}
                onClick={() =>
                  void detailOperation.run(() => loadDetail(selected!, section, detail.nextPage!))
                }
              >
                详情下一页
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
