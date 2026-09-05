import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { StudioApp } from './StudioApp.js';
import { createStudioRouter } from './router.js';
import { createAuthClient } from './auth-client.js';
import './styles.css';

const router = createStudioRouter({
  auth: createAuthClient(),
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
});
createRoot(document.getElementById('root')!).render(<StudioApp router={router} />);
