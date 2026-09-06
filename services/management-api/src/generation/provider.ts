import { z } from 'zod';
import type { AiProvider } from './model.js';

/** Generic server-side provider adapter; its credential is never returned to Studio. */
export function createHttpAiProvider(options: {
  endpoint: string;
  apiKey: string;
  model: string;
  transport?: typeof fetch;
}): AiProvider {
  return {
    model: options.model,
    async generate(request) {
      const response = await (options.transport ?? fetch)(options.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, model: options.model }),
      });
      if (!response.ok) throw new Error('AI provider request failed');
      return { output: z.object({ output: z.unknown() }).parse(await response.json()).output };
    },
  };
}
