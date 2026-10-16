import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import './theme.css';

type Auth =
  | { state: 'loading' | 'anonymous' | 'forbidden' | 'unavailable' }
  | { state: 'ready'; login: string; csrfToken: string };
function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.3.8-.6v-2.2c-3.4.8-4.1-1.5-4.1-1.5-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0C17.5 4 18.5 4.3 18.5 4.3c.7 1.6.3 2.9.2 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.9 5.7-5.6 6 .4.4.8 1.1.8 2.3v3.4c0 .4.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"
      />
    </svg>
  );
}
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 18 18 6M6 6h12v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Artwork({ mood }: { mood: string }) {
  return (
    <div className={`art art--${mood}`} aria-hidden="true">
      <div className="art-grid" />
      <div className="orbit">
        <div className="orbit-ring" />
        <div className="orbit-block" />
        <div className="orbit-spark" />
        <div className="orbit-dot" />
        {mood === 'forbidden' && <span className="art-code">403</span>}
      </div>
      <div className="art-label">
        <span>0{mood === 'login' ? 1 : mood === 'welcome' ? 2 : 3} / SMALL GAMES</span>
        <span>
          {mood === 'forbidden' ? 'A SMALL PAUSE.' : 'A LITTLE PLAY. A LOT OF POSSIBILITY.'}
        </span>
      </div>
    </div>
  );
}
function App() {
  const [auth, setAuth] = useState<Auth>({ state: 'loading' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = async () => {
    setAuth({ state: 'loading' });
    try {
      const r = await fetch('/api/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      if (r.status === 401) return setAuth({ state: 'anonymous' });
      if (r.status === 403) return setAuth({ state: 'forbidden' });
      if (!r.ok) throw new Error();
      const body = await r.json();
      if (
        typeof body.user?.login !== 'string' ||
        typeof body.csrfToken !== 'string' ||
        !/^[\w-]{43}$/.test(body.csrfToken)
      )
        throw new Error();
      setAuth({ state: 'ready', login: body.user.login, csrfToken: body.csrfToken });
    } catch {
      setAuth({ state: 'unavailable' });
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    document.title = `${location.pathname === '/forbidden' ? '403 · 暂无访问权限' : auth.state === 'ready' ? '欢迎回来' : '登录'} · Small Games`;
    document.getElementById('page-title')?.focus();
  }, [location.pathname, auth.state]);
  const logout = async () => {
    if (auth.state !== 'ready') return;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const r = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': auth.csrfToken },
        credentials: 'same-origin',
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok && r.status !== 401) throw new Error();
      setAuth({ state: 'anonymous' });
      navigate('/login', { replace: true });
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  };
  const welcome = auth.state === 'ready' && location.pathname !== '/forbidden';
  const forbidden = location.pathname === '/forbidden' || auth.state === 'forbidden';
  const mood = forbidden ? 'forbidden' : welcome ? 'welcome' : 'login';
  const error = new URLSearchParams(location.search).get('error');
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳至主要内容
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Small Games 管理空间首页">
          <img src="/mark.svg" alt="" />
          <span>
            small games<span className="brand-divider">/</span>
            <span className="brand-label">ADMIN</span>
          </span>
        </a>
        <span className="header-note">
          <span />
          好玩，从这里生长
        </span>
      </header>
      <main id="main">
        <Routes>
          <Route
            path="/login"
            element={auth.state === 'ready' ? <Navigate to="/" replace /> : null}
          />
          <Route
            path="/"
            element={
              auth.state === 'anonymous' ? (
                <Navigate to="/login" replace />
              ) : auth.state === 'forbidden' ? (
                <Navigate to="/forbidden" replace />
              ) : null
            }
          />
          <Route path="/forbidden" element={null} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <section className={`stage stage--${mood}`} aria-labelledby="page-title">
          <div className="stage-copy">
            <span className="eyebrow">
              {forbidden
                ? '403 · MEMBERS ONLY'
                : welcome
                  ? 'YOUR SPACE, READY.'
                  : 'SMALL GAMES, BIG IDEAS.'}
            </span>
            <h1 id="page-title" tabIndex={-1}>
              {forbidden ? (
                <>
                  这片空间，
                  <br />
                  <em>还没为你开放。</em>
                </>
              ) : welcome ? (
                <>
                  欢迎回来，
                  <br />
                  <em>创造者。</em>
                </>
              ) : (
                <>
                  让好玩的灵感，
                  <br />
                  <em>从这里出发。</em>
                </>
              )}
            </h1>
            <p className="intro">
              {forbidden ? (
                <>
                  你的 GitHub 账号尚未获得访问权限。
                  <br />
                  可以换一个账号，或联系管理员。
                </>
              ) : welcome ? (
                <>
                  灵感已就位，今天也让好玩发生。
                  <br />
                  这里是你的小游戏管理空间。
                </>
              ) : (
                <>
                  欢迎来到小游戏管理空间。
                  <br />
                  用你的 GitHub 账号，开启今天的创造。
                </>
              )}
            </p>
            <div className="actions" aria-live="polite">
              {forbidden ? (
                <>
                  <a className="button" href="/api/auth/github">
                    <GithubIcon />
                    换个 GitHub 账号
                    <Arrow />
                  </a>
                  <a className="text-link" href="/login">
                    返回登录页
                  </a>
                </>
              ) : welcome ? (
                <>
                  <span className="identity">
                    <span className="identity-avatar">{auth.login.charAt(0).toUpperCase()}</span>
                    <span>
                      <strong>@{auth.login}</strong>
                      <small>已通过 GitHub 验证</small>
                    </span>
                    <span className="verified" aria-label="已授权">
                      ✓
                    </span>
                  </span>
                  <button
                    className="button button--secondary"
                    onClick={() => void logout()}
                    disabled={loggingOut}
                  >
                    {loggingOut ? '正在退出…' : '退出登录'}
                    <Arrow />
                  </button>
                  {logoutError && (
                    <p role="alert" className="notice">
                      退出暂未完成，请重试。
                    </p>
                  )}
                </>
              ) : auth.state === 'loading' ? (
                <p className="notice" role="status">
                  正在确认你的登录状态…
                </p>
              ) : auth.state === 'unavailable' ? (
                <>
                  <p className="notice" role="alert">
                    管理空间暂时连接不上，请稍后重试。
                  </p>
                  <button className="button" onClick={() => void refresh()}>
                    重新连接
                    <Arrow />
                  </button>
                </>
              ) : (
                <>
                  <a className="button" href="/api/auth/github">
                    <GithubIcon />
                    使用 GitHub 继续
                    <Arrow />
                  </a>
                  {error && (
                    <p className="notice" role="alert">
                      {error === 'expired'
                        ? '登录已过期或已取消，请重新开始。'
                        : '登录暂不可用，请稍后重试。'}
                    </p>
                  )}
                  <span className="fine-print">仅向已获授权的成员开放</span>
                </>
              )}
            </div>
          </div>
          <Artwork mood={mood} />
        </section>
        <div className="under-stage">
          <span className="tiny-cross" aria-hidden="true">
            ✦
          </span>
          <span>让每一个小想法，都有好玩的可能。</span>
          <span className="edition">SMALL GAMES / ADMIN SPACE</span>
        </div>
      </main>
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} SMALL GAMES</span>
        <span>一点灵感，很多可能。</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
