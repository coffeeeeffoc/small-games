import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { type StudioContext } from './router.js';
import { DraftEditor } from './draft-editor.js';
import { AdEditor } from './ad-editor.js';
import { ReleasePanel } from './release-panel.js';
import { RepositoryBrowser } from './repository-browser.js';
import { GenerationPanel } from './generation-panel.js';

/** Login surface with accessible feedback and no client-side credential persistence. */
export function LoginPage() {
  const router = useRouter();
  const { auth, queryClient } = router.options.context as StudioContext;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => auth.login(username, password),
    onSuccess: async (operator) => {
      setPassword('');
      queryClient.setQueryData(['session'], operator);
      await router.navigate({ to: '/' });
    },
  });
  return (
    <main className="login-layout">
      <header className="studio-brand">
        <span className="brand-mark">C / S</span>
        <span>CREATOR STUDIO</span>
        <span className="local-tag">本地工作区</span>
      </header>
      <section className="login-panel">
        <p className="eyebrow">小游戏创作平台</p>
        <h1>登录工作区</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <label htmlFor="username">账号</label>
          <input
            id="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={login.isPending}
          />
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={login.isPending}
          />
          {login.error && (
            <p role="alert" className="form-error">
              {login.error.message}
            </p>
          )}
          <button type="submit" disabled={login.isPending}>
            {login.isPending ? '正在登录…' : '进入工作区'}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="login-note">首次使用请先由管理员初始化本地账号。</p>
      </section>
      <footer className="studio-footer">
        COFFEEEEFFOC <span>创作 · 审核 · 发布</span>
      </footer>
    </main>
  );
}

/** Protected landing view exposes the current operator and their granted roles. */
export function WorkspacePage() {
  const router = useRouter();
  const { auth, queryClient } = router.options.context as StudioContext;
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => auth.session(),
    refetchInterval: 60_000,
    retry: false,
  });
  const operator = session.data;
  useEffect(() => {
    if (operator === null) void router.navigate({ to: '/login' });
  }, [operator, router]);
  const logout = useMutation({
    mutationFn: () => auth.logout(),
    onSuccess: async () => {
      queryClient.clear();
      await router.navigate({ to: '/login' });
    },
  });
  const roleNames = { creator: '创作', reviewer: '审核', publisher: '发布', admin: '管理' };
  return (
    <main className="workspace">
      <header className="studio-brand">
        <span className="brand-mark">C / S</span>
        <span>CREATOR STUDIO</span>
        <button className="logout" onClick={() => logout.mutate()} disabled={logout.isPending}>
          退出登录
        </button>
      </header>
      <section className="workspace-content">
        <p className="eyebrow">本地工作区</p>
        <h1>{operator?.username}</h1>
        <p>当前账号权限</p>
        <ul className="roles">
          {operator?.roles.map((role) => (
            <li key={role}>{roleNames[role]}</li>
          ))}
        </ul>
        {logout.error && (
          <p role="alert" className="form-error">
            {logout.error.message}
          </p>
        )}
        {operator?.roles.includes('creator') && <DraftEditor />}
        {operator?.roles.includes('creator') && <GenerationPanel />}
        {operator?.roles.includes('creator') && <AdEditor />}
        {operator?.roles.includes('creator') && <RepositoryBrowser />}
        {operator?.roles.includes('publisher') && <ReleasePanel />}
      </section>
    </main>
  );
}
