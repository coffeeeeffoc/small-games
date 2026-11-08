import { useState } from 'react';
import { Alert, Card, Checkbox, Input, InputNumber, Tag } from 'antd';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import {
  defaultNightOperations,
  type NightAnnouncement,
  type NightCompensation,
  type NightOperations,
} from './night-operations-model';

const localTime = (time?: number) =>
  time !== undefined && Number.isFinite(time)
    ? new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    : '';
function MessageFields({
  value,
  locked,
  disabled,
  change,
}: {
  value: NightAnnouncement;
  locked: boolean;
  disabled: boolean;
  change: (patch: Partial<NightAnnouncement>) => void;
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
        disabled={disabled || locked}
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
        disabled={disabled || locked}
        onChange={(e) => change({ body: e.target.value })}
      />
      <div className="operation-fields">
        <div>
          <label htmlFor={'start-' + value.id}>开始时间</label>
          <Input
            id={'start-' + value.id}
            aria-label="开始时间"
            type="datetime-local"
            step={1}
            value={localTime(value.startsAt)}
            disabled={disabled || locked}
            onChange={(e) => change({ startsAt: new Date(e.target.value).getTime() })}
          />
        </div>
        <div>
          <label htmlFor={'end-' + value.id}>结束时间{'reward' in value ? '' : '（可留空）'}</label>
          <Input
            id={'end-' + value.id}
            aria-label="结束时间"
            type="datetime-local"
            step={1}
            value={localTime(value.endsAt)}
            disabled={disabled || locked}
            onChange={(e) =>
              change({ endsAt: e.target.value ? new Date(e.target.value).getTime() : undefined })
            }
          />
        </div>
      </div>
      <div className="control-check">
        <Checkbox
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        >
          启用此消息
        </Checkbox>
      </div>
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
  const entries = operations[kind];
  const selected = entries.find((e) => e.id === selectedId);
  const compensation =
    selected && 'reward' in selected ? (selected as NightCompensation) : undefined;
  const locked = !!compensation && publishedIds.has(compensation.id);
  const edit = (patch: Partial<NightCompensation>) => {
    if (!selected) return;
    change({
      ...operations,
      [kind]: entries.map((e) => (e.id === selected.id ? { ...e, ...patch } : e)),
    });
  };
  const add = () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const item: NightAnnouncement = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      startsAt: now,
      enabled: false,
    };
    const entry =
      kind === 'compensations'
        ? {
            ...item,
            endsAt: now + 7 * 86400000,
            eligibleCreatedBefore: now,
            reward: { coins: 0, xp: 0, packs: 0 },
          }
        : item;
    change({ ...operations, [kind]: [...entries, entry] });
    setSelectedId(item.id);
    setPlayersText('');
  };
  return (
    <Card title="公告与补偿">
      <p className="control-help">
        时间按当前浏览器时区显示。保存草稿后还需发布；停用补偿只停止后续投递，已到信箱的附件仍可领取。
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
          disabled={disabled || entries.length >= (kind === 'announcements' ? 50 : 100)}
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
              render: (_, row) => (
                <>
                  <Tag>{row.enabled ? '启用' : '停用'}</Tag>
                  <small className="control-id">
                    {dateLabel(row.startsAt)}
                    {row.endsAt ? ' 至 ' + dateLabel(row.endsAt) : ''}
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
            <Alert type="info" title="此补偿已发布，内容、奖励与资格已锁定；可以暂停或恢复投递。" />
          )}
          <MessageFields value={selected} disabled={disabled} locked={locked} change={edit} />
          {compensation && (
            <>
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
              <label htmlFor="eligible-before">补偿账号注册截止时间</label>
              <Input
                id="eligible-before"
                aria-label="补偿账号注册截止时间"
                type="datetime-local"
                step={1}
                value={localTime(compensation.eligibleCreatedBefore)}
                disabled={disabled || locked}
                onChange={(e) =>
                  edit({ eligibleCreatedBefore: new Date(e.target.value).getTime() })
                }
              />
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
                留空面向截止时间前的全部账号；指定玩家仍受注册截止时间限制。每位符合条件的玩家仅领取一次。
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
