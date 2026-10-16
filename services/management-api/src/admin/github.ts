export interface Identity {
  githubId: string;
  login: string;
  emails: string[];
}
export interface GithubProvider {
  identify(code: string, verifier: string, callback: string): Promise<Identity>;
}

type GithubStage = 'exchange' | 'profile' | 'emails';
type GithubFailure = 'timeout' | 'network' | 'http' | 'json' | 'payload' | 'scope' | 'pagination';

/** Only fixed diagnostics may leave the provider; never retain OAuth responses or causes. */
export class GithubIdentityError extends Error {
  constructor(
    readonly stage: GithubStage,
    readonly reason: GithubFailure,
    readonly status?: number,
  ) {
    super('GitHub identity unavailable');
    this.name = 'GithubIdentityError';
  }
}

async function requestJson(url: string, init: RequestInit, stage: GithubStage): Promise<unknown> {
  const signal = AbortSignal.timeout(10000);
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal });
  } catch {
    throw new GithubIdentityError(stage, signal.aborted ? 'timeout' : 'network');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new GithubIdentityError(stage, 'http', response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new GithubIdentityError(stage, signal.aborted ? 'timeout' : 'json');
  }
}

export function githubProvider(clientId: string, clientSecret: string): GithubProvider {
  return {
    async identify(code, verifier, callback) {
      const token = (await requestJson(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: callback,
            code_verifier: verifier,
          }),
        },
        'exchange',
      )) as {
        access_token?: string;
        token_type?: string;
        scope?: string;
      };
      if (
        !token ||
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        typeof token.token_type !== 'string' ||
        token.token_type.toLowerCase() !== 'bearer'
      )
        throw new GithubIdentityError('exchange', 'payload');
      if (
        typeof token.scope !== 'string' ||
        !token.scope.split(/[ ,]+/).includes('user:email') ||
        token.scope
          .split(/[ ,]+/)
          .filter(Boolean)
          .some((scope) => scope !== 'user:email')
      )
        throw new GithubIdentityError('exchange', 'scope');
      const get = (path: string, stage: GithubStage) =>
        requestJson(
          `https://api.github.com${path}`,
          {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'small-games-admin',
            },
          },
          stage,
        );
      const user = (await get('/user', 'profile')) as { id?: unknown; login?: unknown };
      if (
        !user ||
        !Number.isSafeInteger(user.id) ||
        Number(user.id) <= 0 ||
        typeof user.login !== 'string' ||
        !/^[a-z\d-]{1,39}$/i.test(user.login)
      )
        throw new GithubIdentityError('profile', 'payload');
      const emails: string[] = [];
      for (let page = 1; page <= 10; page++) {
        const rows = await get(`/user/emails?per_page=100&page=${page}`, 'emails');
        if (!Array.isArray(rows)) throw new GithubIdentityError('emails', 'payload');
        for (const row of rows)
          if (row && row.verified === true && typeof row.email === 'string')
            emails.push(row.email.trim().toLowerCase());
        if (rows.length < 100) return { githubId: String(user.id), login: user.login, emails };
      }
      throw new GithubIdentityError('emails', 'pagination');
    },
  };
}
