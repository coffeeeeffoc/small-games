import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  loadQuestionBank,
  selectQuestions,
  scoreAnswer,
  pointValid,
  yearValid,
} from './content.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const PREFIX = '/api/history';
const DAY = 86_400_000;
const ROUND_MS = 25_000;
const opaque = () => randomBytes(24).toString('base64url');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, code, message, details) => {
  throw Object.assign(new Error(message), { status, code, details });
};
const nicknameOf = (value) =>
  typeof value === 'string'
    ? value
        .replace(/[<>\u0000-\u001f]/g, '')
        .trim()
        .slice(0, 24) || '时空旅人'
    : '时空旅人';

export function createHistoryServer(options = {}) {
  const env = options.env ?? process.env;
  const config = {
    dbPath: options.dbPath ?? env.HISTORY_DB_PATH ?? resolve(HERE, 'data/history.sqlite'),
    questionDirectory:
      options.questionDirectory ?? env.HISTORY_QUESTION_DIR ?? resolve(HERE, 'private/questions'),
    assetDirectory: options.assetDirectory ?? env.HISTORY_ASSET_DIR ?? resolve(GAME, 'public'),
    staticDirectory: options.staticDirectory ?? env.HISTORY_STATIC_DIR ?? '',
    identitySecret: options.identitySecret ?? env.HISTORY_IDENTITY_SECRET ?? '',
    timeZone: options.timeZone ?? env.HISTORY_COMPETITION_TIMEZONE ?? 'Asia/Shanghai',
    allowedOrigins:
      options.allowedOrigins ??
      (env.HISTORY_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    trustProxy: options.trustProxy ?? env.HISTORY_TRUST_PROXY === '1',
    now: options.now ?? Date.now,
  };
  if (config.identitySecret && Buffer.byteLength(config.identitySecret) < 32)
    throw new Error('HISTORY_IDENTITY_SECRET requires at least 32 bytes');
  const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateAt = (now) => dayFormatter.format(now);
  const shiftDate = (date, days) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  const weekAt = (date) => shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  const dayEndAt = (now) => {
    const today = dateAt(now);
    let before = now,
      after = now + 26 * 60 * 60 * 1000;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (dateAt(middle) === today) before = middle;
      else after = middle;
    }
    return after;
  };
  if (config.dbPath !== ':memory:') mkdirSync(dirname(resolve(config.dbPath)), { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec(readFileSync(resolve(HERE, 'schema.sql'), 'utf8'));
  if (
    !db
      .prepare('PRAGMA table_info(runs)')
      .all()
      .some((column) => column.name === 'deadline_at')
  ) {
    db.exec(
      'ALTER TABLE runs ADD COLUMN deadline_at INTEGER NOT NULL DEFAULT 0; UPDATE runs SET deadline_at = created_at + 1800000',
    );
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS unfinished_run_expiry ON runs(mode,deadline_at) WHERE phase != 'finished'",
  );
  // Fail before listening if initial content is missing or invalid. Reload for every new game.
  loadQuestionBank(config.questionDirectory, config.assetDirectory);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const playerView = (player) => ({
    id: player.id,
    nickname: player.nickname,
    rankedEligible: !!player.identity_subject,
  });
  const loadRun = (id, playerId) => {
    const item = get('SELECT * FROM runs WHERE id = ? AND player_id = ?', id, playerId);
    if (!item) fail(404, 'RUN_NOT_FOUND', '没有找到这场挑战');
    return item;
  };
  const currentRound = (item) =>
    get('SELECT * FROM rounds WHERE run_id = ? AND round_index = ?', item.id, item.round_index);
  const startRound = (item, index, now) => {
    run(
      'INSERT INTO rounds (id,run_id,round_index,image_ticket,started_at,expires_at) VALUES (?,?,?,?,?,?)',
      randomUUID(),
      item.id,
      index,
      opaque(),
      now,
      Math.min(now + ROUND_MS, item.deadline_at),
    );
    run("UPDATE runs SET round_index = ?, phase = 'guessing' WHERE id = ?", index, item.id);
  };
  const recordAnswer = (item, round, { year, point, requestId }, now, timedOut = false) => {
    const question = JSON.parse(item.deck)[item.round_index];
    const result = { roundId: round.id, ...scoreAnswer(question, point, year, timedOut) };
    run(
      'INSERT INTO answers (round_id,run_id,request_id,result,received_at) VALUES (?,?,?,?,?)',
      round.id,
      item.id,
      requestId,
      JSON.stringify(result),
      now,
    );
    const finished = item.round_index === item.total - 1;
    run(
      'UPDATE runs SET phase = ?, score = score + ?, finished_at = ? WHERE id = ?',
      finished ? 'finished' : 'revealed',
      result.score,
      finished ? now : null,
      item.id,
    );
    if (finished && item.mode === 'daily') {
      run(
        'INSERT INTO daily_results (player_id,competition_date,run_id,score,finished_at) VALUES (?,?,?,?,?)',
        item.player_id,
        item.competition_date,
        item.id,
        item.score + result.score,
        now,
      );
    }
    return result;
  };
  const expireRun = (item, now) => {
    if (item.phase !== 'finished' && item.deadline_at <= now) {
      while (item.phase !== 'finished') {
        if (item.phase === 'revealed') {
          startRound(item, item.round_index + 1, item.deadline_at);
          item = loadRun(item.id, item.player_id);
        }
        const round = currentRound(item);
        recordAnswer(item, round, { requestId: `timeout:${round.id}` }, item.deadline_at, true);
        item = loadRun(item.id, item.player_id);
      }
      return item;
    }
    if (item.phase === 'guessing') {
      const round = currentRound(item);
      if (round.expires_at <= now) {
        recordAnswer(item, round, { requestId: `timeout:${round.id}` }, now, true);
        return loadRun(item.id, item.player_id);
      }
    }
    return item;
  };
  const runView = (item, now) => {
    const round = currentRound(item);
    const q = JSON.parse(item.deck)[item.round_index];
    const results = all('SELECT result FROM answers WHERE run_id = ? ORDER BY rowid', item.id).map(
      (x) => JSON.parse(x.result),
    );
    const opponent = item.invite_code
      ? get(
          'SELECT p.nickname,r.score FROM invites i JOIN runs r ON r.id = i.host_run_id JOIN players p ON p.id = r.player_id WHERE i.code = ?',
          item.invite_code,
        )
      : null;
    return {
      id: item.id,
      mode: item.mode,
      phase: item.phase,
      index: item.round_index,
      total: item.total,
      score: item.score,
      expiresAt: item.deadline_at,
      round:
        item.phase === 'finished'
          ? null
          : {
              id: round.id,
              image: `${PREFIX}/images/${round.image_ticket}`,
              clue: q.clue,
              view: q.view,
              expiresAt: round.expires_at,
            },
      results,
      opponent: opponent ?? null,
      serverNow: now,
    };
  };
  const createRun = (player, input, now, frozen) => {
    const mode = input.mode;
    if (!['practice', 'daily', 'duel'].includes(mode))
      fail(400, 'INVALID_MODE', '请选择有效的挑战模式');
    const today = dateAt(now);
    if (mode === 'daily') {
      if (!player.identity_subject)
        fail(403, 'IDENTITY_REQUIRED', '登录可信账号后才能参加全站正式挑战');
      const existing = get(
        "SELECT id FROM runs WHERE player_id = ? AND mode = 'daily' AND competition_date = ?",
        player.id,
        today,
      );
      if (existing)
        fail(409, 'DAILY_USED', '今天的正式挑战已开始，可继续原对局', { runId: existing.id });
    }
    const count = get(
      'SELECT COUNT(*) AS count FROM runs WHERE player_id = ? AND created_at > ?',
      player.id,
      now - DAY,
    ).count;
    if (count >= 80) fail(429, 'RATE_LIMITED', '今天的挑战次数较多，请明天再来');
    const total = frozen ? frozen.total : mode === 'practice' && input.level ? 3 : 5;
    let deck, version;
    if (frozen) {
      deck = JSON.parse(frozen.deck);
      version = frozen.question_version;
    } else {
      const bank = loadQuestionBank(config.questionDirectory, config.assetDirectory);
      const recent = all(
        'SELECT deck FROM runs WHERE player_id = ? ORDER BY created_at DESC LIMIT 3',
        player.id,
      ).flatMap((item) => JSON.parse(item.deck).map((q) => q.id));
      const selected = selectQuestions(bank, {
        total,
        chapter: mode === 'practice' ? input.chapter : undefined,
        recent,
      });
      deck = selected.map(({ imageBytes, imageMime, ...q }) => {
        run(
          'INSERT OR IGNORE INTO images (hash,mime,bytes) VALUES (?,?,?)',
          q.imageHash,
          imageMime,
          imageBytes,
        );
        return q;
      });
      version = bank.version;
    }
    const id = randomUUID();
    const deadline = Math.min(
      now + 30 * 60 * 1000,
      mode === 'daily' ? dayEndAt(now) : Infinity,
      input.inviteExpiresAt ?? Infinity,
    );
    run(
      'INSERT INTO runs (id,player_id,mode,phase,question_version,deck,total,competition_date,invite_code,created_at,deadline_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id,
      player.id,
      mode,
      'guessing',
      version,
      JSON.stringify(deck),
      total,
      mode === 'daily' ? today : null,
      input.inviteCode ?? null,
      now,
      deadline,
    );
    startRound({ id, deadline_at: deadline }, 0, now);
    return loadRun(id, player.id);
  };
  const verifyIdentity = (identity, now) => {
    if (!config.identitySecret) fail(503, 'IDENTITY_UNAVAILABLE', '正式账号认证尚未配置');
    if (typeof identity !== 'string' || identity.length > 2048)
      fail(401, 'INVALID_IDENTITY', '账号凭证无效');
    const parts = identity.split('.');
    if (parts.length !== 2 || !parts.every((x) => /^[A-Za-z0-9_-]+$/.test(x)))
      fail(401, 'INVALID_IDENTITY', '账号凭证无效');
    const expected = createHmac('sha256', config.identitySecret).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      fail(401, 'INVALID_IDENTITY', '账号凭证无效');
    let claims;
    try {
      claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      fail(401, 'INVALID_IDENTITY', '账号凭证无效');
    }
    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      !claims.sub.trim() ||
      claims.sub.length > 160 ||
      claims.aud !== 'here-and-then' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now ||
      claims.exp * 1000 > now + 300_000 ||
      typeof claims.nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{16,160}$/.test(claims.nonce)
    )
      fail(401, 'INVALID_IDENTITY', '账号凭证已过期或无效');
    if (get('SELECT nonce FROM identity_nonces WHERE nonce = ?', claims.nonce))
      fail(401, 'IDENTITY_REPLAYED', '账号凭证已使用，请重新登录');
    run(
      'INSERT INTO identity_nonces (nonce,expires_at) VALUES (?,?)',
      claims.nonce,
      claims.exp * 1000,
    );
    return claims;
  };
  const authenticate = (req, now, optional = false) => {
    const header = req.headers.authorization ?? '';
    if (!header && optional) return null;
    if (!/^Bearer [A-Za-z0-9_-]{32,100}$/.test(header))
      fail(401, 'AUTH_REQUIRED', '请重新进入游戏');
    const player = get(
      'SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ? AND s.expires_at > ?',
      digest(header.slice(7)),
      now,
    );
    if (!player) fail(401, 'AUTH_REQUIRED', '游戏会话已过期，请重新进入');
    return player;
  };
  const getInvite = (code, now) => {
    const invite = get(
      'SELECT i.*,r.player_id,r.score,r.total FROM invites i JOIN runs r ON r.id = i.host_run_id WHERE i.code = ?',
      code,
    );
    if (!invite) fail(404, 'INVITE_NOT_FOUND', '没有找到这封战书');
    if (invite.expires_at <= now) fail(410, 'INVITE_EXPIRED', '战书已过期，请好友重新发起挑战');
    return invite;
  };
  const inviteView = (invite, player) => {
    const host = get('SELECT nickname FROM players WHERE id = ?', invite.player_id);
    if (player?.id === invite.player_id) {
      for (const expired of all(
        "SELECT * FROM runs WHERE invite_code = ? AND phase != 'finished' AND deadline_at <= ?",
        invite.code,
        config.now(),
      ))
        expireRun(expired, config.now());
    }
    const own = player
      ? get(
          'SELECT id,phase,score FROM runs WHERE player_id = ? AND invite_code = ?',
          player.id,
          invite.code,
        )
      : null;
    const challengers =
      player?.id === invite.player_id
        ? all(
            "SELECT p.nickname,r.score,r.finished_at AS finishedAt FROM runs r JOIN players p ON p.id = r.player_id WHERE r.invite_code = ? AND r.phase = 'finished' ORDER BY r.finished_at DESC,r.id DESC LIMIT 100",
            invite.code,
          )
        : [];
    return {
      code: invite.code,
      expiresAt: invite.expires_at,
      host: { nickname: host.nickname, score: invite.score },
      total: invite.total,
      ownRunId: own?.id ?? null,
      ownScore: own?.phase === 'finished' ? own.score : null,
      challengers,
    };
  };
  const leaderboard = (period, player, now) => {
    if (!['day', 'week'].includes(period)) fail(400, 'INVALID_PERIOD', '排行榜周期无效');
    const today = dateAt(now),
      start = period === 'day' ? today : weekAt(today),
      end = shiftDate(start, period === 'day' ? 1 : 7);
    for (const expired of all(
      "SELECT * FROM runs WHERE mode = 'daily' AND phase != 'finished' AND deadline_at <= ?",
      now,
    ))
      expireRun(expired, now);
    const rows = all(
      `WITH daily AS (
      SELECT player_id,score,ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY score DESC,competition_date ASC) AS day_order
      FROM daily_results WHERE competition_date >= ? AND competition_date < ?
    ), totals AS (
      SELECT player_id,SUM(score) AS score,COUNT(*) AS days FROM daily WHERE day_order <= 5 GROUP BY player_id
    ) SELECT RANK() OVER (ORDER BY t.score DESC) AS rank,p.id AS playerId,p.nickname,t.score,t.days
      FROM totals t JOIN players p ON p.id = t.player_id ORDER BY t.score DESC,p.id ASC`,
      start,
      end,
    );
    return {
      period,
      startsAt: start,
      endsAt: end,
      timeZone: config.timeZone,
      entries: rows.slice(0, 100),
      self: rows.find((row) => row.playerId === player?.id) ?? null,
      serverNow: now,
    };
  };
  const route = (req, url, body, now) => {
    const path = url.pathname.slice(PREFIX.length);
    const method = req.method;
    if (method === 'GET' && path === '/health')
      return {
        ok: true,
        service: 'here-and-then',
        version: 1,
        rankedAvailable: !!config.identitySecret,
        roundSeconds: 25,
        competitionTimeZone: config.timeZone,
      };
    if (method === 'POST' && path === '/sessions') {
      const claims = body.identity ? verifyIdentity(body.identity, now) : null;
      let player = claims
        ? get('SELECT * FROM players WHERE identity_subject = ?', claims.sub)
        : null;
      if (!player) {
        const id = randomUUID();
        run(
          'INSERT INTO players (id,identity_subject,nickname,created_at) VALUES (?,?,?,?)',
          id,
          claims?.sub ?? null,
          nicknameOf(claims?.nickname ?? body.nickname),
          now,
        );
        player = get('SELECT * FROM players WHERE id = ?', id);
      }
      const token = opaque(),
        expiresAt = now + 30 * DAY;
      run(
        'INSERT INTO sessions (token_hash,player_id,expires_at) VALUES (?,?,?)',
        digest(token),
        player.id,
        expiresAt,
      );
      return { token, player: playerView(player), expiresAt };
    }
    if (method === 'GET' && path === '/leaderboard')
      return leaderboard(
        url.searchParams.get('period') ?? 'week',
        authenticate(req, now, true),
        now,
      );
    const invitePath = /^\/invites\/([A-Za-z0-9_-]{20,64})(\/join)?$/.exec(path);
    if (invitePath && method === 'GET' && !invitePath[2])
      return {
        invite: inviteView(getInvite(invitePath[1], now), authenticate(req, now, true)),
        serverNow: now,
      };
    const player = authenticate(req, now);
    if (method === 'GET' && path === '/me') {
      const active = get(
        "SELECT * FROM runs WHERE player_id = ? AND phase != 'finished' ORDER BY created_at DESC LIMIT 1",
        player.id,
      );
      const daily = get(
        "SELECT id FROM runs WHERE player_id = ? AND mode = 'daily' AND competition_date = ?",
        player.id,
        dateAt(now),
      );
      return {
        player: playerView(player),
        activeRun: active ? runView(expireRun(active, now), now) : null,
        daily: { date: dateAt(now), played: !!daily, runId: daily?.id ?? null },
        serverNow: now,
      };
    }
    if (method === 'PATCH' && path === '/me') {
      if (typeof body.nickname !== 'string' || !body.nickname.trim())
        fail(400, 'INVALID_NICKNAME', '请输入旅人昵称');
      run('UPDATE players SET nickname = ? WHERE id = ?', nicknameOf(body.nickname), player.id);
      return {
        player: playerView(get('SELECT * FROM players WHERE id = ?', player.id)),
        serverNow: now,
      };
    }
    if (method === 'POST' && path === '/runs')
      return {
        run: runView(
          createRun(player, { mode: body.mode, chapter: body.chapter, level: body.level }, now),
          now,
        ),
      };
    if (invitePath && method === 'POST' && invitePath[2]) {
      const invite = getInvite(invitePath[1], now);
      if (invite.player_id === player.id) fail(409, 'OWN_INVITE', '这封战书属于你，请分享给好友');
      const existing = get(
        'SELECT * FROM runs WHERE player_id = ? AND invite_code = ?',
        player.id,
        invite.code,
      );
      if (existing)
        return { run: runView(expireRun(existing, now), now), invite: inviteView(invite, player) };
      const hostRun = get('SELECT * FROM runs WHERE id = ?', invite.host_run_id);
      const joined = createRun(
        player,
        { mode: 'duel', inviteCode: invite.code, inviteExpiresAt: invite.expires_at },
        now,
        hostRun,
      );
      return { run: runView(joined, now), invite: inviteView(invite, player) };
    }
    const runPath = /^\/runs\/([a-f0-9-]{36})(?:\/(answers|next|invite))?$/.exec(path);
    if (runPath) {
      let item = loadRun(runPath[1], player.id);
      if (method === 'POST' && runPath[2] === 'answers') {
        if (
          typeof body.roundId !== 'string' ||
          typeof body.requestId !== 'string' ||
          !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)
        )
          fail(400, 'INVALID_ANSWER', '作答请求无效');
        const previous = get(
          'SELECT round_id FROM answers WHERE run_id = ? AND request_id = ?',
          item.id,
          body.requestId,
        );
        if (previous && previous.round_id !== body.roundId)
          fail(409, 'REQUEST_ID_REUSED', '此提交编号已用于另一题');
        const already = get(
          'SELECT round_id FROM answers WHERE run_id = ? AND round_id = ?',
          item.id,
          body.roundId,
        );
        if (already) return { run: runView(expireRun(item, now), now) };
        if (item.deadline_at <= now) return { run: runView(expireRun(item, now), now) };
        const round = currentRound(item);
        if (item.phase !== 'guessing' || round.id !== body.roundId)
          fail(409, 'ROUND_NOT_ACTIVE', '该题已结束，请继续当前挑战');
        const timedOut = now >= round.expires_at;
        if (!timedOut && (!yearValid(body.year) || !pointValid(body.point)))
          fail(400, 'INVALID_ANSWER', '请选择有效的年代和地点');
        recordAnswer(item, round, body, now, timedOut);
        return { run: runView(loadRun(item.id, player.id), now) };
      }
      item = expireRun(item, now);
      if (method === 'GET' && !runPath[2]) return { run: runView(item, now) };
      if (method === 'POST' && runPath[2] === 'next') {
        if (typeof body.roundId !== 'string') fail(400, 'ROUND_ID_REQUIRED', '请提供上一题的编号');
        if (currentRound(item).id !== body.roundId) return { run: runView(item, now) };
        if (item.phase === 'revealed') startRound(item, item.round_index + 1, now);
        return { run: runView(loadRun(item.id, player.id), now) };
      }
      if (method === 'POST' && runPath[2] === 'invite') {
        if (item.mode !== 'duel' || item.phase !== 'finished' || item.invite_code)
          fail(409, 'INVITE_NOT_READY', '完成自己发起的 5 题挑战后即可生成战书');
        let existing = get('SELECT * FROM invites WHERE host_run_id = ?', item.id);
        if (!existing) {
          const code = opaque();
          run(
            'INSERT INTO invites (code,host_run_id,created_at,expires_at) VALUES (?,?,?,?)',
            code,
            item.id,
            now,
            now + DAY,
          );
          existing = get('SELECT * FROM invites WHERE code = ?', code);
        }
        return { invite: inviteView(getInvite(existing.code, now), player), serverNow: now };
      }
    }
    fail(404, 'NOT_FOUND', '接口不存在');
  };

  const requestBuckets = new Map();
  const checkRate = (req, pathname, now) => {
    // Only enable this behind a proxy that overwrites X-Real-IP; never trust it by default.
    const address =
      config.trustProxy && typeof req.headers['x-real-ip'] === 'string'
        ? req.headers['x-real-ip']
        : (req.socket.remoteAddress ?? 'local');
    const isSessionRequest = pathname === `${PREFIX}/sessions`;
    const authenticated =
      !isSessionRequest &&
      /^Bearer [A-Za-z0-9_-]{32,100}$/.test(req.headers.authorization ?? '') &&
      get(
        'SELECT player_id FROM sessions WHERE token_hash = ? AND expires_at > ?',
        digest(req.headers.authorization.slice(7)),
        now,
      );
    const key = authenticated ? `player:${authenticated.player_id}` : `address:${address}`;
    const bucket = requestBuckets.get(key);
    if (!bucket || now >= bucket.until)
      requestBuckets.set(key, {
        until: now + 60_000,
        count: 1,
        sessions: isSessionRequest ? 1 : 0,
      });
    else {
      bucket.count += 1;
      if (isSessionRequest) bucket.sessions += 1;
      if (bucket.count > 240 || bucket.sessions > 20)
        fail(429, 'RATE_LIMITED', '请求较频繁，请稍后再试');
    }
    if (requestBuckets.size > 5000)
      for (const [address, value] of requestBuckets)
        if (now >= value.until) requestBuckets.delete(address);
  };
  const readBody = async (req) => {
    if (!['POST', 'PATCH'].includes(req.method)) return {};
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      fail(415, 'JSON_REQUIRED', '请发送 JSON 请求');
    let length = 0,
      bytes = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 8192) fail(413, 'BODY_TOO_LARGE', '请求过大');
      bytes.push(chunk);
    }
    try {
      const parsed = JSON.parse(Buffer.concat(bytes).toString('utf8') || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      fail(400, 'INVALID_JSON', '请求格式有误');
    }
  };
  const sendJSON = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://history.local');
      const now = config.now();
      if (!url.pathname.startsWith(`${PREFIX}/`)) {
        if (!config.staticDirectory || !['GET', 'HEAD'].includes(req.method))
          fail(404, 'NOT_FOUND', '页面不存在');
        const root = realpathSync(config.staticDirectory);
        const pathname = decodeURIComponent(url.pathname);
        if (pathname.split('/').some((part) => part.startsWith('.')))
          fail(404, 'NOT_FOUND', '页面不存在');
        let file = resolve(root, '.' + pathname);
        if (!file.startsWith(root + sep) && file !== root) fail(404, 'NOT_FOUND', '页面不存在');
        if (!existsSync(file) || !statSync(file).isFile()) file = resolve(root, 'index.html');
        if (!realpathSync(file).startsWith(root + sep)) fail(404, 'NOT_FOUND', '页面不存在');
        const mime =
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.json': 'application/json',
            '.woff2': 'font/woff2',
          }[extname(file)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
        return;
      }
      const origin = req.headers.origin;
      if (origin) {
        const sameOrigin =
          origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
        if (!sameOrigin && !config.allowedOrigins.includes(origin))
          fail(403, 'ORIGIN_FORBIDDEN', '此来源未获授权');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
      }
      checkRate(req, url.pathname, now);
      const imagePath = /^\/api\/history\/images\/([A-Za-z0-9_-]{32})$/.exec(url.pathname);
      if (imagePath && req.method === 'GET') {
        const image = get(
          'SELECT r.deck,q.round_index,q.started_at FROM rounds q JOIN runs r ON r.id = q.run_id WHERE q.image_ticket = ?',
          imagePath[1],
        );
        if (!image || now - image.started_at > DAY) fail(404, 'IMAGE_NOT_FOUND', '画面已过期');
        const q = JSON.parse(image.deck)[image.round_index];
        const asset = get('SELECT mime,bytes FROM images WHERE hash = ?', q.imageHash);
        if (!asset) fail(404, 'IMAGE_NOT_FOUND', '画面暂不可用');
        res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'private, no-store' });
        res.end(asset.bytes);
        return;
      }
      const body = await readBody(req);
      // Admission time is when the complete request arrived, never the first byte.
      const response = transaction(() => route(req, url, body, config.now()));
      sendJSON(res, 200, response);
    } catch (error) {
      if (!error.status) options.onError?.(error);
      sendJSON(res, error.status ?? 500, {
        error: {
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.status ? error.message : '服务暂时不可用，请稍后重试',
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return {
    server,
    db,
    listen: (port = Number(env.PORT ?? env.HISTORY_PORT ?? 4185), host = env.HOST ?? '0.0.0.0') =>
      new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolveListen(server.address());
        });
      }),
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((error) => {
          db.close();
          error ? reject(error) : resolveClose();
        });
        server.closeIdleConnections();
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createHistoryServer({
    onError: (error) => console.error('[history-api] request failed:', error.name),
  });
  const address = await app.listen();
  console.log(`此时此地 API listening on ${address.address}:${address.port}`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      app.close().then(() => process.exit(0));
    });
}
