import { activeGun } from './duel-actions.js';
import { DUEL_RULES as R } from './duel-map.js';
import { clamp, type Command } from './duel-types.js';
import type { DuelView } from './duel-session.js';
export function duelInput(
  v: DuelView,
  send: (c: Command) => void,
  action: (id: string) => void,
  remote: () => boolean,
) {
  const touches = new Map<
    number,
    { kind: 'fire' | 'crouch' | 'aim' | 'scope' | 'button'; x: number; y: number; action?: string }
  >();
  function input(
    phase: 'down' | 'move' | 'up' | 'cancel',
    pointerId: number,
    x: number,
    y: number,
    hit: string | null,
  ) {
    if (phase === 'down') {
      const kind =
        v.screen !== 'playing'
          ? 'button'
          : hit === 'fire'
            ? 'fire'
            : hit === 'crouch'
              ? 'crouch'
              : hit
                ? 'button'
                : v.scope && x > 220 && x < 700 && y < 360
                  ? 'scope'
                  : 'aim';
      if (
        (kind === 'fire' || kind === 'crouch') &&
        [...touches.values()].some((t) => t.kind === kind)
      )
        return;
      touches.set(pointerId, { kind, x, y, action: hit ?? undefined });
      if (kind === 'fire') send({ type: 'charge' });
      if (kind === 'crouch') {
        for (const [id, t] of touches) if (t.kind === 'fire') touches.delete(id);
        send({ type: 'crouch', down: true });
      }
      return;
    }
    const t = touches.get(pointerId);
    if (!t) return;
    if (phase === 'move') {
      if (t.kind === 'scope') {
        v.scopeX = clamp(v.scopeX + (x - t.x) * 0.04, -20, 20);
        v.scopeY = clamp(v.scopeY - (y - t.y) * 0.04, -8, 20);
      } else if (t.kind === 'aim') {
        const g = activeGun(v.duel.fighters[v.side]);
        if (g) {
          const pitch = clamp(g.pitch - (y - t.y) * 0.15, R.minPitch, R.maxPitch),
            yaw = clamp(g.yaw + (x - t.x) * 0.09, -R.maxYaw, R.maxYaw);
          send({ type: 'aim', pitch, yaw });
          if (remote()) {
            g.pitch = pitch;
            g.yaw = yaw;
          }
        }
      }
      t.x = x;
      t.y = y;
      return;
    }
    touches.delete(pointerId);
    if (t.kind === 'fire') send({ type: phase === 'up' ? 'fire' : 'cancel' });
    else if (t.kind === 'crouch') send({ type: 'crouch', down: false });
    else if (phase === 'up' && t.kind === 'button' && t.action === hit && t.action)
      action(t.action);
  }

  return {
    input,
    cancel() {
      touches.clear();
      send({ type: 'cancel' });
    },
  };
}
