import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { worldAimPoint } from './scene-space.js';
import type { Battle } from './rules.js';
/** Bounded pools: no particle spawning in the frame loop. */
export class SiegeEffects {
  group = new T.Group();
  balls: T.Mesh[] = [];
  dust: T.Mesh[] = [];
  chips: T.Mesh[] = [];
  flash: T.Mesh;
  halo: T.Sprite;
  rays: T.Mesh[] = [];
  glow = new T.PointLight('#ffb34e', 0, 15, 2);
  private haloTexture: T.DataTexture;
  private event = { x: 0, y: 0, ammo: '', age: -1 };
  private impactTime = 0;
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
    for (let i = 0; i < 18; i++)
      this.chips.push(
        k.box(
          this.group,
          0,
          0,
          0,
          0.24 + (i % 3) * 0.14,
          0.18 + (i % 2) * 0.15,
          0.25 + (i % 4) * 0.09,
          '#c0ae88',
          0.08,
        ),
      );
    this.flash = k.sphere(this.group, 0, 0, 0, 0.75, '#ffd278');
    this.flash.material = new T.MeshBasicMaterial({ color: '#fff2ca', toneMapped: false });
    const vertices = this.flash.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        y = vertices.getY(i),
        z = vertices.getZ(i);
      const swell = 0.88 + Math.sin(x * 17 + y * 9) * Math.cos(z * 13 - y * 7) * 0.22;
      vertices.setXYZ(i, x * swell, y * swell, z * swell);
    }
    this.flash.geometry.computeVertexNormals();
    this.flash.material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vFireNormal;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvFireNormal=normalMatrix*normal;',
        );
      shader.fragmentShader =
        'varying vec3 vFireNormal;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb=mix(vec3(1.0,0.18,0.012),vec3(3.0,2.2,0.75),pow(abs(normalize(vFireNormal).z),2.0));',
        );
    };
    this.flash.castShadow = false;
    this.haloTexture = impactGlow();
    this.halo = new T.Sprite(
      new T.SpriteMaterial({
        map: this.haloTexture,
        color: '#ffad45',
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.group.add(this.halo);
    for (let i = 0; i < 22; i++) {
      const ray: T.Mesh = k.mesh(this.group, new T.ConeGeometry(0.038, 2, 4), '#ffd278', 0, 0, 0);
      ray.material = new T.MeshBasicMaterial({
        color: i % 2 ? '#ffd278' : '#fff2ca',
        toneMapped: false,
      });
      ray.castShadow = false;
      this.rays.push(ray);
    }
    this.group.add(this.glow);
  }
  metrics() {
    return {
      ...this.event,
      core: this.flash.visible,
      halo: this.halo.visible,
      flyingStone: this.chips.filter((m) => m.visible).length,
      smoke: this.dust.filter((m) => m.visible).length,
    };
  }
  dispose() {
    this.haloTexture.dispose();
    (this.halo.material as T.SpriteMaterial).dispose();
  }
  update(b: Battle, motion: boolean, origin: T.Vector3) {
    for (const m of [
      ...this.balls,
      ...this.dust,
      ...this.chips,
      ...this.rays,
      this.flash,
      this.halo,
    ])
      m.visible = false;
    this.glow.intensity = 0;
    const shot = b.shots.at(-1);
    if (!shot) {
      if (this.event.ammo && b.time >= this.impactTime) this.event.age = b.time - this.impactTime;
      else this.event = { x: 0, y: 0, ammo: '', age: -1 };
      return;
    }
    const p = worldAimPoint(shot, b);
    const age = -shot.remaining;
    this.event = { x: shot.x, y: shot.y, ammo: shot.ammo, age };
    this.impactTime = b.time - age;
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
    if (age < (blast ? 0.3 : 0.13)) {
      this.flash.visible = true;
      this.flash.position.copy(p).add(new T.Vector3(-0.2, 0.05, 0.7));
      this.flash.scale.setScalar((blast ? 1.25 : 0.55) * (1 - age / (blast ? 0.4 : 0.2)));
      this.halo.visible = true;
      this.halo.position.copy(p).add(new T.Vector3(-0.25, 0.1, 0.4));
      this.halo.scale.setScalar((blast ? 8 : 3.5) * (0.75 + age));
      (this.halo.material as T.SpriteMaterial).opacity = Math.max(
        0,
        1 - age / (blast ? 0.38 : 0.16),
      );
      this.glow.position.copy(p);
      this.glow.intensity = (blast ? 42 : 5) * Math.max(0, 1 - age / (blast ? 0.38 : 0.2));
      for (let i = 0; i < (blast ? 22 : 10); i++) {
        const ray = this.rays[i]!,
          a = i * 2.399;
        const direction = new T.Vector3(Math.sin(a), Math.cos(a), 0.3).normalize();
        ray.visible = age < (blast ? 0.22 : 0.1);
        ray.position.copy(p).addScaledVector(direction, 0.6 + age * (7 + (i % 5) * 2.4));
        ray.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
        ray.scale.set(
          0.8,
          (blast ? 0.45 : 0.25) * (0.5 + (i % 4) * 0.24) * Math.max(0.2, 1 - age * 3),
          0.8,
        );
      }
    }
    const count = motion ? (blast ? 9 : 3) : 2;
    for (let i = 0; i < count; i++) {
      const d = this.dust[i]!;
      d.visible = age > 0.04 && age < 0.8;
      d.position.set(
        p.x + Math.sin(i * 3.7) * ((blast ? 1.2 : 0.2) + age * (blast ? 4.5 : 1)),
        p.y + Math.cos(i * 3.7) * (blast ? 0.9 : 0.2) + age * 2.2,
        p.z + 0.4 + Math.cos(i * 3.7) * age * 3,
      );
      d.scale.setScalar((blast ? 0.55 : 0.23) + age * (blast ? 1.45 : 0.5));
      (d.material as T.MeshStandardMaterial).opacity = Math.max(0, (1 - age / 0.8) * 0.6);
    }
    if (motion)
      for (let i = 0; i < (blast ? 18 : 7); i++) {
        const chip = this.chips[i]!,
          a = i * 2.4;
        chip.visible = age < 0.9;
        chip.position.set(
          p.x + Math.sin(a) * age * (blast ? 15 : 7),
          p.y + age * (6 + (i % 4) * 3) - age * age * 14,
          p.z + Math.cos(a) * age * (blast ? 11 : 5),
        );
        chip.rotation.set(age * (i + 1), a + age, age * 2);
      }
  }
}
function impactGlow() {
  const size = 64,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1),
        i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.max(0, Math.exp(-r * r * 5) - Math.exp(-5)) * 190;
    }
  const texture = new T.DataTexture(data, size, size);
  texture.needsUpdate = true;
  texture.magFilter = texture.minFilter = T.LinearFilter;
  return texture;
}
