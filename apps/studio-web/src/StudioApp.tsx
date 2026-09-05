import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type createStudioRouter } from './router.js';

/** Renders one isolated Studio router and its server-state cache. */
export function StudioApp({ router }: { router: ReturnType<typeof createStudioRouter> }) {
  return (
    <QueryClientProvider client={router.options.context.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
