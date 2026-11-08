import { Graphics, Label, UITransform, view } from 'cc';
import {
  FRIENDLY_POSTS,
  MAP,
  PROTECTED,
  mapRoute,
  riverX,
  routePoint,
  terrainHeight,
  type BattlefieldId,
  type Point,
} from './core/Data';
import { type MissionLight } from './core/MissionCatalog';
import type { Simulation } from './core/Simulation';
import { drawEffects } from './Effects';
import { C, col } from './HudTheme';
import type { World } from './World';

import type { HUD } from './HUD';
type WorldOverlayViewHost = Pick<
  HUD,
  | 'autoPriority'
  | 'blocksBattlefield'
  | 'buttons'
  | 'compact'
  | 'effects'
  | 'footer'
  | 'h'
  | 'label'
  | 'labels'
  | 'lockedTargets'
  | 'marks'
  | 'minimapLayout'
  | 'mousePointer'
  | 'rect'
  | 'reducedEffects'
  | 'root'
  | 'safe'
  | 'set'
  | 't'
  | 'touch'
  | 'unitLabels'
  | 'w'
>;

// 投影标记与北向小地图只读模拟状态，命中与碰撞仍由模拟层决定。
export class WorldOverlayView {
  private readonly hud: WorldOverlayViewHost;
  constructor(hud: WorldOverlayViewHost) {
    this.hud = hud;
  }
  routeGraphic(
    graphics: Graphics,
    x: number,
    y: number,
    previewWidth: number,
    height: number,
    progress = 0,
    map: BattlefieldId = 'valley',
    light: MissionLight = 'day',
    enemies: readonly Point[] = [],
  ) {
    if (previewWidth <= 0 || height <= 0) return;
    const route = mapRoute(map);
    const point = (worldPoint: Point) => ({
      x: x + ((worldPoint.x / MAP.halfWidth + 1) * previewWidth) / 2 - this.hud.w / 2,
      y: this.hud.h / 2 - y - ((worldPoint.z / MAP.halfDepth + 1) * height) / 2,
    });
    const colors =
      light === 'night'
        ? [
            [17, 39, 53],
            [70, 100, 117],
          ]
        : light === 'dusk'
          ? [
              [67, 61, 48],
              [165, 125, 80],
            ]
          : map === 'highland'
            ? [
                [78, 91, 70],
                [187, 181, 147],
              ]
            : [
                [43, 76, 58],
                [156, 177, 117],
              ];
    // Sample the same height field as the battlefield so ridges and roads stay in place.
    const columns = 32;
    const rows = 20;
    const cellWidth = (MAP.halfWidth * 2) / columns;
    const cellDepth = (MAP.halfDepth * 2) / rows;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns; i++) {
        const worldX = -MAP.halfWidth + i * cellWidth;
        const worldZ = -MAP.halfDepth + j * cellDepth;
        const corners = [
          { x: worldX, z: worldZ },
          { x: worldX + cellWidth, z: worldZ },
          { x: worldX + cellWidth, z: worldZ + cellDepth },
          { x: worldX, z: worldZ + cellDepth },
        ];
        for (const indices of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          const triangle = indices.map((k) => corners[k]);
          const centroidX = triangle.reduce((sum, worldPoint) => sum + worldPoint.x, 0) / 3;
          const centroidZ = triangle.reduce((sum, worldPoint) => sum + worldPoint.z, 0) / 3;
          const elevation = terrainHeight(centroidX, centroidZ, map);
          const shade = Math.max(
            0,
            Math.min(
              1,
              (elevation / (map === 'highland' ? 22 : 10)) * 0.75 +
                (elevation - terrainHeight(centroidX - 4, centroidZ - 4, map)) * 0.18 +
                0.12,
            ),
          );
          graphics.fillColor = col(
            '#' +
              colors[0]
                .map((v, k) =>
                  Math.round(v + (colors[1][k] - v) * shade)
                    .toString(16)
                    .padStart(2, '0'),
                )
                .join(''),
          );
          triangle.forEach((worldPoint, k) => {
            const mapPoint = point(worldPoint);
            if (k) graphics.lineTo(mapPoint.x, mapPoint.y);
            else graphics.moveTo(mapPoint.x, mapPoint.y);
          });
          graphics.close();
          graphics.fill();
        }
      }
    if (map === 'valley') {
      for (const [width, color] of [
        [Math.max(7, previewWidth * 0.032), light === 'night' ? '#254656' : '#7c9c87'],
        [Math.max(3, previewWidth * 0.017), light === 'night' ? '#396785' : '#4e9eac'],
      ] as const) {
        graphics.lineWidth = width;
        graphics.strokeColor = col(color);
        for (let j = 0; j <= 24; j++) {
          const z = -MAP.halfDepth + (j / 24) * MAP.halfDepth * 2;
          const mapPoint = point({ x: riverX(z), z });
          if (j) graphics.lineTo(mapPoint.x, mapPoint.y);
          else graphics.moveTo(mapPoint.x, mapPoint.y);
        }
        graphics.stroke();
      }
    }
    if (height >= 60)
      for (let j = 1; j < 7; j++)
        for (let i = 1; i < 11; i++) {
          const worldPoint = {
            x: ((i / 11) * 2 - 1) * MAP.halfWidth + Math.sin(i * 7 + j) * 7,
            z: ((j / 7) * 2 - 1) * MAP.halfDepth,
          };
          if (
            (i + j * 3) % 4 === 0 ||
            (map === 'valley' && Math.abs(worldPoint.x - riverX(worldPoint.z)) < 10) ||
            route.some(
              (mapPoint) => Math.hypot(mapPoint.x - worldPoint.x, mapPoint.z - worldPoint.z) < 12,
            )
          )
            continue;
          const mapPoint = point(worldPoint);
          const treeRadius = Math.max(2, Math.min(4, previewWidth / 90));
          graphics.fillColor = col(
            light === 'night' ? '#132d36' : light === 'dusk' ? '#474936' : '#254f3b',
          );
          graphics.circle(mapPoint.x + 1, mapPoint.y - 1, treeRadius + 1);
          graphics.fill();
          graphics.fillColor = col(
            light === 'night' ? '#254351' : light === 'dusk' ? '#717148' : '#55794a',
          );
          graphics.circle(mapPoint.x, mapPoint.y + 1, treeRadius);
          graphics.fill();
        }
    for (const [width, color] of [
      [6, '#17262b'],
      [3, '#c2b58c'],
      [1.5, C.amber],
    ] as const) {
      graphics.lineWidth = width;
      graphics.strokeColor = col(color);
      route.forEach((worldPoint, i) => {
        const mapPoint = point(worldPoint);
        if (i) graphics.lineTo(mapPoint.x, mapPoint.y);
        else graphics.moveTo(mapPoint.x, mapPoint.y);
      });
      graphics.stroke();
    }
    for (const post of FRIENDLY_POSTS) {
      const mapPoint = point(post);
      for (let i = 0; i < 3; i++) {
        graphics.fillColor = col('#172c37');
        graphics.rect(mapPoint.x - 7 + i * 5, mapPoint.y - 4, 5, 8);
        graphics.fill();
        graphics.fillColor = col(light === 'night' ? '#d0ad69' : '#adad91');
        graphics.rect(mapPoint.x - 8 + i * 5, mapPoint.y - 2, 4, 6);
        graphics.fill();
      }
      graphics.strokeColor = col(C.mint);
      graphics.lineWidth = 1;
      graphics.rect(mapPoint.x - 10, mapPoint.y - 6, 19, 13);
      graphics.stroke();
    }
    for (const enemy of enemies) {
      const mapPoint = point(enemy);
      const treeRadius = height < 70 ? 2.5 : 4;
      graphics.fillColor = col('#14242b');
      graphics.strokeColor = col(C.red);
      graphics.lineWidth = 1.5;
      graphics.moveTo(mapPoint.x, mapPoint.y + treeRadius);
      graphics.lineTo(mapPoint.x + treeRadius, mapPoint.y);
      graphics.lineTo(mapPoint.x, mapPoint.y - treeRadius);
      graphics.lineTo(mapPoint.x - treeRadius, mapPoint.y);
      graphics.close();
      graphics.fill();
      graphics.stroke();
    }
    for (const worldPoint of [route[0], route.at(-1)!]) {
      const mapPoint = point(worldPoint);
      graphics.fillColor = col('#1c2a2e');
      graphics.circle(mapPoint.x, mapPoint.y, 5);
      graphics.fill();
      graphics.strokeColor = col(C.mint);
      graphics.lineWidth = 2;
      graphics.circle(mapPoint.x, mapPoint.y, 5);
      graphics.stroke();
    }
    const mapPoint = point(routePoint(progress, map));
    graphics.fillColor = col(C.amber);
    graphics.rect(mapPoint.x - 3, mapPoint.y - 2, 6, 4);
    graphics.fill();
  }
  drawMinimap(simulation: Simulation) {
    const graphics = this.hud.marks;
    const map = this.hud.minimapLayout;
    const priorityId = this.hud.autoPriority ? simulation.priorityThreat?.unit.id : undefined;
    this.hud.rect(graphics, map.x, map.y, map.w, map.h, '#0c171d66', '#91e6cb55');
    this.hud.set('mapLegend', this.hud.t('北 ↑', 'N ↑'));
    const point = (worldPoint: Point) => ({
      x:
        map.x +
        8 +
        ((worldPoint.x + MAP.halfWidth) / (2 * MAP.halfWidth)) * (map.w - 16) -
        this.hud.w / 2,
      y:
        this.hud.h / 2 -
        map.y -
        25 -
        ((worldPoint.z + MAP.halfDepth) / (2 * MAP.halfDepth)) * (map.h - 33),
    });
    graphics.strokeColor = col(C.line);
    graphics.lineWidth = 1;
    mapRoute(simulation.mission.map).forEach((worldPoint, i) => {
      const mapPoint = point(worldPoint);
      if (i) graphics.lineTo(mapPoint.x, mapPoint.y);
      else graphics.moveTo(mapPoint.x, mapPoint.y);
    });
    graphics.stroke();
    for (const unit of simulation.units) {
      if (unit.hp <= 0) continue;
      const mapPoint = point(unit);
      if (priorityId === unit.id) {
        graphics.strokeColor = col(C.white);
        graphics.lineWidth = 2;
        graphics.circle(mapPoint.x, mapPoint.y, 6);
        graphics.stroke();
        graphics.lineWidth = 1;
      }
      graphics.strokeColor = col(unit.friendly ? C.mint : C.red);
      graphics.fillColor = col(unit.friendly ? C.mint : C.red);
      if (unit.kind === 'infantry') {
        graphics.circle(mapPoint.x, mapPoint.y, 2);
        graphics.fill();
      } else if (unit.friendly) {
        graphics.rect(mapPoint.x - 3, mapPoint.y - 3, 6, 6);
        graphics.stroke();
      } else {
        graphics.moveTo(mapPoint.x, mapPoint.y + 2.5);
        graphics.lineTo(mapPoint.x + 2.5, mapPoint.y);
        graphics.lineTo(mapPoint.x, mapPoint.y - 2.5);
        graphics.lineTo(mapPoint.x - 2.5, mapPoint.y);
        graphics.close();
        graphics.fill();
      }
    }
    const aim = point(simulation.aim);
    if (
      Math.abs(simulation.aim.x) <= MAP.halfWidth &&
      Math.abs(simulation.aim.z) <= MAP.halfDepth
    ) {
      graphics.strokeColor = col(C.white);
      graphics.circle(aim.x, aim.y, 4);
      graphics.stroke();
    }
  }
  drawWorld(simulation: Simulation, world: World) {
    const graphics = this.hud.marks;
    this.hud.effects = drawEffects(
      graphics,
      simulation,
      world,
      this.hud.w,
      this.hud.h,
      this.hud.reducedEffects,
    );
    const project = (point: Point, y = 0) => {
      const projectedPoint = world.project(point, y);
      return {
        x: projectedPoint.x / view.getScaleX() - this.hud.w / 2,
        y: projectedPoint.y / view.getScaleY() - this.hud.h / 2,
        visible:
          [projectedPoint.x, projectedPoint.y, projectedPoint.z].every(Number.isFinite) &&
          projectedPoint.z >= 0 &&
          projectedPoint.z <= 1,
      };
    };
    const onScreen = (point: ReturnType<typeof project>, padding = 0) =>
      point.visible &&
      Math.abs(point.x) <= this.hud.w / 2 - padding &&
      Math.abs(point.y) <= this.hud.h / 2 - padding;
    const priorityLabel = this.hud.labels.get('priorityMarker')!;
    priorityLabel.node.active = false;
    const threat = simulation.priorityThreat;
    if (threat && this.hud.autoPriority) {
      const point = project(threat.unit, 1.5);
      if (point.visible) {
        let x = Math.max(
          -this.hud.w / 2 + this.hud.safe.left + 48,
          Math.min(this.hud.w / 2 - this.hud.safe.right - 48, point.x),
        );
        const y = Math.max(
          -this.hud.h / 2 + this.hud.safe.bottom + this.hud.footer + 52,
          Math.min(this.hud.h / 2 - this.hud.safe.top - 82, point.y),
        );
        const map = this.hud.minimapLayout;
        if (x + this.hud.w / 2 + 48 > map.x && this.hud.h / 2 - y - 24 < map.y + map.h)
          x = map.x - 56 - this.hud.w / 2;
        const marker = this.hud.buttons.find((b) => b.id === 'priority')!;
        marker.x = x + this.hud.w / 2 - 48;
        marker.y = this.hud.h / 2 - y - 24;

        const clipped = x !== point.x || y !== point.y;
        graphics.strokeColor = col(C.red);
        graphics.lineWidth = 2;
        for (const sx of [-1, 1])
          for (const sy of [-1, 1]) {
            graphics.moveTo(x + sx * 10, y + sy * 19);
            graphics.lineTo(x + sx * 19, y + sy * 19);
            graphics.lineTo(x + sx * 19, y + sy * 10);
          }
        graphics.stroke();
        if (clipped) {
          const angle = Math.atan2(point.y - y, point.x - x);
          graphics.moveTo(x, y);
          graphics.lineTo(x + Math.cos(angle) * 28, y + Math.sin(angle) * 28);
          graphics.stroke();
        }
        priorityLabel.string = this.hud.t(
          `优先 ${Math.ceil(threat.dueIn)}s${clipped ? ' ↗' : ''}`,
          `PRIORITY ${Math.ceil(threat.dueIn)}s${clipped ? ' ↗' : ''}`,
        );
        priorityLabel.node.setPosition(x, y - 33);
        priorityLabel.node.getComponent(UITransform)!.setContentSize(96, 24);
        priorityLabel.node.active = true;
      }
    }
    const groundRing = (point: Point, radius: number) => {
      const points = Array.from({ length: 24 }, (_, i) =>
        project({
          x: point.x + Math.cos((i * Math.PI) / 12) * radius,
          z: point.z + Math.sin((i * Math.PI) / 12) * radius,
        }),
      );
      if (!points.every((point) => onScreen(point, -64))) return;
      points.forEach((point, i) =>
        i ? graphics.lineTo(point.x, point.y) : graphics.moveTo(point.x, point.y),
      );
      graphics.close();
      graphics.stroke();
    };
    for (const [id, l] of Array.from(this.hud.unitLabels.entries()))
      if (!simulation.units.some((u) => u.id === id)) {
        l.node.destroy();
        this.hud.unitLabels.delete(id);
      }
    for (const point of simulation.duelMode ? [] : PROTECTED) {
      graphics.strokeColor = col('#729e9180');
      graphics.lineWidth = 1;
      groundRing(point, point.radius);
    }
    for (const holdDistance of simulation.duelMode ? [] : simulation.holdPoints) {
      const projectedPoint = project(simulation.routePoint(holdDistance));
      if (!onScreen(projectedPoint, 6)) continue;
      graphics.strokeColor = col(C.amber);
      graphics.lineWidth = 1;
      graphics.circle(projectedPoint.x, projectedPoint.y, 6);
      graphics.stroke();
    }
    const placed: { x: number; y: number }[] = [];
    const bottom = -this.hud.h / 2 + this.hud.footer + this.hud.safe.bottom + 44;
    const top = this.hud.h / 2 - 64 - this.hud.safe.top;
    const banners = ['notice', 'friendWarning', 'tutorial']
      .map((id) => this.hud.labels.get(id)!)
      .filter((l) => l.node.active && l.string);
    const overBanner = (x: number, y: number, halfWidth: number) =>
      banners.some((l) => {
        const point = l.node.position;
        const size = l.node.getComponent(UITransform)!.contentSize;
        return (
          Math.abs(x - point.x) < size.width / 2 + halfWidth &&
          Math.abs(y - point.y) < size.height / 2 + 12
        );
      });
    const aim = project(simulation.aim);
    const focus = this.hud.touch
      ? onScreen(aim)
        ? { x: aim.x + this.hud.w / 2, y: this.hud.h / 2 - aim.y }
        : undefined
      : this.hud.mousePointer;
    const pointer = focus && !this.hud.blocksBattlefield(focus.x, focus.y) ? focus : undefined;
    const contacts: { unit: Simulation['units'][number]; point: ReturnType<typeof project> }[] = [];
    let hovered: (typeof contacts)[number] | undefined;
    let hoverDistance = Infinity;
    for (const u of simulation.units) {
      if (u.hp <= 0) continue;
      const projectedPoint = project(u, 0.8);
      // Behind-camera projections mirror direction; those contacts remain on the north-up minimap.
      if (!projectedPoint.visible) continue;
      if (!onScreen(projectedPoint, 6)) continue;
      const map = this.hud.minimapLayout;
      const x = projectedPoint.x + this.hud.w / 2;
      const y = this.hud.h / 2 - projectedPoint.y;
      // Transparent control hit areas must not punch holes in visible enemy markers.
      if (x >= map.x && x <= map.x + map.w && y >= map.y && y <= map.y + map.h) continue;
      const contact = { unit: u, point: projectedPoint };
      contacts.push(contact);
      if (!pointer) continue;
      // Keep the forgiving body-to-marker hover region even when distant markers shrink.
      const body = project(u);
      const dx = body.visible ? body.x - projectedPoint.x : 0;
      const dy = body.visible ? body.y - projectedPoint.y : 0;
      const panelLeft = pointer.x - this.hud.w / 2 - projectedPoint.x;
      const panelTop = this.hud.h / 2 - pointer.y - projectedPoint.y;
      const segmentRatio = Math.max(
        0,
        Math.min(1, (panelLeft * dx + panelTop * dy) / (dx * dx + dy * dy || 1)),
      );
      const distance = Math.hypot(panelLeft - segmentRatio * dx, panelTop - segmentRatio * dy);
      if (distance <= (u.kind === 'heavy' ? 15 : 12) && distance < hoverDistance) {
        hovered = contact;
        hoverDistance = distance;
      }
    }
    const unitLabel = (id: number, width: number, height: number) => {
      let l = this.hud.unitLabels.get(id);
      if (!l) {
        l = this.hud.label(this.hud.root, '', 0, 0, 12, width, height);
        l.node.setSiblingIndex(this.hud.root.children.length - 2);
        this.hud.unitLabels.set(id, l);
      }
      l.node.getComponent(UITransform)!.setContentSize(width, height);
      l.fontSize = this.hud.compact ? 12 : 13;
      l.lineHeight = 18;
      l.isBold = true;
      return l;
    };
    const groups = new Map<number, typeof contacts>();
    for (const contact of contacts) {
      const u = contact.unit;
      if (!u.friendly || u.group === undefined) continue;
      const group = groups.get(u.group) || [];
      group.push(contact);
      groups.set(u.group, group);
    }
    const counts = new Map<number, number>();
    const hidden = new Set<number>();
    for (const [id, members] of groups) {
      if (members.length < 2 || (hovered?.unit.friendly && hovered.unit.group === id)) continue;
      // shortcut: pairwise checks suit the current three-unit groups; use spatial bins for large formations.
      if (
        !members.every((a) =>
          members.every((b) => Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) < 12),
        )
      )
        continue;
      const projectedPoint = members[0].point;
      if (
        projectedPoint.x + 36 > this.hud.w / 2 - this.hud.safe.right ||
        overBanner(projectedPoint.x + 22, projectedPoint.y, 14) ||
        Math.hypot(
          Math.max(0, Math.abs(projectedPoint.x + 22 - aim.x) - 14),
          Math.max(0, Math.abs(projectedPoint.y - aim.y) - 9),
        ) < 40 ||
        [8, 36].some((dx) =>
          this.hud.blocksBattlefield(
            projectedPoint.x + dx + this.hud.w / 2,
            this.hud.h / 2 - projectedPoint.y,
          ),
        )
      )
        continue;
      counts.set(members[0].unit.id, members.length);
      for (const member of members.slice(1)) hidden.add(member.unit.id);
    }
    const ordered = hovered ? [...contacts.filter((c) => c !== hovered), hovered] : contacts;
    for (const contact of ordered) {
      const { unit: u, point: projectedPoint } = contact;
      if (hidden.has(u.id)) continue;
      if (u.kind === 'infantry') {
        const radius = contact === hovered ? 3.5 : 2.5;
        graphics.fillColor = col('#061116');
        graphics.circle(projectedPoint.x, projectedPoint.y, radius + 1.5);
        graphics.fill();
        graphics.fillColor = col(u.friendly ? C.mint : C.red);
        graphics.circle(projectedPoint.x, projectedPoint.y, radius);
        graphics.fill();
      } else {
        const markerRadius = contact === hovered ? 9 : u.kind === 'heavy' ? 7 : 5;
        // Dark outline keeps team colors and shapes legible against bright thermal contacts.
        for (const outline of [true, false]) {
          graphics.lineWidth = outline ? (contact === hovered ? 4 : 3) : 2;
          graphics.strokeColor = col(outline ? '#061116' : u.friendly ? C.mint : C.red);
          if (u.friendly)
            graphics.rect(
              projectedPoint.x - markerRadius,
              projectedPoint.y - markerRadius,
              markerRadius * 2,
              markerRadius * 2,
            );
          else {
            graphics.moveTo(projectedPoint.x, projectedPoint.y + markerRadius);
            graphics.lineTo(projectedPoint.x + markerRadius, projectedPoint.y);
            graphics.lineTo(projectedPoint.x, projectedPoint.y - markerRadius);
            graphics.lineTo(projectedPoint.x - markerRadius, projectedPoint.y);
            graphics.close();
          }
          graphics.stroke();
        }
      }
      const count = counts.get(u.id);
      if (count) {
        const l = unitLabel(u.id, 28, 18);
        l.string = `×${count}`;
        l.color = col(C.mint);
        l.node.setPosition(projectedPoint.x + 22, projectedPoint.y);
        l.node.active = true;
        placed.push({ x: projectedPoint.x + 22, y: projectedPoint.y });
        this.hud.rect(
          graphics,
          projectedPoint.x + this.hud.w / 2 + 8,
          this.hud.h / 2 - projectedPoint.y - 9,
          28,
          18,
          '#0c191fe8',
        );
      }
    }
    for (const id of new Set([
      ...simulation.shots.filter((shot) => shot.guidance).map((shot) => shot.guidance!.target),
      ...(simulation.homingSelected && simulation.homingTarget ? [simulation.homingTarget.id] : []),
    ])) {
      const unit = simulation.units.find((u) => u.id === id && u.hp > 0);
      if (!unit) continue;
      const projectedPoint = project(unit, 0.3);
      if (!onScreen(projectedPoint, 24)) continue;
      const markerRadius = 18;
      for (const outline of [true, false]) {
        graphics.lineWidth = outline ? 6 : 3;
        graphics.strokeColor = col(outline ? '#061116' : C.amber);
        for (const x of [-1, 1])
          for (const y of [-1, 1]) {
            graphics.moveTo(
              projectedPoint.x + x * (markerRadius - 9),
              projectedPoint.y + y * markerRadius,
            );
            graphics.lineTo(
              projectedPoint.x + x * markerRadius,
              projectedPoint.y + y * markerRadius,
            );
            graphics.lineTo(
              projectedPoint.x + x * markerRadius,
              projectedPoint.y + y * (markerRadius - 9),
            );
          }
        graphics.stroke();
      }
      const l = unitLabel(unit.id, 110, 24);
      l.string = simulation.shots.some((shot) => shot.guidance?.target === id)
        ? this.hud.t('追踪中', 'TRACKING')
        : this.hud.t('已锁定', 'LOCKED');
      l.color = col(C.amber);
      l.node.setPosition(projectedPoint.x, projectedPoint.y + 36);
      l.node.active = true;
      this.hud.lockedTargets.push({
        id,
        x: projectedPoint.x + this.hud.w / 2,
        y: this.hud.h / 2 - projectedPoint.y,
      });
    }
    if (hovered && !this.hud.lockedTargets.some((lock) => lock.id === hovered.unit.id)) {
      const { unit: u, point: projectedPoint } = hovered;
      const width = this.hud.compact ? 120 : 176;
      const half = width / 2;
      const l = unitLabel(u.id, width, 24);
      l.color = col(u.friendly ? C.mint : C.red);
      l.string = u.kind==='infantry'?this.hud.t('步兵','INFANTRY'):u.friendly
        ? u.kind === 'escort'
          ? this.hud.t('护卫', 'ESCORT')
          : this.hud.t('救援车', 'RESCUE')
        : this.hud.t(
            u.kind === 'heavy' ? '重甲' : u.kind === 'turret' ? '炮台' : '轻车',
            u.kind.toUpperCase(),
          );
      if (u.hp < u.maxHp)
        l.string +=
          u.hp <= u.maxHp * 0.3
            ? this.hud.t(' · 重创', ' · CRITICAL')
            : this.hud.t(' · 受损', ' · DAMAGED');
      const tag = [
        [0, 56],
        [0, -56],
        [half + 44, 0],
        [-half - 44, 0],
        [half + 44, -24],
        [-half - 44, -24],
      ]
        .map(([dx, dy]) => ({ x: projectedPoint.x + dx, y: projectedPoint.y + dy }))
        .find(
          (point) =>
            point.y <= top - 12 &&
            point.y >= bottom &&
            point.x >= -this.hud.w / 2 + this.hud.safe.left + half &&
            point.x <= this.hud.w / 2 - this.hud.safe.right - half &&
            Math.hypot(
              Math.max(0, Math.abs(point.x - aim.x) - half),
              Math.max(0, Math.abs(point.y - aim.y) - 12),
            ) >= 40 &&
            !overBanner(point.x, point.y, half) &&
            [-half, 0, half].every((dx) =>
              [-12, 12].every(
                (dy) =>
                  !this.hud.blocksBattlefield(
                    point.x + dx + this.hud.w / 2,
                    this.hud.h / 2 - point.y + dy,
                  ),
              ),
            ),
        );
      l.node.active = !!tag;
      if (tag) {
        l.node.setPosition(tag.x, tag.y);
        placed.push(tag);
        this.hud.rect(
          graphics,
          tag.x + this.hud.w / 2 - half,
          this.hud.h / 2 - tag.y - 12,
          width,
          24,
          '#0c191fe8',
        );
      }
    }
    const projectedPoint = project(simulation.aim);
    if (!onScreen(projectedPoint, 18)) {
      this.hud.labels.get('target')!.node.active = false;
      this.hud.labels.get('flight')!.node.active = false;
      return;
    }
    graphics.strokeColor = col(
      simulation.reason() === 'protected' || simulation.friendlyRisk ? C.red : C.mint,
    );
    graphics.lineWidth = 1.5;
    groundRing(simulation.aim, simulation.effectiveRadius);
    for (const outline of [true, false]) {
      graphics.strokeColor = col(
        outline
          ? '#061116'
          : simulation.reason() === 'protected' || simulation.friendlyRisk
            ? C.red
            : C.white,
      );
      graphics.lineWidth = outline ? 6 : 3;
      for (const sign of [-1, 1]) {
        graphics.moveTo(projectedPoint.x + sign * 11, projectedPoint.y);
        graphics.lineTo(projectedPoint.x + sign * 32, projectedPoint.y);
        graphics.moveTo(projectedPoint.x, projectedPoint.y + sign * 11);
        graphics.lineTo(projectedPoint.x, projectedPoint.y + sign * 32);
      }
      graphics.stroke();
      graphics.circle(projectedPoint.x, projectedPoint.y, 3);
      graphics.stroke();
    }
    const target = simulation.aimedUnit;
    const recentImpacts = [...simulation.events]
      .reverse()
      .filter(
        (e) =>
          e.type === 'impact' &&
          (!simulation.duelMode || e.side === simulation.pilotSide) &&
          simulation.time - e.time < 1.1,
      );
    // A following round landing on a wreck must not erase the destruction confirmation.
    const impact =
      recentImpacts.find((e) => e.outcome === 'friendly') ||
      recentImpacts.find((e) => e.outcome === 'destroyed') ||
      recentImpacts[0];
    const outcome = impact?.outcome;
    const feedback =
      outcome === 'destroyed'
        ? this.hud.t('◆ 威胁已清除', '◆ THREAT ELIMINATED')
        : outcome === 'friendly'
          ? this.hud.t('！误伤友军', '! FRIENDLY HIT')
          : outcome === 'armor'
            ? this.hud.t('装甲低伤 · 换重炮', 'ARMOR · USE HEAVY')
            : outcome === 'hit'
              ? this.hud.t('命中目标', 'TARGET HIT')
              : outcome === 'miss'
                ? this.hud.t('未命中', 'MISS')
                : '';
    this.hud.set(
      'target',
      target?.friendly ? this.hud.t('友方目标 · 请勿射击', 'FRIENDLY · DO NOT FIRE') : feedback,
    );
    this.hud.labels.get('target')!.color = col(
      outcome === 'friendly' || target?.friendly ? C.red : outcome === 'miss' ? C.dim : C.amber,
    );
    // Both transient labels use the same avoidance rule; never clamp text onto the reticle.
    const placeFeedback = (label: Label, point: Point) => {
      const cursor = project(simulation.aim);
      for (const [dx, dy] of [
        [100, 0],
        [-100, 0],
        [0, -48],
        [0, 48],
        [100, -44],
        [-100, 44],
      ]) {
        const x = point.x + dx;
        const y = point.z + dy;
        if (x < -this.hud.w / 2 + 84 || x > this.hud.w / 2 - 84 || y < bottom + 12 || y > top - 24)
          continue;
        if (Math.abs(x - cursor.x) < 100 && Math.abs(y - cursor.y) < 34) continue;
        if (overBanner(x, y, 78)) continue;
        if (
          placed.some(
            (projectedPoint) =>
              Math.abs(x - projectedPoint.x) < 122 && Math.abs(y - projectedPoint.y) < 26,
          )
        )
          continue;
        if (
          simulation.units.some((u) => {
            const projectedPoint = project(u, 0.8);
            return (
              u.hp > 0 &&
              projectedPoint.visible &&
              Math.abs(x - projectedPoint.x) < 96 &&
              Math.abs(y - projectedPoint.y) < 30
            );
          })
        )
          continue;
        if (this.hud.blocksBattlefield(x + this.hud.w / 2, this.hud.h / 2 - y)) continue;
        label.node.setPosition(x, y);
        placed.push({ x, y });
        return true;
      }
      return false;
    };
    if (impact || target?.friendly) {
      const point = project(target?.friendly ? simulation.aim : impact!);
      const label = this.hud.labels.get('target')!;
      label.node.active = onScreen(point) && placeFeedback(label, { x: point.x, z: point.y });
    }
    if (impact && outcome !== 'miss' && simulation.time - impact.time < 0.22) {
      const point = project(impact);
      if (!onScreen(point, 12)) return;
      graphics.strokeColor = col(outcome === 'friendly' ? C.red : C.white);
      graphics.lineWidth = 2;
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          graphics.moveTo(point.x + x * 5, point.y + y * 5);
          graphics.lineTo(point.x + x * 10, point.y + y * 10);
        }
      graphics.stroke();
    }
    const next = simulation.selected > 0 ? simulation.shots.find((a) => a.weapon > 0) : undefined;
    const flight = this.hud.labels.get('flight')!;
    flight.string = next
      ? this.hud.t(
          `弹着 ${(next.due - simulation.time).toFixed(1)}s`,
          `IMPACT ${(next.due - simulation.time).toFixed(1)}s`,
        )
      : '';
    if (next) {
      const point = project(next);
      flight.node.active = onScreen(point) && placeFeedback(flight, { x: point.x, z: point.y });
    }
  }
}
