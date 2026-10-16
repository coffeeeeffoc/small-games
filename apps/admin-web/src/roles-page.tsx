import { useEffect, useState } from 'react';
import { Alert, Card, Checkbox, Input, Tag } from 'antd';
import {
  permissions,
  type ControlApi,
  type Permission,
  type Role,
  type Session,
} from './control-api';
import {
  ActionButton as Button,
  DataTable as Table,
  Failure,
  PageTitle,
  useOperation,
} from './control-common';

const labels: Record<Permission, string> = {
  'control.read': '读取配置',
  'control.write': '编辑草稿',
  'control.publish': '发布与回退',
  'members.read': '读取成员',
  'members.write': '管理成员',
  'roles.read': '读取角色',
  'roles.write': '管理角色',
  'audit.read': '读取审计',
};
export function RolesPage({ api, session }: { api: ControlApi; session: Session }) {
  const operation = useOperation();
  const [roles, setRoles] = useState<Role[]>([]),
    [editing, setEditing] = useState<Role | 'new'>();
  const [deleting, setDeleting] = useState<Role>();
  const [id, setId] = useState(''),
    [name, setName] = useState(''),
    [reason, setReason] = useState('');
  const [grants, setGrants] = useState<Permission[]>([]);
  const canWrite = session.permissions.includes('roles.write');
  const load = async () => setRoles(await api.read<Role[]>('roles'));
  useEffect(() => {
    void operation.run(load);
  }, [api]);
  function edit(role: Role | 'new') {
    setEditing(role);
    setDeleting(undefined);
    setId(role === 'new' ? '' : role.id);
    setName(role === 'new' ? '' : role.name);
    setGrants(role === 'new' ? [] : role.permissions);
    setReason('');
    operation.clearError();
  }
  return (
    <>
      <PageTitle title="角色" note="使用固定权限集合创建自定义角色；内置管理员角色保持只读。" />
      <Failure error={operation.error} />
      <div className="control-actions">
        <Button type="primary" disabled={!canWrite || operation.busy} onClick={() => edit('new')}>
          创建角色
        </Button>
        <Button loading={operation.busy} onClick={() => void operation.run(load)}>
          刷新角色
        </Button>
      </div>
      <Card>
        <div className="table-scroll">
          <Table
            pagination={false}
            rowKey="id"
            aria-label="角色列表"
            dataSource={roles}
            columns={[
              {
                title: '角色',
                key: 'role',
                render: (_, role) => (
                  <>
                    <strong>{role.name}</strong>
                    <small className="control-id">{role.id}</small>
                    {role.builtin && <Tag>内置 · 只读</Tag>}
                  </>
                ),
              },
              {
                title: '权限',
                key: 'permissions',
                render: (_, role) =>
                  role.permissions.map((permission) => (
                    <Tag key={permission}>{labels[permission] ?? permission}</Tag>
                  )),
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, role) =>
                  role.builtin || !canWrite ? (
                    '只读'
                  ) : (
                    <div className="control-actions">
                      <Button onClick={() => edit(role)}>编辑角色</Button>
                      <Button
                        danger
                        onClick={() => {
                          setDeleting(role);
                          setEditing(undefined);
                          setReason('');
                          operation.clearError();
                        }}
                      >
                        删除角色
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        </div>
      </Card>
      {editing && (
        <Card title={editing === 'new' ? '创建自定义角色' : `编辑 ${editing.name}`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void operation.run(async () => {
                await api.role(id, {
                  name: name.trim(),
                  permissions: grants,
                  reason: reason.trim(),
                });
                setEditing(undefined);
                await load();
                operation.success('角色已保存。');
              });
            }}
          >
            <label htmlFor="role-id">角色标识</label>
            <Input
              id="role-id"
              aria-label="角色标识"
              required
              pattern="[a-z][a-z0-9-]{0,47}"
              value={id}
              disabled={editing !== 'new' || operation.busy}
              onChange={(event) => setId(event.target.value)}
            />
            <label htmlFor="role-name">角色名称</label>
            <Input
              id="role-name"
              aria-label="角色名称"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <fieldset className="permission-options">
              <legend>角色权限</legend>
              {permissions.map((permission) => (
                <Checkbox
                  key={permission}
                  aria-label={permission}
                  checked={grants.includes(permission)}
                  disabled={!session.permissions.includes(permission) || operation.busy}
                  onChange={(event) =>
                    setGrants(
                      event.target.checked
                        ? [...grants, permission]
                        : grants.filter((value) => value !== permission),
                    )
                  }
                >
                  {labels[permission]}
                </Checkbox>
              ))}
            </fieldset>
            <Alert type="info" title="只能授予自己拥有的权限。仍被成员引用的角色不能删除。" />
            <label htmlFor="role-reason">角色变更理由</label>
            <Input.TextArea
              id="role-reason"
              aria-label="角色变更理由"
              rows={3}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="control-actions">
              <Button
                type="primary"
                htmlType="submit"
                loading={operation.busy}
                disabled={!reason.trim() || id === 'administrator'}
              >
                保存角色
              </Button>
              <Button onClick={() => setEditing(undefined)}>取消编辑</Button>
            </div>
          </form>
        </Card>
      )}
      {deleting && (
        <Card title={`删除角色 ${deleting.name}`} className="confirmation">
          <label htmlFor="role-delete-reason">删除角色理由</label>
          <Input.TextArea
            id="role-delete-reason"
            aria-label="删除角色理由"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="control-actions">
            <Button
              danger
              disabled={!reason.trim()}
              loading={operation.busy}
              onClick={() =>
                void operation.run(async () => {
                  await api.deleteRole(deleting.id, reason.trim());
                  setDeleting(undefined);
                  await load();
                  operation.success('角色已删除。');
                })
              }
            >
              确认删除角色
            </Button>
            <Button onClick={() => setDeleting(undefined)}>取消删除</Button>
          </div>
        </Card>
      )}
    </>
  );
}
