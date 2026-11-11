import { useState } from 'react';
import { Alert, App, Input, InputNumber, Modal, Tag } from 'antd';
import { useUnsavedChanges } from './unsaved-changes';
import { ActionButton as Button, DataTable as Table } from './control-common';
import { dateLabel } from './control-api';
import {
  announcementStatus,
  announcementStatusNames,
  compensationStatus,
  compensationStatusNames,
  defaultNightOperations,
  goLive,
  LOGIN_RETENTION_DAYS,
  newCompensationError,
  REWARD_TOKEN,
  rewardText,
  same,
  type NightAnnouncement,
  type NightCompensation,
  type NightOperations,
} from './night-operations-model';

type Kind = 'announcements' | 'compensations';
type Entry = NightAnnouncement | NightCompensation;
const statusColors: Record<string, string> = {
  live: 'green',
  scheduled: 'blue',
  expired: 'default',
  offline: 'orange',
  draft: 'blue',
  published: 'green',
  voided: 'default',
};
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
/** Errors for one entry; list-wide rules (overlap, limits) stay with the save bar. */
function entryError(entry: Entry, isNew: boolean) {
  if (!entry.title.trim() || !entry.body.trim()) return '请填写标题和正文。';
  if ('reward' in entry) {
    if (!Number.isFinite(entry.loginFrom) || !Number.isFinite(entry.loginTo))
      return '请填写登录时间范围。';
    if (entry.loginTo <= entry.loginFrom) return '登录时间范围的结束必须晚于开始。';
    if (Object.values(entry.reward).every((n) => !n)) return '奖励至少一项大于零。';
    return isNew ? newCompensationError(entry) : '';
  }
  if (!Number.isFinite(entry.startsAt)) return '请填写生效时间。';
  if (entry.endsAt !== undefined && entry.endsAt <= entry.startsAt)
    return '失效时间必须晚于生效时间。';
  return '';
}
export function NightMessagesEditor({
  kind,
  value,
  published,
  disabled,
  publishedIds,
  change,
}: {
  kind: Kind;
  value?: NightOperations;
  published?: NightOperations;
  disabled: boolean;
  publishedIds: Set<string>;
  change: (next: NightOperations) => void;
}) {
  const { message } = App.useApp();
  const operations = value ?? defaultNightOperations();
  const announcements = kind === 'announcements';
  const entries: Entry[] = operations[kind];
  const [filter, setFilter] = useState('all');
  // The dialog edits a private copy; the draft changes only on 确定.
  const [editing, setEditing] = useState<{ entry: Entry; initial: Entry; isNew: boolean }>();
  const [playersText, setPlayersText] = useState('');
  const status = (e: Entry) =>
    'reward' in e ? compensationStatus(e, publishedIds) : announcementStatus(e);
  const names: Record<string, string> = announcements
    ? announcementStatusNames
    : compensationStatusNames;
  const shown = filter === 'all' ? entries : entries.filter((e) => status(e) === filter);
  const label = announcements ? '公告' : '补偿';
  // Published compensation is final; voided entries are read-only until restored.
  const readOnly = (e: Entry) => 'reward' in e && (publishedIds.has(e.id) || !!e.voided);
  const save = (list: Entry[]) => change({ ...operations, [kind]: list });
  const replace = (entry: Entry) => save(entries.map((e) => (e.id === entry.id ? entry : e)));
  const open = (entry: Entry, isNew = false) => {
    setEditing({ entry, initial: entry, isNew });
    setPlayersText('playerIds' in entry ? (entry.playerIds?.join('\n') ?? '') : '');
  };
  const add = () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const base = { id: crypto.randomUUID(), title: '', body: '' };
    open(
      announcements
        ? { ...base, startsAt: now, enabled: false }
        : {
            ...base,
            loginFrom: now - 86400000,
            loginTo: now,
            reward: { coins: 0, xp: 0, packs: 0 },
          },
      true,
    );
  };
  const draft = editing?.entry;
  const locked = !!draft && readOnly(draft);
  useUnsavedChanges(
    !!editing &&
      !locked &&
      (!same(draft, editing.initial) ||
        playersText !==
          ('playerIds' in editing.initial ? (editing.initial.playerIds?.join('\n') ?? '') : '')),
  );
  const edit = (patch: Partial<NightAnnouncement> | Partial<NightCompensation>) =>
    setEditing(
      (current) => current && { ...current, entry: { ...current.entry, ...patch } as Entry },
    );
  const error = draft && !locked ? entryError(draft, !publishedIds.has(draft.id)) : '';
  const compensation = draft && 'reward' in draft ? draft : undefined;
  const announcement = draft && !compensation ? (draft as NightAnnouncement) : undefined;
  const statusTabs = ['all', ...Object.keys(names)].map((key) => ({
    key,
    name: key === 'all' ? '全部' : names[key],
    count: key === 'all' ? entries.length : entries.filter((e) => status(e) === key).length,
  }));
  return (
    <section aria-label={`${label}管理`}>
      <p className="control-help">
        {announcements
          ? '新增公告默认未上线。玩家同一时间最多看到一条公告：上线时，更早开始的重叠公告会在新公告生效时结束，其余重叠公告自动下线。'
          : '补偿发布后不可修改或作废；作废的草稿仅保留记录，不会发放。'}
        时间按当前浏览器时区显示，所有改动需在页面顶部“发布游戏配置”保存草稿并发布后生效。
      </p>
      {/* Plain wrapping tabs: AntD Tabs hide overflow in a menu that narrow screens cannot reach. */}
      <div className="status-bar">
        <div role="tablist" aria-label={`按状态筛选${label}`} className="status-tabs">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              className={filter === tab.key ? 'active' : undefined}
              onClick={() => setFilter(tab.key)}
            >
              {tab.name} <span className="count">{tab.count}</span>
            </button>
          ))}
        </div>
        <Button
          type="primary"
          disabled={disabled || entries.length >= (announcements ? 50 : 200)}
          onClick={add}
        >
          {`新增${label}`}
        </Button>
      </div>
      <div className="table-scroll">
        <Table
          aria-label={`${label}列表`}
          dataSource={shown}
          columns={[
            {
              title: '标题',
              key: 'title',
              render: (_, row) => (
                <>
                  <strong>{row.title}</strong>
                  <small className="control-id">{row.id}</small>
                </>
              ),
            },
            {
              title: '状态',
              key: 'status',
              render: (_, row) => {
                const before = published?.[kind].find((e) => e.id === row.id);
                return (
                  <div className="tag-row">
                    <Tag color={statusColors[status(row)]}>{names[status(row)]}</Tag>
                    {!('reward' in row) &&
                      (!before ? (
                        <Tag color="gold">未发布</Tag>
                      ) : !same(before, row) ? (
                        <Tag color="gold">有未发布改动</Tag>
                      ) : null)}
                  </div>
                );
              },
            },
            announcements
              ? {
                  title: '展示时间',
                  key: 'time',
                  render: (_, row) => {
                    const a = row as NightAnnouncement;
                    return (
                      <span className="nowrap-time">
                        {dateLabel(a.startsAt)}
                        <br />
                        {a.endsAt ? '至 ' + dateLabel(a.endsAt) : '起长期'}
                      </span>
                    );
                  },
                }
              : {
                  title: '登录范围 / 奖励',
                  key: 'range',
                  render: (_, row) => {
                    const c = row as NightCompensation;
                    return (
                      <span className="nowrap-time">
                        {dateLabel(c.loginFrom)} 至 {dateLabel(c.loginTo)}
                        <small className="control-id">
                          {c.reward.coins} 金币 · {c.reward.xp} EXP · {c.reward.packs} 补给箱
                          {c.playerIds ? ` · 指定 ${c.playerIds.length} 人` : ''}
                        </small>
                      </span>
                    );
                  },
                },
            {
              title: '操作',
              key: 'actions',
              render: (_, row) => {
                const c = 'reward' in row ? row : undefined;
                const a = c ? undefined : (row as NightAnnouncement);
                return (
                  <div className="row-actions">
                    <Button
                      type="link"
                      aria-label={`${readOnly(row) ? '查看' : '编辑'} ${row.title}`}
                      onClick={() => open(row)}
                    >
                      {readOnly(row) ? '查看' : '编辑'}
                    </Button>
                    {a && (
                      <Button
                        type="link"
                        disabled={disabled}
                        aria-label={`${a.enabled ? '下线' : '上线'} ${a.title}`}
                        onClick={() => {
                          if (a.enabled) return replace({ ...a, enabled: false });
                          const { next, trimmed, offline } = goLive(operations.announcements, a.id);
                          save(next);
                          const notes = [
                            trimmed.length &&
                              `${trimmed.map((x) => x.title).join('、')} 将在 ${dateLabel(a.startsAt)} 失效`,
                            offline.length && `已下线 ${offline.map((x) => x.title).join('、')}`,
                          ].filter(Boolean);
                          if (notes.length)
                            void message.info(`为避免公告重叠：${notes.join('；')}`);
                        }}
                      >
                        {a.enabled ? '下线' : '上线'}
                      </Button>
                    )}
                    {c && !publishedIds.has(c.id) && (
                      <Button
                        type="link"
                        danger={!c.voided}
                        disabled={disabled}
                        aria-label={`${c.voided ? '恢复' : '作废'} ${c.title}`}
                        onClick={() => {
                          const { voided: _, ...rest } = c;
                          replace(c.voided ? rest : { ...c, voided: true });
                        }}
                      >
                        {c.voided ? '恢复' : '作废'}
                      </Button>
                    )}
                  </div>
                );
              },
            },
          ]}
        />
      </div>
      <Modal
        open={!!draft}
        title={`${locked ? '查看' : editing?.isNew ? '新增' : '编辑'}${label}`}
        width={720}
        destroyOnHidden
        // Rendering in place skips rc-dialog's body scroll lock, whose injected style has no CSP nonce.
        getContainer={false}
        onCancel={() => setEditing(undefined)}
        footer={
          locked ? (
            <Button onClick={() => setEditing(undefined)}>关闭</Button>
          ) : (
            <div className="control-actions modal-actions">
              <Button onClick={() => setEditing(undefined)}>取消</Button>
              <Button
                type="primary"
                disabled={disabled || !!error}
                onClick={() => {
                  if (!draft) return;
                  const entry = { ...draft, title: draft.title.trim(), body: draft.body.trim() };
                  save(
                    editing.isNew
                      ? [...entries, entry]
                      : entries.map((e) => (e.id === entry.id ? entry : e)),
                  );
                  setEditing(undefined);
                }}
              >
                {editing?.isNew ? '确定新增' : '确定修改'}
              </Button>
            </div>
          )
        }
      >
        {draft && (
          <div className="message-form">
            {locked && (
              <Alert
                type="info"
                title={
                  publishedIds.has(draft.id)
                    ? '此补偿已发布，内容、奖励与登录范围均已锁定，不可修改或作废。'
                    : '此补偿已作废，不会发放；恢复后才能编辑。'
                }
              />
            )}
            <label htmlFor="message-title">标题</label>
            <Input
              id="message-title"
              aria-label="消息标题"
              maxLength={80}
              showCount
              value={draft.title}
              disabled={disabled || locked}
              onChange={(e) => edit({ title: e.target.value })}
            />
            <label htmlFor="message-body">正文</label>
            <Input.TextArea
              id="message-body"
              aria-label="消息正文"
              maxLength={300}
              showCount
              rows={4}
              value={draft.body}
              disabled={disabled || locked}
              onChange={(e) => edit({ body: e.target.value })}
            />
            {compensation && (
              <p className="control-help">
                正文中写入 <code>{REWARD_TOKEN}</code>
                ，玩家端会替换为本补偿的奖励明细（如“2 金币 · 23 EXP · 2 补给箱”），整行高亮显示。
                {!locked && !disabled && !draft.body.includes(REWARD_TOKEN) && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => edit({ body: (draft.body + REWARD_TOKEN).slice(0, 300) })}
                  >
                    插入到正文末尾
                  </Button>
                )}
              </p>
            )}
            {announcement && (
              <div className="operation-fields">
                <TimeField
                  id="announcement-start"
                  label="生效时间"
                  value={announcement.startsAt}
                  disabled={disabled}
                  change={(t) => edit({ startsAt: t ?? NaN })}
                />
                <TimeField
                  id="announcement-end"
                  label="失效时间（可留空）"
                  value={announcement.endsAt}
                  disabled={disabled}
                  change={(t) => edit({ endsAt: t })}
                />
              </div>
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
                <div className="operation-fields reward-fields">
                  {(['coins', 'xp', 'packs'] as const).map((key, i) => (
                    <div key={key}>
                      <label htmlFor={'reward-' + key}>
                        {['金币', '经验 EXP', '普通补给箱'][i]}
                      </label>
                      <InputNumber
                        id={'reward-' + key}
                        aria-label={['补偿金币', '补偿经验', '补偿补给箱'][i]}
                        value={compensation.reward[key]}
                        min={0}
                        max={key === 'packs' ? 1000 : 1000000}
                        precision={0}
                        disabled={disabled || locked}
                        onChange={(n) =>
                          edit({ reward: { ...compensation.reward, [key]: n ?? 0 } })
                        }
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
                    const ids = e.target.value.trim();
                    edit({ playerIds: ids ? ids.split(/\s+/) : undefined });
                  }}
                />
                <p className="control-help">
                  范围内进入过游戏的玩家在下次进入时收到一封信箱消息，正文即上方文案，附件仅可领取一次。登录记录最多保留
                  {LOGIN_RETENTION_DAYS} 天，范围结束时间不能晚于当前时间。
                </p>
              </>
            )}
            {error && <Alert type="warning" title={error} />}
            <div className="operation-preview" aria-label="玩家消息预览">
              <span className="preview-label">玩家看到的内容</span>
              <strong>{draft.title || '标题预览'}</strong>
              <p>
                {compensation && draft.body.includes(REWARD_TOKEN)
                  ? draft.body.split(REWARD_TOKEN).flatMap((part, i) => [
                      ...(i
                        ? [
                            <mark key={i} className="preview-reward-line">
                              {rewardText(compensation.reward) || '（无奖励）'}
                            </mark>,
                          ]
                        : []),
                      part,
                    ])
                  : draft.body || '正文预览'}
              </p>
              {compensation && !draft.body.includes(REWARD_TOKEN) && (
                <p className="preview-reward">
                  {compensation.reward.coins} 金币 · {compensation.reward.xp} EXP ·{' '}
                  {compensation.reward.packs} 补给箱
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
