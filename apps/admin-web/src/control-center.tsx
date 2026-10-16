import { useMemo } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Alert } from 'antd';
import { createControlApi, type Permission, type Session } from './control-api';
import { ConfigWorkspace } from './config-workspace';
import { MembersPage } from './members-page';
import { RolesPage } from './roles-page';
import { AuditPage } from './audit-page';

const pages = [
  ['/config', '公共配置', 'control.read'],
  ['/games', '游戏状态', 'control.read'],
  ['/members', '成员', 'members.read'],
  ['/roles', '角色', 'roles.read'],
  ['/audit', '审计', 'audit.read'],
] as const;
export function ControlNavigation({ session }: { session: Session }) {
  if (!session.permissions.length) return null;
  return (
    <nav className="control-nav" aria-label="管理导航">
      <NavLink to="/" end>
        欢迎
      </NavLink>
      {pages
        .filter(([, , permission]) => session.permissions.includes(permission))
        .map(([path, title]) => (
          <NavLink key={path} to={path}>
            {title}
          </NavLink>
        ))}
    </nav>
  );
}
export function ControlCenter({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => Promise<void>;
}) {
  const { pathname } = useLocation();
  const api = useMemo(() => createControlApi(session, refresh), [session.csrfToken]);
  const permission = pages.find(([path]) => path === pathname)?.[2] as Permission | undefined;
  if (!permission || !session.permissions.includes(permission))
    return (
      <section className="control-center">
        <Alert
          type="warning"
          title="你没有此页面的访问权限。"
          description={<Link to="/">返回欢迎页</Link>}
        />
      </section>
    );
  return (
    <section className="control-center">
      {pathname === '/config' || pathname === '/games' ? (
        <ConfigWorkspace api={api} session={session} gamesOnly={pathname === '/games'} />
      ) : pathname === '/members' ? (
        <MembersPage api={api} session={session} />
      ) : pathname === '/roles' ? (
        <RolesPage api={api} session={session} />
      ) : (
        <AuditPage api={api} />
      )}
    </section>
  );
}
