import Phaser from 'phaser';
import { C, TEAM, add, sub, mul, unit, rotate, clamp, type Vec } from './config';
import type { Simulation } from './simulation';
export class Render {
  g: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[] = [];
  debug = false;
  center = { x: 480, y: 370 }; zoom = 1;
  constructor(public scene: Phaser.Scene, public s: Simulation) {
    this.g = scene.add.graphics();
  }
  line(a: Vec, b: Vec, color: number, width = 3, alpha = 1) { this.g.lineStyle(width, color, alpha).lineBetween(a.x, a.y, b.x, b.y); }
  disk(p: Vec, radius: number, color: number, alpha = 1) { this.g.fillStyle(color, alpha).fillCircle(p.x, p.y, radius); }
  label(text: string, x: number, y: number, size = 14, color = '#284b4d') {
    const i = this.usedLabels++; let label = this.labels[i];
    if (!label) { label = this.scene.add.text(0, 0, '', { fontFamily: '"Microsoft YaHei", sans-serif', fontSize: size, fontStyle: 'bold', color }).setOrigin(0.5); this.labels.push(label); }
    label.setPosition(x, y).setText(text).setFontSize(size).setColor(color).setVisible(true);
  }
  usedLabels = 0;
  camera(delta: number, instant = false) {
    const actors = this.s.actors.map(a => a.body.position), level = this.s.level;
    let minX = Math.min(...actors.map(a => a.x)) - 130, maxX = Math.max(...actors.map(a => a.x)) + 210;
    let minY = Math.min(...actors.map(a => a.y)) - 175, maxY = Math.max(...actors.map(a => a.y)) + 105;
    const next = level.anchors.filter(a => a.x >= Math.max(...actors.map(p => p.x)) - 80).sort((a, b) => a.x - b.x)[0];
    if (next && next.x < maxX + 150) { maxX = Math.max(maxX, next.x + 95); minY = Math.min(minY, next.y - 75); }
    maxX = Math.max(maxX, minX + 700); maxY = Math.max(maxY, minY + 440);
    const w = this.scene.scale.width, h = this.scene.scale.height;
    const zoom = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)), 0.18, 1.32);
    const x = clamp((maxX + minX) / 2, level.bounds.x + w / (2 * zoom), level.bounds.x + level.bounds.w - w / (2 * zoom));
    const y = (maxY + minY) / 2;
    const t = instant ? 1 : 1 - Math.exp(-Math.min(delta, 40) / 220);
    this.center.x += (x - this.center.x) * t; this.center.y += (y - this.center.y) * t; this.zoom += (zoom - this.zoom) * t;
    this.scene.cameras.main.setZoom(this.zoom).centerOn(this.center.x, this.center.y);
  }
  draw(delta: number) {
    this.camera(delta); const g = this.g, s = this.s, level = s.level;
    this.usedLabels = 0; g.clear();
    const cam = this.scene.cameras.main;
    // Original procedural scenery. All silhouettes are local; nothing is downloaded.
    const left = cam.worldView.x - 200, right = cam.worldView.right + 200;
    g.fillStyle(0xe9f3e2).fillRect(left, -900, right - left, 2100);
    this.disk({ x: 885, y: 125 }, 55, 0xffd685, 0.85);
    for (let i = -2; i < 12; i++) {
      const x = i * 240, y = 180 + (i % 3) * 48;
      g.fillStyle(0xc7ddd0, 0.7).fillTriangle(x - 180, 820, x + 80, y, x + 320, 820);
      g.fillStyle(0xafcdbd, 0.45).fillTriangle(x - 30, 850, x + 185, y + 120, x + 390, 850);
      g.fillStyle(0xffffff, 0.72).fillRoundedRect(x + 10, 92 + (i % 2) * 55, 80, 15, 7).fillCircle(x + 45, 88 + (i % 2) * 55, 18);
    }
    g.fillStyle(0x86b8ab, 0.27).fillRect(left, 650, right - left, 450);
    for (let i = -2; i < 16; i++) this.line({ x: i * 150, y: 686 }, { x: i * 150 + 90, y: 686 }, 0xf4f7e9, 2, 0.55);
    for (const p of level.platforms) {
      if (p.material === 'wood') {
        g.fillStyle(0x8a8060).fillRoundedRect(p.x,p.y,p.w,p.h,4);
        g.fillStyle(0xbaa47a).fillRoundedRect(p.x+3,p.y+3,p.w-6,p.h-6,3);
        for(let y=p.y+16;y<p.y+p.h;y+=24)this.line({x:p.x,y},{x:p.x+p.w,y},0xf1d8a0,4);
        continue;
      }
      g.save(); g.translateCanvas(p.x + p.w / 2, p.y + p.h / 2); if (p.angle) g.rotateCanvas(p.angle);
      g.fillStyle(0x648b7a).fillRoundedRect(-p.w / 2, -p.h / 2 + 8, p.w, p.h - 8, 12);
      g.fillStyle(0x8daf89).fillRoundedRect(-p.w / 2, -p.h / 2, p.w, 28, 9);
      g.fillStyle(0xd1df9c).fillRoundedRect(-p.w / 2, -p.h / 2, p.w, 9, 4);
      for (let i = 25; i < p.w; i += 49) { g.fillStyle(0x466e63, 0.22).fillRoundedRect(-p.w / 2 + i, -p.h / 2 + 43 + (i % 3) * 8, 24, 10, 4); }
      g.restore();
      for (let i = p.x + 32; i < p.x + p.w - 20; i += 94) {
        this.line({ x: i, y: p.y }, { x: i + 2, y: p.y - 11 }, 0x668b66, 2);
        this.line({ x: i + 2, y: p.y - 3 }, { x: i + 8, y: p.y - 8 }, 0x668b66, 2);
      }
    }
    if (level.checkpoint) {
      const z = level.checkpoint.zone, y = z.y + z.h - 5;
      g.fillStyle(s.checkpoint ? 0xdceda1 : 0xd5e4bb, 0.45).fillRoundedRect(z.x, z.y, z.w, z.h, 10);
      g.fillStyle(0xf6c583).fillTriangle(z.x + 36, y, z.x + 66, y - 52, z.x + 102, y);
      g.fillStyle(0x587b6b).fillTriangle(z.x + 59, y, z.x + 67, y - 34, z.x + 80, y);
      this.label(s.checkpoint ? '✓ 全员集合 · 已保存' : '中途营地 · 全员集合', z.x + z.w / 2, z.y + 15, 12);
    }
    const z = level.goal;
    g.fillStyle(0xe9efb5, 0.46).fillRoundedRect(z.x, z.y, z.w, z.h, 16);
    this.line({ x: z.x + z.w - 40, y: z.y + z.h }, { x: z.x + z.w - 40, y: z.y + 22 }, 0x315c57, 5);
    g.fillStyle(0xea9c68).fillTriangle(z.x + z.w - 39, z.y + 22, z.x + z.w + 8, z.y + 37, z.x + z.w - 39, z.y + 55);
    this.label('全员安全区', z.x + z.w / 2, z.y + 22, 15);
    this.label(`${s.actors.filter(c => s.safe(c, z)).length} / 3`, z.x + z.w / 2, z.y + 49, 24);
    for (const a of level.anchors) {
      const occupied = s.grips.occupied.has(a.id), candidate = s.actors.some(c => c.hands.some(h => h.candidate === a.id));
      if (a.kind === 'ring') {
        this.line({ x: a.x, y: a.y - 90 }, { x: a.x, y: a.y - 14 }, 0x698980, 3);
        g.lineStyle(5, occupied ? 0xf1a346 : 0xe0a73c).strokeCircle(a.x, a.y, 12);
      } else if (a.kind === 'bar') {
        this.line({ x: a.x - 46, y: a.y - 25 }, { x: a.x + 46, y: a.y - 25 }, 0x547e72, 6);
        this.line({ x: a.x, y: a.y - 25 }, a, 0x547e72, 3); g.lineStyle(5, 0xe0a73c).strokeCircle(a.x, a.y, 9);
      } else { g.lineStyle(5, 0xe0a73c).strokeRoundedRect(a.x - 11, a.y - 7, 22, 16, 6); }
      if (occupied || candidate) g.lineStyle(2, 0xfff8d0, 0.9).strokeCircle(a.x, a.y, 21);
      this.label(a.name, a.x, a.y - 38, 12);
    }
    for (const hazard of level.hazards) {
      for (let x = hazard.x; x < hazard.x + hazard.w; x += 20) g.fillStyle(0xe38165).fillTriangle(x, hazard.y + hazard.h, x + 10, hazard.y, x + 20, hazard.y + hazard.h);
    }
    for (const grip of s.grips.connections.values()) this.line(s.p.hand(grip.a), grip.b ? s.p.hand(grip.b) : grip.anchor!, 0xffd66e, 7);
    for (const c of s.actors) {
      const t = TEAM[c.id], p = c.body.position, selected = c.id === s.selected;
      const local = (x: number, y: number) => s.p.point(c.body, { x, y });
      // Match the compound's actual parts (head index 2, feet supplied by the model).
      const head = c.body.parts[2].position, hip = local(0, 5);
      if (selected) {
        for (const [a, b] of [[local(0, -14), hip], ...c.feet.map(f => [hip, f.position])]) this.line(a, b, 0xffffff, 22, 0.96);
        g.lineStyle(3, 0xffffff).strokeCircle(head.x, head.y, 15);
      }
      for (const h of c.hands) {
        const shoulder = s.p.shoulder(c, h.side), hand = s.p.hand(h);
        this.line(shoulder, hand, 0x284b4d, 12); this.line(shoulder, hand, t.color, 8);
        this.disk(hand, h.grip ? 7 : 6, h.grip ? 0xffd366 : 0xffdfb7);
        g.lineStyle(1.5, 0x284b4d).strokeCircle(hand.x, hand.y, h.grip ? 7 : 6);
        if (h.grip) this.line(add(hand, { x: -3, y: 0 }), add(hand, { x: 3, y: 0 }), 0x8a642e, 2);
      }
      for (const foot of c.feet) { this.line(hip, foot.position, 0x284b4d, 11); this.line(hip, foot.position, t.color, 7); this.disk(foot.position, 6.5, 0x284b4d); }
      this.line(local(0, -13), hip, 0x284b4d, 28); this.line(local(0, -12), hip, t.color, 23);
      this.line(local(-10, 1), local(10, 1), 0xffe3b1, 4);
      this.disk(head, 12.5, 0x284b4d); this.disk(head, 10.5, 0xffddb5);
      const eye = add(head, rotate({ x: c.facing * 4, y: -1 }, c.body.angle)); this.disk(eye, 1.8, 0x284b4d);
      this.line(add(head, rotate({ x: -10, y: -7 }, c.body.angle)), add(head, rotate({ x: 9, y: -7 }, c.body.angle)), t.color, 6);
      this.label(String(c.id + 1), p.x, p.y - 8, 13, '#ffffff');
      if (selected) {
        const y = head.y - 32;
        g.fillStyle(0x254f50).fillTriangle(head.x - 6, y - 7, head.x + 6, y - 7, head.x, y);
        this.label(`${t.badge} ${t.name}`, head.x, y - 20, 13);
        if (s.charge) {
          const from = add(p, mul(s.charge.direction, 45)), to = add(p, mul(s.charge.direction, 65 + 35 * s.power));
          this.line(from, to, 0xef9c42, 5); const d = unit(sub(to, from)), n = { x: -d.y, y: d.x };
          g.fillStyle(0xef9c42).fillTriangle(to.x, to.y, to.x - d.x * 13 + n.x * 7, to.y - d.y * 13 + n.y * 7, to.x - d.x * 13 - n.x * 7, to.y - d.y * 13 - n.y * 7);
        }
      }
    }
    if (this.debug) this.drawDebug();
    for (let i = this.usedLabels; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }
  drawDebug() {
    const s = this.s, g = this.g;
    for (const b of s.p.M.Composite.allBodies(s.p.engine.world)) for (const part of b.parts.length > 1 ? b.parts.slice(1) : [b]) {
      g.lineStyle(1, 0xc72e82, 0.75).strokePoints(part.vertices ?? [], true);
    }
    for (const c of s.actors) {
      for (const h of c.hands) { const p = s.p.hand(h); g.lineStyle(1, 0x266aff).strokeCircle(p.x, p.y, C.gripRadius); this.label(h.grip ? '抓牢' : h.rejection, p.x, p.y + 22, 9, '#8c2953'); }
      for (const contact of c.contacts) this.disk(contact, 4, 0x00bb63);
      this.line(c.body.position, add(c.body.position, mul(c.body.velocity, 8)), 0xea3773, 2);
      this.label(`v=${c.body.speed.toFixed(1)}`, c.body.position.x, c.body.position.y + 58, 10);
    }
    for (const grip of s.grips.graph(s.selected).path) this.line(s.p.hand(grip.a), grip.b ? s.p.hand(grip.b) : grip.anchor!, 0x04b884, 3);
    for (const joint of s.p.M.Composite.allConstraints(s.p.engine.world)) {
      const a = joint.bodyA ? add(joint.bodyA.position, joint.pointA) : joint.pointA, b = joint.bodyB ? add(joint.bodyB.position, joint.pointB) : joint.pointB;
      this.line(a, b, 0xe84b82, 1, 0.6);
    }
  }
}
