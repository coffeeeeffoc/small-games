import { mapData } from '../game/core/rules.ts';
import { DIRECTIONS, MARKS, SPACING } from '../game/core/model.ts';
import type { Level, Run, Target } from '../game/core/model.ts';

export function MapView({
  level,
  run,
  targets,
  mini = false,
}: {
  level: Level;
  run: Run;
  targets: Target[];
  mini?: boolean;
}) {
  const data = mapData(level, run, targets);
  if (!data) return null;
  const xs = data.rooms.map((r) => r.x * SPACING),
    zs = data.rooms.map((r) => r.z * SPACING);
  const x0 = Math.min(...xs) - 7,
    z0 = Math.min(...zs) - 7;
  const w = Math.max(...xs) - x0 + 7,
    h = Math.max(...zs) - z0 + 7;
  return (
    <svg
      className={mini ? 'fog-map mini-map' : 'fog-map'}
      viewBox={`${x0} ${z0} ${w} ${h}`}
      role="img"
      aria-label="已探索区域地图"
    >
      <defs>
        <pattern
          id={mini ? 'dots-mini' : 'dots-full'}
          width="2"
          height="2"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".045" fill="#839b90" />
        </pattern>
      </defs>
      <rect x={x0} y={z0} width={w} height={h} fill={`url(#${mini ? 'dots-mini' : 'dots-full'})`} />
      {data.edges.map((e) => {
        const a = data.rooms.find((r) => r.id === e.a)!,
          b = data.rooms.find((r) => r.id === e.b)!;
        return (
          <line
            key={e.id}
            x1={a.x * SPACING}
            y1={a.z * SPACING}
            x2={b.x * SPACING}
            y2={b.z * SPACING}
            stroke="#a4bca6"
            strokeWidth="1.5"
          />
        );
      })}
      {data.rooms.map((r) => (
        <rect
          key={r.id}
          x={r.x * SPACING - 2.65}
          y={r.z * SPACING - 2.65}
          width="5.3"
          height="5.3"
          rx=".3"
          fill="#324d48"
          stroke="#9cae95"
          strokeWidth=".15"
        />
      ))}
      {data.openings.map((o, i) => {
        const r = data.rooms.find((r) => r.id === o.room)!,
          d = DIRECTIONS[o.dir],
          x = r.x * SPACING,
          z = r.z * SPACING;
        return o.status === 'mirror' ? (
          <text
            key={i}
            x={x + d.x * 3.1}
            y={z + d.z * 3.1 + 0.4}
            textAnchor="middle"
            fontSize="1.1"
            fill="#e6c391"
          >
            ×
          </text>
        ) : (
          <line
            key={i}
            x1={x + d.x * 2.65}
            y1={z + d.z * 2.65}
            x2={x + d.x * 3.7}
            y2={z + d.z * 3.7}
            stroke={o.status === 'unknown' ? '#d6bfa0' : '#abc5ab'}
            strokeWidth=".45"
            strokeDasharray={o.status === 'unknown' ? '.25 .2' : undefined}
          />
        );
      })}
      {data.points.map((t) => (
        <text key={t.id} x={t.x} y={t.z + 0.45} textAnchor="middle" fontSize="1.4" fill="#f3d392">
          {t.kind === 'exit' ? '门' : '◇'}
        </text>
      ))}
      {data.marks.map((t) => (
        <text
          key={t.id}
          x={t.x}
          y={t.z + 0.4}
          transform={
            t.mark.kind === 'arrow' ? `rotate(${t.mark.direction * 90} ${t.x} ${t.z})` : undefined
          }
          fontSize="1.2"
          textAnchor="middle"
          fill={MARKS[t.mark.kind].color}
        >
          {MARKS[t.mark.kind].symbol}
        </text>
      ))}
      <path
        d="M 0 -1.05 L .65 .7 L 0 .4 L -.65 .7 Z"
        fill="#fff5cf"
        stroke="#172e2b"
        strokeWidth=".13"
        transform={`translate(${run.x} ${run.z}) rotate(${(-run.yaw * 180) / Math.PI})`}
      />
    </svg>
  );
}
