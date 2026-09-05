import { type AuthStore, type Account, type AuthSession } from '@coffeeeeffoc/management-api';

/** In-memory behavioral adapter, not a substitute for the live SQL integration suite. */
export function memoryAuthStore(): AuthStore {
  const accounts: Account[] = [];
  const sessions = new Map<string, AuthSession>();
  function operator(accountId: string) {
    const account = accounts.find((entry) => entry.id === accountId);
    return account && { id: account.id, username: account.username, roles: [...account.roles] };
  }
  return {
    async initializeAccount(account) {
      if (accounts.length) return false;
      accounts.push(account);
      return true;
    },
    async findAccount(username) {
      return accounts.find((entry) => entry.username === username);
    },
    async saveSession(session) {
      sessions.set(session.accessHash, { ...session });
    },
    async authenticate(accessHash, now) {
      const session = sessions.get(accessHash);
      return session && session.accessExpiresAt > now && session.refreshExpiresAt > now
        ? operator(session.accountId)
        : undefined;
    },
    async refresh(refreshHash, replacement, now) {
      const session = [...sessions.values()].find(
        (entry) => entry.refreshHash === refreshHash && entry.refreshExpiresAt > now,
      );
      if (!session) return undefined;
      sessions.delete(session.accessHash);
      sessions.set(replacement.accessHash, { ...session, ...replacement });
      return operator(session.accountId);
    },
    async revoke(accessHash, refreshHash) {
      for (const session of sessions.values())
        if (session.accessHash === accessHash || session.refreshHash === refreshHash)
          sessions.delete(session.accessHash);
    },
  };
}
