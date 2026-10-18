import { controlDatabase } from './control-fixture.js';

export type Row = Record<string, unknown>;
export function fixture() {
  let time = 1_000_000;
  const players = new Map<string, Row>(),
    sessions = new Map<string, Row>(),
    refresh = new Map<string, Row>();
  const grants = new Set<string>();
  const rooms = new Map<string, Row>();
  let tct: Row | undefined;
  const live = (row: Row | undefined) => row && Number(row.expires_at) > time;
  const memory = controlDatabase((query, params) => {
    const text = query.replace(/\s+/g, ' ');
    if (text.startsWith('insert into runtime.player_game_access')) {
      grants.add(`${params[0]}:${params[1]}`);
      return [];
    }
    if (text.startsWith('select 1 from runtime.player_game_access'))
      return grants.has(`${params[0]}:${params[1]}`) ? [{ ok: 1 }] : [];
    if (text.startsWith('insert into runtime.competition_players')) {
      const guest = text.includes("'guest'");
      const row = {
        id: params[0],
        platform: guest ? 'guest' : params[1],
        app_id: guest ? params[1] : params[2],
        subject: guest ? null : params[3],
        created_at: guest ? params[2] : params[4],
        display_name: guest ? params[3] : null,
        profile: guest ? JSON.parse(String(params[4])) : { source: 'default' },
      };
      const existing =
        !guest &&
        [...players.values()].find(
          (p) =>
            p.platform === row.platform && p.app_id === row.app_id && p.subject === row.subject,
        );
      if (existing) return [{ id: existing.id }];
      players.set(String(row.id), row);
      return [{ id: row.id }];
    }
    if (
      text.startsWith('select p.id,p.platform from runtime.competition_players') ||
      text.startsWith('select id from runtime.competition_players')
    )
      return players.has(String(params[0])) ? [players.get(String(params[0]))!] : [];
    if (text.startsWith('update runtime.competition_sessions set family_expires_at=')) {
      for (const row of sessions.values())
        if (row.player_id === params[1] && row.family_id === params[2])
          row.family_expires_at = params[0];
      return [];
    }
    if (text.startsWith('select profile from runtime.competition_players'))
      return [{ profile: players.get(String(params[0]))!.profile }];
    if (text.startsWith('update runtime.competition_players set')) {
      const row = players.get(String(params[2]))!;
      row.display_name = params[0] ?? row.display_name;
      row.profile = JSON.parse(String(params[1]));
      return [];
    }
    if (text.startsWith('update runtime.competition_sessions set expires_at=0')) {
      sessions.get(String(params[0]))!.expires_at = 0;
      return [];
    }
    if (text.startsWith('delete from runtime.competition_refresh_tokens')) {
      refresh.delete(String(params[0]));
      return [];
    }
    if (text.startsWith('select family_id')) {
      const row = sessions.get(String(params[0]));
      return row && row.player_id === params[1] && Number(row.family_expires_at) > time
        ? [row]
        : [];
    }
    if (text.startsWith('delete from runtime.competition_sessions')) {
      for (const [key, row] of sessions)
        if (row.player_id === params[0] && row.family_id === params[1]) {
          sessions.delete(key);
          for (const [secret, r] of refresh) if (r.session_hash === key) refresh.delete(secret);
        }
      return [];
    }
    if (text.startsWith('insert into runtime.competition_sessions')) {
      sessions.set(String(params[0]), {
        player_id: params[1],
        expires_at: params[2],
        game: params[3],
        family_id: params[4],
        family_expires_at: params[5],
      });
      return [];
    }
    if (text.startsWith('insert into runtime.competition_refresh_tokens')) {
      refresh.set(String(params[0]), {
        player_id: params[1],
        expires_at: params[2],
        game: params[3],
        session_hash: params[4],
      });
      return [];
    }
    if (
      text.startsWith('select id,platform,display_name,profile') ||
      text.startsWith('select id,platform,app_id,created_at')
    )
      return players.has(String(params[0])) ? [players.get(String(params[0]))!] : [];
    if (text.includes('from runtime.competition_sessions s join runtime.competition_players p')) {
      const session = sessions.get(String(params[0]));
      const row = session && players.get(String(session.player_id));
      return row && live(session) ? [{ ...row, ...session }] : [];
    }
    if (
      text.startsWith('select p.id') &&
      text.includes('join runtime.competition_refresh_tokens')
    ) {
      const row = refresh.get(String(params[0]));
      return row ? [{ id: row.player_id }] : [];
    }
    if (text.startsWith('select r.expires_at')) {
      const row = refresh.get(String(params[0])),
        p = row && players.get(String(row.player_id));
      const session = row && sessions.get(String(row.session_hash));
      return live(row) &&
        p &&
        session &&
        row!.game === session.game &&
        Number(session.family_expires_at) > time
        ? [{ ...p, ...row, family_id: session.family_id }]
        : [];
    }
    if (text.startsWith('select p.id') && text.includes('join runtime.competition_sessions')) {
      const row = sessions.get(String(params[0]));
      return row ? [{ id: row.player_id }] : [];
    }
    if (
      text.startsWith('select p.platform') &&
      text.includes('from runtime.competition_sessions')
    ) {
      const row = sessions.get(String(params[0])),
        p = row && players.get(String(row.player_id));
      return live(row) && p?.platform === 'guest' ? [p] : [];
    }
    if (text.startsWith('select 1 from runtime.competition_sessions')) {
      const row = sessions.get(String(params[0]));
      return live(row) &&
        (!text.includes('player_id=') || (row!.player_id === params[1] && row!.game === params[2]))
        ? [{ ok: 1 }]
        : [];
    }
    if (text.includes('from runtime.competition_rooms'))
      return rooms.has(String(params[0])) ? [{ data: rooms.get(String(params[0]))! }] : [];
    if (text.includes('from runtime.three_choose_two_sessions')) return tct ? [{ data: tct }] : [];
    return [];
  });
  const now = () => time;
  return {
    ...memory,
    players,
    grants,
    sessions,
    refresh,
    rooms,
    now,
    at: (value: number) => {
      time = value;
    },
    tct: (value: Row) => {
      tct = value;
    },
  };
}
