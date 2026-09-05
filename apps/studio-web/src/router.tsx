import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { type QueryClient } from '@tanstack/react-query';
import { type AuthClient } from './auth-client.js';
import { LoginPage, WorkspacePage } from './views.js';

/** Per-app dependencies avoid sharing identity state between Studio instances. */
export interface StudioContext {
  auth: AuthClient;
  queryClient: QueryClient;
}
const rootRoute = createRootRouteWithContext<StudioContext>()({
  component: Outlet,
  errorComponent: () => (
    <main className="login-panel">
      <h1>工作区暂时不可用</h1>
      <p>请确认本地服务已启动，再刷新页面。</p>
      <a href="/login">返回登录</a>
    </main>
  ),
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const operator = await context.queryClient.fetchQuery({
      queryKey: ['session'],
      queryFn: () => context.auth.session(),
      staleTime: 0,
      retry: false,
    });
    if (!operator) throw redirect({ to: '/login' });
    return { operator };
  },
  component: WorkspacePage,
});

/** Builds the actual protected route tree; server authorization remains mandatory. */
export function createStudioRouter(context: StudioContext, history?: RouterHistory) {
  return createRouter({
    routeTree: rootRoute.addChildren([loginRoute, workspaceRoute]),
    context,
    history,
    defaultPendingMinMs: 0,
  });
}
