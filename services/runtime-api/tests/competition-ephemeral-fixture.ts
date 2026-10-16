import { controlDatabase } from './control-fixture.js';

export type Row = Record<string, unknown>;
export function fixture() {
  let time = 1_000_000;
  const players = new Map<string, Row>(),
    sessions = new Map<string, Row>(),
    refresh = new Map<string, Row>();
  const rooms = new Map<string, Row>();
  let tct: Row | undefined;
  const live = (row: Row | undefined) => row && Number(row.expires_at) > time;
  const memory = controlDatabase((query, params) => {
    const text = query.replace(/\s+/g, ' ');
    if (text.startsWith('insert into runtime.competition_players')) {
      players.set(String(params[0]), {
        id: params[0],
        platform: 'guest',
        app_id: params[1],
        created_at: params[2],
        profile: { source: 'default' },
      });
      return [];
    }
    if (text.startsWith('insert into runtime.competition_sessions')) {
      sessions.set(String(params[0]), { player_id: params[1], expires_at: params[2] });
      return [];
    }
    if (text.startsWith('insert into runtime.competition_refresh_tokens')) {
      refresh.set(String(params[0]), { player_id: params[1], expires_at: params[2] });
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
      return row && live(session) ? [{ ...row, expires_at: session!.expires_at }] : [];
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
      return live(row) && p?.platform === 'guest' ? [{ ...p, expires_at: row!.expires_at }] : [];
    }
    if (text.startsWith('select p.id') && text.includes('join runtime.competition_sessions')) {
      const row = sessions.get(String(params[0]));
      return live(row) ? [{ id: row!.player_id }] : [];
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
      return live(row) && (!text.includes('player_id=') || row!.player_id === params[1])
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
