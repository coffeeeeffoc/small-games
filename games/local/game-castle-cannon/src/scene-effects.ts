import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { moduleAimPoint } from './scene-space.js';
import type { Battle } from './rules.js';
/** Bounded pools: no particle spawning in the frame loop. */
export class SiegeEffects {
  group = new T.Group();
  balls: T.Mesh[] = [];
  dust: T.Mesh[] = [];
  chips: T.Mesh[] = [];
  flash: T.Mesh;
  glow = new T.PointLight('#ffb34e', 0, 8, 2);
  constructor(k: MeshKit) {
    for (let i = 0; i < 4; i++)
      this.balls.push(k.sphere(this.group, 0, 0, 0, 0.24, '#323c40', 0.6));
    for (let i = 0; i < 9; i++) {
      const m = k.sphere(this.group, 0, 0, 0, 0.7, '#a18e74');
      m.material = (m.material as T.MeshStandardMaterial).clone();
      (m.material as T.MeshStandardMaterial).transparent = true;
      (m.material as T.MeshStandardMaterial).depthWrite = false;
      m.castShadow = false;
      this.dust.push(m);
    }
    for (let i = 0; i < 18; i++) this.chips.push(k.rock(this.group, 0, 0, 0, 0.24, '#c0ae88'));
    this.flash = k.sphere(this.group, 0, 0, 0, 0.35, '#ffd278');
    this.flash.material = new T.MeshBasicMaterial({ color: '#ffb64c', transparent: true });
    this.group.add(this.glow);
  }
  update(b: Battle, motion: boolean, origin: T.Vector3) {
    for (const m of [...this.balls, ...this.dust, ...this.chips, this.flash]) m.visible = false;
    this.glow.intensity = 0;
    const shot = b.shots.at(-1);
    if (!shot) return;
    const target = b.modules.find((m) => Math.hypot(m.x - shot.x, m.y - shot.y) < 2);
    const p = target ? moduleAimPoint(target, b) : new T.Vector3(8, 1, 8);
    const age = -shot.remaining;
    if (age < 0) {
      const t = 1 - shot.remaining / 0.38,
        ball = this.balls[0]!;
      ball.visible = true;
      const material = ball.material as T.MeshStandardMaterial;
      material.color.set(shot.ammo === 'blast' ? '#d38a32' : '#323c40');
      material.emissive.set(shot.ammo === 'blast' ? '#bc4b0d' : '#000000');
      ball.position.lerpVectors(origin, p, t);
      ball.position.y += Math.sin(t * Math.PI) * 3;
      if (t < 0.25) {
        this.flash.visible = true;
        this.flash.position.copy(origin);
        this.flash.scale.setScalar(1 - t * 3);
      }
      return;
    }
    const blast = shot.ammo === 'blast';
    if (age < (blast ? 0.55 : 0.13)) {
      this.flash.visible = true;
      this.flash.position.copy(p);
      this.flash.scale.setScalar((blast ? 2.2 : 0.65) * (1 - age / (blast ? 0.7 : 0.2)));
      this.glow.position.copy(p);
      this.glow.intensity = (blast ? 12 : 2) * Math.max(0, 1 - age / (blast ? 0.7 : 0.35));
    }
    const count = motion ? (blast ? 9 : 3) : 2;
    for (let i = 0; i < count; i++) {
      const d = this.dust[i]!;
      d.visible = age < 0.8;
      d.position.set(
        p.x + Math.sin(i * 3.7) * age * (blast ? 3 : 1),
        p.y + i * 0.09 + age * 1.9,
        p.z + Math.cos(i * 3.7) * age * 2,
      );
      d.scale.setScalar((blast ? 0.7 : 0.23) + age * (blast ? 1.9 : 0.5));
      (d.material as T.MeshStandardMaterial).opacity = Math.max(0, (1 - age / 0.8) * 0.7);
    }
    if (motion)
      for (let i = 0; i < (blast ? 18 : 7); i++) {
        const chip = this.chips[i]!,
          a = i * 2.4;
        chip.visible = age < 0.75;
        chip.position.set(
          p.x + Math.sin(a) * age * 5,
          p.y + age * (3 + (i % 4)) - age * age * 12,
          p.z + Math.cos(a) * age * 4,
        );
        chip.rotation.set(age * (i + 1), a + age, age * 2);
      }
  }
}
