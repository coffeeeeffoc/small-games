export interface Identity {
  githubId: string;
  login: string;
  emails: string[];
}
export interface GithubProvider {
  identify(code: string, verifier: string, callback: string): Promise<Identity>;
}

export function githubProvider(clientId: string, clientSecret: string): GithubProvider {
  return {
    async identify(code, verifier, callback) {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
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
      });
      const token = (await response.json()) as {
        access_token?: string;
        token_type?: string;
        scope?: string;
      };
      if (
        !response.ok ||
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        typeof token.token_type !== 'string' ||
        token.token_type.toLowerCase() !== 'bearer'
      )
        throw new Error('GitHub exchange failed');
      if (
        typeof token.scope !== 'string' ||
        !token.scope.split(/[ ,]+/).includes('user:email') ||
        token.scope
          .split(/[ ,]+/)
          .filter(Boolean)
          .some((scope) => scope !== 'user:email')
      )
        throw new Error('Unexpected OAuth permissions; use a dedicated OAuth App');
      const get = async (path: string) => {
        const r = await fetch(`https://api.github.com${path}`, {
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'small-games-admin',
          },
        });
        if (!r.ok) throw new Error('GitHub identity lookup failed');
        return r.json();
      };
      const user = (await get('/user')) as { id?: unknown; login?: unknown };
      if (
        !Number.isSafeInteger(user.id) ||
        Number(user.id) <= 0 ||
        typeof user.login !== 'string' ||
        !/^[a-z\d-]{1,39}$/i.test(user.login)
      )
        throw new Error('Invalid GitHub identity');
      const emails: string[] = [];
      for (let page = 1; page <= 10; page++) {
        const rows = (await get(`/user/emails?per_page=100&page=${page}`)) as unknown;
        if (!Array.isArray(rows)) throw new Error('Invalid GitHub emails');
        for (const row of rows)
          if (row && row.verified === true && typeof row.email === 'string')
            emails.push(row.email.trim().toLowerCase());
        if (rows.length < 100) return { githubId: String(user.id), login: user.login, emails };
      }
      throw new Error('GitHub email pagination exceeded');
    },
  };
}
