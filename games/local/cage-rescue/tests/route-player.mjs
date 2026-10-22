// A geometric aiming player for reachability checks. It observes visible objects
// and sends only targetX/launch input; it never edits the live simulation.
const radius = 7,
  left = 23,
  right = 367,
  paddleY = 616,
  maxAngle = Math.PI * 0.365;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const reflect = (x) => {
  const span = right - left,
    n = (((x - left) % (2 * span)) + 2 * span) % (2 * span);
  return left + (n > span ? 2 * span - n : n);
};

function rayBox(x, y, dx, dy, box) {
  let near = -Infinity,
    far = Infinity,
    axis = 'y';
  for (const [pos, dir, min, max, name] of [
    [x, dx, box.x - radius, box.x + box.w + radius, 'x'],
    [y, dy, box.y - radius, box.y + box.h + radius, 'y'],
  ]) {
    if (Math.abs(dir) < 1e-10) {
      if (pos < min || pos > max) return null;
      continue;
    }
    const a = (min - pos) / dir,
      b = (max - pos) / dir;
    if (Math.min(a, b) > near) {
      near = Math.min(a, b);
      axis = name;
    }
    far = Math.min(far, Math.max(a, b));
  }
  return far >= Math.max(0, near) && near > 0.001 ? { distance: near, axis } : null;
}

function aim(state, landing, salt) {
  const objects = [
    ...state.cages.filter((item) => item.hp > 0).map((item) => ({ ...item, score: 100 })),
    ...state.bricks.filter((item) => item.hp > 0).map((item) => ({ ...item, score: 4 })),
    ...state.devices
      .filter((item) => item.charges > 0)
      .map((item) => ({
        ...item,
        score: item.kind === 'switch' ? 130 : item.kind === 'splitter' ? 110 : 15,
      })),
    ...state.barriers.filter((item) => !item.open).map((item) => ({ ...item, score: 0 })),
  ];
  let best = -Infinity,
    chosen = 0;
  for (let i = 0; i <= 180; i++) {
    const desired = -maxAngle + (2 * maxAngle * (i + (salt % 5) / 5)) / 180;
    const target = clamp(
      landing - ((desired / maxAngle) * state.paddle.w) / 2,
      16 + state.paddle.w / 2,
      374 - state.paddle.w / 2,
    );
    const angle = clamp((landing - target) / (state.paddle.w / 2), -1, 1) * maxAngle;
    let dx = Math.sin(angle),
      dy = -Math.cos(angle),
      x = landing,
      y = paddleY - 0.02;
    if (Math.abs(dx) < 18 / state.level.ballSpeed)
      dx = ((dx < 0 ? -1 : 1) * 18) / state.level.ballSpeed;
    dy = -Math.sqrt(1 - dx * dx);
    let travelled = 0,
      score = 0;
    const hits = new Set();
    for (let bounce = 0; bounce < 14; bounce++) {
      let nearest = { distance: dx > 0 ? (right - x) / dx : (left - x) / dx, axis: 'x' },
        object = null;
      const vertical = dy < 0 ? (77 - y) / dy : (paddleY - y) / dy;
      if (vertical < nearest.distance) nearest = { distance: vertical, axis: 'y', bottom: dy > 0 };
      for (const candidate of objects) {
        if (hits.has(candidate.id) && candidate.material !== 'steel') continue;
        const contact = rayBox(x, y, dx, dy, candidate);
        if (contact && contact.distance < nearest.distance) {
          nearest = contact;
          object = candidate;
        }
      }
      travelled += nearest.distance;
      if (travelled > 3200 || nearest.bottom) break;
      x += dx * nearest.distance;
      y += dy * nearest.distance;
      if (object && !hits.has(object.id)) {
        score += object.score / (1 + travelled / 600);
        hits.add(object.id);
      }
      if (nearest.axis === 'x') dx *= -1;
      else dy *= -1;
      x += dx * 0.05;
      y += dy * 0.05;
    }
    score += Math.sin(i * 12.7 + salt * 2.3) * 0.07;
    if (score > best) {
      best = score;
      chosen = target;
    }
  }
  return chosen;
}

export function createRoutePlayer() {
  let decision = null,
    shots = 0;
  return (state) => {
    const candidates = [state.ball, ...state.extraBalls].filter((ball) => ball.active);
    const eta = (ball) => (ball.vy > 0 ? Math.max(0, (paddleY - ball.y) / ball.vy) : Infinity);
    const ball = candidates.sort((a, b) => eta(a) - eta(b))[0] || state.ball;
    const time = eta(ball),
      landing = Number.isFinite(time) ? reflect(ball.x + ball.vx * time) : ball.x;
    if (state.phase === 'ready') {
      decision = null;
      return { targetX: state.paddle.x, launch: true };
    }
    if (ball.vy > 0 && ball.y > 450) {
      if (!decision || decision.id !== ball.id || Math.abs(decision.landing - landing) > 1) {
        decision = { id: ball.id, landing, target: aim(state, landing, shots++) };
      }
    } else decision = null;
    let targetX = decision?.target ?? landing;
    const person = state.people
      .filter((item) => item.status === 'falling' && item.y + item.r < state.paddle.y)
      .sort((a, b) => b.y - a.y)[0];
    if (person) {
      const personETA = (state.paddle.y - person.r - person.y) / state.level.personSpeed;
      const wind = state.level.wind;
      const t = state.time + personETA,
        frequency = wind ? (2 * Math.PI) / wind.period : 0;
      const rescueX = wind
        ? clamp(
            person.originX +
              wind.amplitude *
                (Math.sin(t * frequency + wind.phase) -
                  Math.sin(person.releaseAt * frequency + wind.phase)),
            27,
            363,
          )
        : person.x;
      const travel = Math.abs(rescueX - state.paddle.x) / 1100;
      if (personETA < 0.65 + travel && (time > 0.25 || personETA < time || personETA < 0.25))
        targetX = rescueX;
    }
    return { targetX };
  };
}
