import { useState } from 'react';
import { Alert, Card, Input, InputNumber, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import {
  defaultNightOperations,
  LOGIN_RETENTION_DAYS,
  type NightAnnouncement,
  type NightCompensation,
  type NightOperations,
} from './night-operations-model';

const localTime = (time?: number) =>
  time !== undefined && Number.isFinite(time)
    ? new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    : '';
function TimeField({
  id,
  label,
  value,
  disabled,
  change,
}: {
  id: string;
  label: string;
  value?: number;
  disabled: boolean;
  change: (time: number | undefined) => void;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        aria-label={label}
        type="datetime-local"
        step={1}
        value={localTime(value)}
        disabled={disabled}
        onChange={(e) => change(e.target.value ? new Date(e.target.value).getTime() : undefined)}
      />
    </div>
  );
}
function MessageFields({
  value,
  disabled,
  change,
}: {
  value: { id: string; title: string; body: string };
  disabled: boolean;
  change: (patch: { title?: string; body?: string }) => void;
}) {
  return (
    <>
      <p className="control-id">编号：{value.id}</p>
      <label htmlFor={'title-' + value.id}>标题</label>
      <Input
        id={'title-' + value.id}
        aria-label="消息标题"
        maxLength={80}
        value={value.title}
        disabled={disabled}
        onChange={(e) => change({ title: e.target.value })}
      />
      <label htmlFor={'body-' + value.id}>正文</label>
      <Input.TextArea
        id={'body-' + value.id}
        aria-label="消息正文"
        maxLength={300}
        showCount
        rows={4}
        value={value.body}
        disabled={disabled}
        onChange={(e) => change({ body: e.target.value })}
      />
    </>
  );
}
export function NightMessagesEditor({
  value,
  disabled,
  publishedIds,
  change,
}: {
  value?: NightOperations;
  disabled: boolean;
  publishedIds: Set<string>;
  change: (next: NightOperations) => void;
}) {
  const operations = value ?? defaultNightOperations();
  const [kind, setKind] = useState<'announcements' | 'compensations'>('announcements');
  const [selectedId, setSelectedId] = useState('');
  const [playersText, setPlayersText] = useState('');
  const entries: (NightAnnouncement | NightCompensation)[] = operations[kind];
  const selected = entries.find((e) => e.id === selectedId);
  const compensation =
    selected && 'reward' in selected ? (selected as NightCompensation) : undefined;
  const announcement = selected && !compensation ? (selected as NightAnnouncement) : undefined;
  // Publication is final for compensation: no edits, no withdrawal, no removal.
  const locked = !!compensation && publishedIds.has(compensation.id);
  const edit = (patch: Partial<NightAnnouncement> | Partial<NightCompensation>) => {
    if (!selected) return;
    change({
      ...operations,
      [kind]: entries.map((e) => (e.id === selected.id ? { ...e, ...patch } : e)),
    });
  };
  const add = () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const base = { id: crypto.randomUUID(), title: '', body: '' };
    const entry: NightAnnouncement | NightCompensation =
      kind === 'compensations'
        ? {
            ...base,
            loginFrom: now - 86400000,
            loginTo: now,
            reward: { coins: 0, xp: 0, packs: 0 },
          }
        : { ...base, startsAt: now, enabled: true };
    change({ ...operations, [kind]: [...entries, entry] });
    setSelectedId(base.id);
    setPlayersText('');
  };
  return (
    <Card title="公告与补偿">
      <p className="control-help">
        时间按当前浏览器时区显示。保存草稿后需发布才生效。同一时间最多一条生效公告，可随时撤销；补偿发布后不可修改或撤销。
      </p>
      <div className="control-actions">
        <Button
          aria-pressed={kind === 'announcements'}
          onClick={() => {
            setKind('announcements');
            setSelectedId('');
          }}
        >
          公告管理
        </Button>
        <Button
          aria-pressed={kind === 'compensations'}
          onClick={() => {
            setKind('compensations');
            setSelectedId('');
          }}
        >
          补偿管理
        </Button>
        <Button
          disabled={disabled || entries.length >= (kind === 'announcements' ? 50 : 200)}
          onClick={add}
        >
          {kind === 'announcements' ? '新增公告' : '新增补偿'}
        </Button>
      </div>
      <div className="table-scroll">
        <Table
          aria-label={kind === 'announcements' ? '公告列表' : '补偿列表'}
          dataSource={entries}
          columns={[
            {
              title: '标题',
              key: 'title',
              render: (_, row) => (
                <>
                  <strong>{row.title || '未填写标题'}</strong>
                  <small className="control-id">{row.id}</small>
                </>
              ),
            },
            {
              title: '状态 / 时间',
              key: 'status',
              render: (_, row) =>
                'reward' in row ? (
                  <>
                    <Tag>{publishedIds.has(row.id) ? '已发布' : '草稿'}</Tag>
                    <small className="control-id">
                      登录 {dateLabel(row.loginFrom)} 至 {dateLabel(row.loginTo)}
                    </small>
                  </>
                ) : (
                  <>
                    <Tag>{row.enabled ? '生效' : '已撤销'}</Tag>
                    <small className="control-id">
                      {dateLabel(row.startsAt)}
                      {row.endsAt ? ' 至 ' + dateLabel(row.endsAt) : ' 起长期'}
                    </small>
                  </>
                ),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, row) => (
                <Button
                  onClick={() => {
                    setSelectedId(row.id);
                    setPlayersText(
                      'playerIds' in row
                        ? ((row as NightCompensation).playerIds?.join('\n') ?? '')
                        : '',
                    );
                  }}
                >
                  查看 / 编辑
                </Button>
              ),
            },
          ]}
        />
      </div>
      {selected && (
        <section aria-label="消息编辑">
          {locked && (
            <Alert type="info" title="此补偿已发布，内容、奖励与登录范围均已锁定，不可撤销。" />
          )}
          <MessageFields value={selected} disabled={disabled || locked} change={edit} />
          {announcement && (
            <>
              <div className="operation-fields">
                <TimeField
                  id={'start-' + announcement.id}
                  label="生效时间"
                  value={announcement.startsAt}
                  disabled={disabled}
                  change={(t) => edit({ startsAt: t ?? NaN })}
                />
                <TimeField
                  id={'end-' + announcement.id}
                  label="失效时间（可留空）"
                  value={announcement.endsAt}
                  disabled={disabled}
                  change={(t) => edit({ endsAt: t })}
                />
              </div>
              <div className="control-actions">
                <Button
                  disabled={disabled}
                  onClick={() => edit({ enabled: !announcement.enabled })}
                >
                  {announcement.enabled ? '撤销公告' : '恢复公告'}
                </Button>
              </div>
            </>
          )}
          {compensation && (
            <>
              <div className="operation-fields">
                <TimeField
                  id="login-from"
                  label="登录时间范围开始"
                  value={compensation.loginFrom}
                  disabled={disabled || locked}
                  change={(t) => edit({ loginFrom: t ?? NaN })}
                />
                <TimeField
                  id="login-to"
                  label="登录时间范围结束"
                  value={compensation.loginTo}
                  disabled={disabled || locked}
                  change={(t) => edit({ loginTo: t ?? NaN })}
                />
              </div>
              <div className="operation-fields">
                {(['coins', 'xp', 'packs'] as const).map((key, i) => (
                  <div key={key}>
                    <label htmlFor={'reward-' + key}>{['金币', '经验 EXP', '普通补给箱'][i]}</label>
                    <InputNumber
                      id={'reward-' + key}
                      aria-label={['补偿金币', '补偿经验', '补偿补给箱'][i]}
                      value={compensation.reward[key]}
                      min={0}
                      max={key === 'packs' ? 1000 : 1000000}
                      precision={0}
                      disabled={disabled || locked}
                      onChange={(n) => edit({ reward: { ...compensation.reward, [key]: n ?? 0 } })}
                    />
                  </div>
                ))}
              </div>
              <label htmlFor="compensation-players">指定玩家 ID（可留空，每行一个）</label>
              <Input.TextArea
                id="compensation-players"
                aria-label="指定玩家 ID"
                rows={3}
                value={playersText}
                disabled={disabled || locked}
                onChange={(e) => {
                  setPlayersText(e.target.value);
                  edit({
                    playerIds: e.target.value.trim()
                      ? e.target.value.trim().split(/\s+/)
                      : undefined,
                  });
                }}
              />
              <p className="control-help">
                范围内进入过游戏的玩家在下次进入时收到一封信箱消息，正文即上方文案，附件仅可领取一次。登录记录最多保留
                {LOGIN_RETENTION_DAYS} 天，范围结束时间不能晚于当前时间。
              </p>
            </>
          )}
          <div className="control-actions">
            <Button
              danger
              disabled={disabled || locked}
              onClick={() => {
                change({ ...operations, [kind]: entries.filter((e) => e.id !== selected.id) });
                setSelectedId('');
              }}
            >
              {compensation ? '移除未发布补偿' : '移除公告'}
            </Button>
            <Button onClick={() => setSelectedId('')}>收起编辑</Button>
          </div>
          <div className="operation-preview" aria-label="玩家消息预览">
            <strong>{selected.title || '标题预览'}</strong>
            <p>{selected.body || '正文预览'}</p>
            {compensation && (
              <p>
                {compensation.reward.coins} 金币 · {compensation.reward.xp} EXP ·{' '}
                {compensation.reward.packs} 补给箱
              </p>
            )}
          </div>
        </section>
      )}
    </Card>
  );
}
