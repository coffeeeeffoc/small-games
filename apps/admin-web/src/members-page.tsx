import { useEffect, useState } from 'react';
import { Alert, Card, Checkbox, Input, Select, Tag } from 'antd';
import type { ControlApi, Member, Role, Session } from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  PageTitle,
  useOperation,
} from './control-common';

export function MembersPage({ api, session }: { api: ControlApi; session: Session }) {
  const operation = useOperation();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Member | 'new'>();
  const [deleting, setDeleting] = useState<Member>();
  const [email, setEmail] = useState(''),
    [active, setActive] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]),
    [reason, setReason] = useState('');
  const canWrite = session.permissions.includes('members.write'),
    canRoles = session.permissions.includes('roles.read');
  async function load() {
    setMembers(await api.read<Member[]>('members'));
    // Do not fetch the directory on behalf of a member lacking roles.read.
    if (canRoles) setRoles(await api.read<Role[]>('roles'));
  }
  useEffect(() => {
    void operation.run(load);
  }, [api]);
  function edit(member: Member | 'new') {
    setEditing(member);
    setDeleting(undefined);
    setReason('');
    operation.clearError();
    setEmail(member === 'new' ? '' : member.email);
    setActive(member === 'new' || member.active);
    setRoleIds(member === 'new' ? [] : member.roleIds);
  }
  const bound = editing && editing !== 'new' && editing.githubId !== null;
  const effectiveAdministrators = members.filter(
    (member) => member.active && member.githubId && member.roleIds.includes('administrator'),
  ).length;
  return (
    <>
      <PageTitle
        title="成员"
        note="按验证邮箱邀请，首次 GitHub 登录后绑定稳定身份。停用后旧会话会立即拒绝。"
      />
      <Failure error={operation.error} />
      <div className="control-actions">
        <Button
          type="primary"
          disabled={!canWrite || !canRoles || operation.busy}
          onClick={() => edit('new')}
        >
          邀请成员
        </Button>
        <Button loading={operation.busy} onClick={() => void operation.run(load)}>
          刷新成员
        </Button>
      </div>
      {!canRoles && (
        <Alert
          type="info"
          title="没有角色目录读取权限"
          description="不会请求角色目录。可查看已有角色标识；有成员写入权限时仍可停用或删除成员。邀请和角色调整需要角色目录读取权限。"
        />
      )}
      <Card>
        <div className="table-scroll">
          <Table
            pagination={false}
            rowKey="id"
            aria-label="成员列表"
            dataSource={members}
            columns={[
              {
                title: '邮箱',
                dataIndex: 'email',
                render: (_, row) => (
                  <>
                    <strong>{row.email}</strong>
                    <small className="control-id">
                      {row.githubId ? '已绑定 GitHub' : '等待首次验证登录'}
                    </small>
                  </>
                ),
              },
              {
                title: '状态',
                key: 'active',
                render: (_, row) => (
                  <Tag color={row.active ? 'green' : 'default'}>
                    {row.active ? '有效' : '已停用'}
                  </Tag>
                ),
              },
              {
                title: '角色',
                key: 'roles',
                render: (_, row) =>
                  row.roleIds.map((id) => (
                    <Tag key={id}>{roles.find((role) => role.id === id)?.name ?? id}</Tag>
                  )),
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) =>
                  canWrite ? (
                    <div className="control-actions">
                      <Button onClick={() => edit(row)}>编辑成员</Button>
                      <Button
                        danger
                        onClick={() => {
                          setDeleting(row);
                          setEditing(undefined);
                          setReason('');
                          operation.clearError();
                        }}
                      >
                        删除成员
                      </Button>
                    </div>
                  ) : (
                    '只读'
                  ),
              },
            ]}
          />
        </div>
      </Card>
      {editing && (
        <Card
          title={editing === 'new' ? '邀请新成员' : `编辑 ${editing.email}`}
          className="member-editor"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void operation.run(async () => {
                const body = {
                  email: email.trim().toLowerCase(),
                  active,
                  ...(canRoles ? { roleIds } : {}),
                  reason: reason.trim(),
                };
                await api.member(editing === 'new' ? undefined : editing.id, body);
                setEditing(undefined);
                await load();
                operation.success('成员设置已保存。');
              });
            }}
          >
            <label htmlFor="member-email">成员邮箱</label>
            <Input
              id="member-email"
              type="email"
              required
              aria-label="成员邮箱"
              value={email}
              disabled={!!bound || operation.busy}
              onChange={(event) => setEmail(event.target.value)}
            />
            {bound && <p className="control-help">已绑定的验证邮箱不能直接更改。</p>}
            <label htmlFor="member-roles">成员角色</label>
            <Select
              id="member-roles"
              aria-label="成员角色"
              mode="multiple"
              value={roleIds}
              disabled={!canRoles || operation.busy}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              onChange={setRoleIds}
            />
            <div className="control-check">
              <Checkbox
                checked={active}
                disabled={operation.busy}
                onChange={(event) => setActive(event.target.checked)}
              >
                成员有效
              </Checkbox>
            </div>
            {editing !== 'new' &&
              editing.roleIds.includes('administrator') &&
              editing.active &&
              editing.githubId &&
              effectiveAdministrators === 1 && (
                <Alert
                  type="warning"
                  title="这是最后一位已绑定的有效管理员，不能删除、停用或降权。"
                />
              )}
            <label htmlFor="member-reason">成员变更理由</label>
            <Input.TextArea
              id="member-reason"
              aria-label="成员变更理由"
              rows={3}
              maxLength={500}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="control-actions">
              <Button
                htmlType="submit"
                type="primary"
                loading={operation.busy}
                disabled={!reason.trim() || (editing === 'new' && !canRoles)}
              >
                保存成员
              </Button>
              <Button disabled={operation.busy} onClick={() => setEditing(undefined)}>
                取消编辑
              </Button>
            </div>
          </form>
        </Card>
      )}
      {deleting && (
        <Card title={`删除 ${deleting.email}`} className="confirmation">
          <p>删除后该成员的会话将不再获得访问权限；审计历史保留。</p>
          <label htmlFor="member-delete-reason">删除成员理由</label>
          <Input.TextArea
            id="member-delete-reason"
            aria-label="删除成员理由"
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="control-actions">
            <Button
              danger
              disabled={!reason.trim()}
              loading={operation.busy}
              onClick={() =>
                void operation.run(async () => {
                  await api.deleteMember(deleting.id, reason.trim());
                  setDeleting(undefined);
                  await load();
                  operation.success('成员已删除。');
                })
              }
            >
              确认删除成员
            </Button>
            <Button disabled={operation.busy} onClick={() => setDeleting(undefined)}>
              取消删除
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
