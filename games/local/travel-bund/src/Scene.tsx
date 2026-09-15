import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Sky } from '@react-three/drei';
import { Physics, useBeforePhysicsStep, useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky as EnvironmentSky } from 'three/addons/objects/Sky.js';
import {
  input,
  movement,
  onWater,
  destinations,
  type V3,
  type WorldData,
  type Placement,
} from './world';
import { footstep, spatialAudio } from './audio';
import { createGround, createWalker, createCar, walk, canOccupy } from './physics';

const url = (name: string) => `${import.meta.env.BASE_URL}world/${name}.glb`;
const decoder = `${import.meta.env.BASE_URL}draco/`;
export type Teleport = { position: V3; yaw: number; serial: number };
export type Telemetry = {
  position: V3;
  yaw: number;
  speed: number;
  grounded: boolean;
  calls: number;
  triangles: number;
  fps: number;
};
type Props = {
  data: WorldData;
  night: boolean;
  active: boolean;
  teleport: Teleport;
  onReady: () => void;
  onTelemetry: (t: Telemetry) => void;
  quality: number;
};

function surfaceMaterial(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return;
  m.envMapIntensity = 0.65;
  if (/pav|stone|trim|brick/i.test(m.name)) m.roughness = 0.85;
  if (!/glass|window/i.test(m.name) || /lamp/i.test(m.name)) return;
  // Facade panes share glass materials. Light individual rooms, never the entire glass shell.
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBundWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 bundPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
bundPosition=instanceMatrix*bundPosition;
#endif
vBundWorld=(modelMatrix*bundPosition).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBundWorld;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec2 pane=vec2((vBundWorld.x+vBundWorld.z)/2.8,vBundWorld.y/3.6);
vec2 cell=floor(pane), edge=abs(fract(pane)-.5), aa=max(fwidth(pane),vec2(.001));
float lit=step(.76,fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453));
vec2 mask=1.-smoothstep(vec2(.33)-aa,vec2(.33)+aa,edge);
float fade=1.-smoothstep(.4,1.4,max(aa.x,aa.y));
totalEmissiveRadiance *= mix(.045,lit*mask.x*mask.y,fade);`,
      );
  };
}
function CityTile({
  name,
  night,
  loaded,
}: {
  name: string;
  night: boolean;
  loaded: (name: string) => void;
}) {
  const { scene } = useGLTF(url(name), decoder);
  const materials = useMemo(() => {
    const set = new Set<THREE.MeshStandardMaterial>();
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        surfaceMaterial(m);
        set.add(m);
      }
    });
    return [...set];
  }, [scene]);
  useEffect(() => {
    loaded(name);
  }, [name, loaded]);
  useFrame((_, dt) => {
    for (const m of materials)
      if (/glass|gold|window/i.test(m.name)) {
        m.emissive.set('#ffca85');
        m.emissiveIntensity = THREE.MathUtils.damp(
          m.emissiveIntensity,
          night ? 0.65 : 0.025,
          2,
          input.active ? dt : 10,
        );
      }
  });
  return <primitive object={scene} />;
}
function StaticCity({ data, night }: { data: WorldData; night: boolean }) {
  const [requested, setRequested] = useState<string[]>([]);
  const loading = useRef(new Set<string>()),
    resident = useRef(new Set<string>());
  const timer = useRef(0);
  const loaded = useMemo(
    () => (name: string) => {
      loading.current.delete(name);
    },
    [],
  );
  const frustum = useMemo(() => new THREE.Frustum(), []);
  useFrame(({ camera }, dt) => {
    timer.current += dt;
    if (timer.current < 0.25 || loading.current.size >= 4) return;
    timer.current = 0;
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const visible = data.tiles
      .filter((tile) => {
        if (resident.current.has(tile.name)) return false;
        const sphere = new THREE.Sphere(new THREE.Vector3(...tile.center), tile.radius);
        return sphere.distanceToPoint(camera.position) < 180 || frustum.intersectsSphere(sphere);
      })
      .sort(
        (a, b) =>
          new THREE.Vector3(...a.center).distanceTo(camera.position) -
          new THREE.Vector3(...b.center).distanceTo(camera.position),
      );
    const next = visible.slice(0, 4 - loading.current.size).map((t) => t.name);
    if (!next.length) return;
    for (const name of next) {
      resident.current.add(name);
      loading.current.add(name);
    }
    setRequested((old) => [...old, ...next]);
  });
  return (
    <>
      {requested.map((name) => (
        <Suspense key={name} fallback={null}>
          <CityTile name={name} night={night} loaded={loaded} />
        </Suspense>
      ))}
    </>
  );
}
function Furniture({
  name,
  placements,
  night,
  live,
}: {
  live?: React.RefObject<Placement[]>;
  name: string;
  placements: Placement[];
  night: boolean;
}) {
  const { scene } = useGLTF(url(name), decoder);
  const objects = useMemo(() => {
    const result: THREE.InstancedMesh[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials = (Array.isArray(o.material) ? o.material : [o.material]).map((m) =>
        m.clone(),
      );
      materials.forEach(surfaceMaterial);
      const mesh = new THREE.InstancedMesh(
        o.geometry,
        Array.isArray(o.material) ? materials : materials[0],
        placements.length,
      );
      mesh.castShadow = name !== 'plane-tree-planter';
      mesh.receiveShadow = true;
      placements.forEach((p, i) => {
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...p.position),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
          new THREE.Vector3(...p.scale),
        );
        mesh.setMatrixAt(i, matrix.multiply(o.matrixWorld));
      });
      mesh.computeBoundingSphere();
      result.push(mesh);
    });
    return result;
  }, [scene, name, placements]);
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    if (input.active) elapsed.current += Math.min(dt, 0.1);
    for (const mesh of objects) {
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = mat as THREE.MeshStandardMaterial;
        if (/lamp/i.test(m.name)) {
          m.emissive.set('#ffbf69');
          m.emissiveIntensity = THREE.MathUtils.damp(
            m.emissiveIntensity,
            night ? 1.5 : 0.02,
            2,
            input.active ? dt : 10,
          );
        }
      }
      if (name === 'huangpu-cruise-boat' || live) {
        // ponytail: scenic boats follow short looping courses; use authored routes for boarding.
        placements.forEach((original, i) => {
          const p = live?.current[i] || original;
          const boat = name === 'huangpu-cruise-boat',
            t = elapsed.current * (boat ? 0.035 : 0.08) + i;
          const distance = boat ? Math.sin(t) * 35 : 0;
          const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(
              p.position[0] + distance * Math.cos(p.yaw),
              p.position[1] + (boat ? Math.sin(t * 5) * 0.09 : 0),
              p.position[2] - distance * Math.sin(p.yaw),
            ),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              p.yaw + (boat && Math.cos(t) < 0 ? Math.PI : 0),
            ),
            new THREE.Vector3(...p.scale),
          );
          mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  });
  useEffect(
    () => () => {
      for (const mesh of objects) {
        mesh.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }
    },
    [objects],
  );
  return (
    <group>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </group>
  );
}
function Traffic({ placements, night }: { placements: Placement[]; night: boolean }) {
  const { world, rapier } = useRapier();
  const { camera } = useThree();
  const live = useRef(placements.map((p) => ({ ...p })));
  const bodies = useRef<ReturnType<typeof world.createRigidBody>[]>([]);
  const clocks = useRef(placements.map(() => 0));
  useEffect(() => {
    bodies.current = placements.map((p) => createCar({ world, rapier }, p));
    return () => {
      bodies.current.forEach((body) => world.removeRigidBody(body));
      bodies.current = [];
    };
  }, [world, rapier, placements]);
  useBeforePhysicsStep(() => {
    bodies.current.forEach((body, i) => {
      if (!input.active) return;
      const p = placements[i],
        current = body.translation();
      // Yield to pedestrians, including people standing on the roof.
      if (Math.hypot(camera.position.x - current.x, camera.position.z - current.z) < 4.5) return;
      // Peak cruising speed: 18 m × 0.4 rad/s = 7.2 m/s (about 26 km/h).
      clocks.current[i] += 0.4 / 60;
      const t = clocks.current[i],
        distance = Math.sin(t) * 18,
        yaw = p.yaw + (Math.cos(t) < 0 ? Math.PI : 0);
      body.setNextKinematicTranslation({
        x: p.position[0] + distance * Math.cos(p.yaw),
        y: p.position[1],
        z: p.position[2] - distance * Math.sin(p.yaw),
      });
      body.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    });
  });
  useFrame(() => {
    bodies.current.forEach((body, i) => {
      const p = body.translation(),
        q = body.rotation();
      live.current[i] = {
        position: [p.x, p.y, p.z],
        yaw: 2 * Math.atan2(q.y, q.w),
        scale: placements[i].scale,
      };
    });
  }, -1);
  return <Furniture name="city-car" placements={placements} night={night} live={live} />;
}
function River({ night, quality }: { night: boolean; quality: number }) {
  const { scene } = useGLTF(url('water'), decoder);
  const river = useMemo(() => {
    let geometry: THREE.BufferGeometry | undefined;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh)
        geometry = o.geometry
          .clone()
          .applyMatrix4(o.matrixWorld)
          .translate(0, -0.25, 0)
          .rotateX(Math.PI / 2);
    });
    const object = new Water(geometry!, {
      textureWidth: quality === 1 ? 1024 : 2048,
      textureHeight: quality === 1 ? 1024 : 2048,
      sunDirection: new THREE.Vector3(0.6, 0.18, -0.5).normalize(),
      sunColor: 0xffd4a0,
      waterColor: 0x315b61,
      distortionScale: 0.7,
      fog: true,
    });
    object.rotation.x = -Math.PI / 2;
    object.position.y = 0.25;
    // Continuous world-space waves: no tiled raster normal map or square sampling artifacts.
    object.material.fragmentShader = object.material.fragmentShader
      .replace(
        /vec4 getNoise\( vec2 uv \) \{[\s\S]*?\n\s*\}/,
        `vec4 getNoise(vec2 uv) {
      vec2 d=vec2(.73,.31)*cos(dot(uv,vec2(.73,.31))-time*1.2)
        +vec2(-.27,.51)*cos(dot(uv,vec2(-.27,.51))+time*.83)
        +vec2(.11,.19)*cos(dot(uv,vec2(.11,.19))-time*.43);
      return vec4(d*.075,1.,0.);
    }`,
      )
      .replace('float rf0 = 0.3;', 'float rf0 = 0.06;')
      .replace(
        'vec3 outgoingLight = albedo;',
        'vec3 outgoingLight = mix(waterColor*.65+diffuseLight*.12, reflectionSample*.72+waterColor*.16, min(reflectance,.65))+specularLight*.045;',
      );
    return { object };
  }, [scene, quality]);
  useFrame((_, dt) => {
    const u = river.object.material.uniforms;
    if (input.active) u.time.value += Math.min(dt, 0.1) * 0.5;
    u.sunColor.value.lerp(new THREE.Color(night ? '#99bad4' : '#ffd4a0'), Math.min(dt, 1));
  });
  useEffect(
    () => () => {
      river.object.geometry.dispose();
      river.object.material.dispose();
    },
    [river],
  );
  return <primitive object={river.object} />;
}
function Atmosphere({ night }: { night: boolean }) {
  const { scene, camera, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null),
    veil = useRef<THREE.MeshBasicMaterial>(null);
  const mix = useRef(0);
  useEffect(() => {
    const environment = new THREE.Scene(),
      sky = new EnvironmentSky();
    sky.scale.setScalar(10000);
    sky.material.uniforms.sunPosition.value.set(300, 65, -500);
    sky.material.uniforms.turbidity.value = 5;
    sky.material.uniforms.rayleigh.value = 1.3;
    if (night) environment.background = new THREE.Color('#35465b');
    else environment.add(sky);
    const generator = new THREE.PMREMGenerator(gl),
      target = generator.fromScene(environment, 0.04, 0.1, 20000);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
    };
  }, [scene, gl, night]);
  useFrame((_, dt) => {
    mix.current = input.active
      ? THREE.MathUtils.damp(mix.current, night ? 1 : 0, 1.5, dt)
      : Number(night);
    const c = new THREE.Color('#a4afb0').lerp(new THREE.Color('#26394e'), mix.current);
    if (!scene.fog) scene.fog = new THREE.Fog(c, 750, 4500);
    else scene.fog.color.copy(c);
    if (veil.current) veil.current.opacity = mix.current;
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(2.4, 0.65, mix.current);
      sun.current.position.set(camera.position.x + 70, 100, camera.position.z - 60);
      sun.current.target.position.copy(camera.position);
      sun.current.target.updateMatrixWorld();
    }
  });
  return (
    <>
      <Sky
        distance={9000}
        sunPosition={[300, 65, -500]}
        turbidity={5}
        rayleigh={1.3}
        mieCoefficient={0.008}
        mieDirectionalG={0.8}
      />
      <mesh renderOrder={-1}>
        <sphereGeometry args={[8500, 32, 16]} />
        <meshBasicMaterial
          ref={veil}
          color="#26394e"
          side={THREE.BackSide}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <hemisphereLight
        args={[night ? '#7594b9' : '#c9e1ec', night ? '#18212b' : '#c6b297', night ? 1.1 : 1.7]}
      />
      <directionalLight
        ref={sun}
        color={night ? '#adc8ee' : '#ffe1b3'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={240}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
    </>
  );
}

// Both the visible and physical approach ramps use these same transforms.
function bridgeRamps(data: WorldData) {
  const bridge = data.props['garden-bridge']?.[0];
  if (!bridge) return [];
  return [-1, 1].map((side) => {
    const distance = 14 * bridge.scale[0] + 10;
    return {
      position: [
        bridge.position[0] + Math.cos(bridge.yaw) * side * distance,
        1.45,
        bridge.position[2] - Math.sin(bridge.yaw) * side * distance,
      ] as V3,
      yaw: bridge.yaw,
      slope: -side * Math.atan2(2.9, 20),
      width: 18,
    };
  });
}
function Ground({ data }: { data: WorldData }) {
  const { scene } = useGLTF(url('terrain'), decoder);
  useMemo(() => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) surfaceMaterial(m);
      }
    });
  }, [scene]);
  return (
    <>
      <primitive object={scene} />
      {bridgeRamps(data).map((r, i) => (
        <group key={i} position={r.position} rotation={[0, r.yaw, 0]}>
          <mesh rotation={[0, 0, r.slope]} receiveShadow>
            <boxGeometry args={[20.22, 0.25, r.width]} />
            <meshStandardMaterial color="#a1a195" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}
function Controller({
  data,
  teleport,
  onReady,
  onTelemetry,
}: {
  data: WorldData;
  teleport: Teleport;
  onReady: () => void;
  onTelemetry: Props['onTelemetry'];
}) {
  const { world, rapier } = useRapier();
  const { camera, gl } = useThree();
  const runtime = useRef<ReturnType<typeof createWalker> | null>(null);
  const lastSafe = useRef<V3>(destinations[0].position);
  const serial = useRef(-1);
  const initialized = useRef(false);
  const stats = useRef({ time: 0, frames: 0 });
  useEffect(() => {
    const fixed = createGround({ world, rapier }, data);
    for (const r of bridgeRamps(data)) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.yaw, r.slope, 'YXZ'));
      world.createCollider(
        rapier.ColliderDesc.cuboid(10.11, 0.125, r.width / 2)
          .setTranslation(...r.position)
          .setRotation(q),
        fixed,
      );
    }
    const walker = createWalker({ world, rapier });
    const { body, collider, controller } = walker;
    runtime.current = walker;
    camera.rotation.order = 'YXZ';
    initialized.current = false;
    return () => {
      runtime.current = null;
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
      world.removeRigidBody(fixed);
    };
  }, [world, rapier, data, camera, onReady]);
  function placeSafe(position: V3, yaw: number) {
    const r = runtime.current;
    if (!r) return;
    for (let i = 0; i < 180; i++) {
      const radius = i === 0 ? 0 : Math.ceil(i / 12) * 2,
        angle = (i * Math.PI) / 6;
      const x = position[0] + Math.cos(angle) * radius,
        z = position[2] + Math.sin(angle) * radius;
      const hit = world.castRay(
        new rapier.Ray({ x, y: 25, z }, { x: 0, y: -1, z: 0 }),
        35,
        true,
        undefined,
        undefined,
        r.collider,
        r.body,
      );
      if (!hit) continue;
      const y = 25 - hit.timeOfImpact;
      if (y > 6 || y < -0.1 || (y < 0.7 && onWater(x, z, data.water))) continue;
      const pos = { x, y: y + 0.88, z };
      let blocked = false;
      world.intersectionsWithShape(
        pos,
        { x: 0, y: 0, z: 0, w: 1 },
        new rapier.Capsule(0.5, 0.29),
        () => {
          blocked = true;
          return false;
        },
        undefined,
        undefined,
        r.collider,
        r.body,
      );
      if (blocked) continue;
      r.body.setTranslation(pos, true);
      r.body.setNextKinematicTranslation(pos);
      r.velocity = 0;
      camera.position.set(x, y + 1.65, z);
      camera.rotation.set(0, yaw, 0);
      lastSafe.current = [x, y + 1, z];
      return;
    }
    r.body.setTranslation(
      { x: lastSafe.current[0], y: lastSafe.current[1], z: lastSafe.current[2] },
      true,
    );
  }
  useAfterPhysicsStep(() => {
    if (runtime.current && !initialized.current) {
      // Scene queries become valid after Rapier's first broad-phase update.
      placeSafe(teleport.position, teleport.yaw);
      serial.current = teleport.serial;
      initialized.current = true;
      onReady();
    }
  });
  useBeforePhysicsStep(() => {
    const r = runtime.current;
    if (!r || !initialized.current) return;
    if (serial.current !== teleport.serial) {
      placeSafe(teleport.position, teleport.yaw);
      serial.current = teleport.serial;
      return;
    }
    if (!input.active) {
      r.speed = 0;
      return;
    }
    const dt = 1 / 60;
    const x =
      Number(input.keys.has('KeyD') || input.keys.has('ArrowRight')) -
      Number(input.keys.has('KeyA') || input.keys.has('ArrowLeft')) +
      input.stick[0];
    const z =
      Number(input.keys.has('KeyS') || input.keys.has('ArrowDown')) -
      Number(input.keys.has('KeyW') || input.keys.has('ArrowUp')) +
      input.stick[1];
    const speed =
      input.boost || input.keys.has('KeyR')
        ? 12
        : input.fast || input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')
          ? 4
          : 1.9;
    const move = movement(
      input.sitting ? 0 : x,
      input.sitting ? 0 : z,
      camera.rotation.y,
      speed,
      dt,
    );
    const p = r.body.translation();
    const next = walk(r, move, input.jump && !input.sitting, dt);
    input.jump = false;
    if (!canOccupy(r, data, next)) {
      next.x = p.x;
      next.z = p.z;
    }
    r.speed = Math.hypot(next.x - p.x, next.z - p.z) / dt;
    r.body.setNextKinematicTranslation(next);
    if (r.ground && !onWater(next.x, next.z, data.water))
      lastSafe.current = [next.x, next.y, next.z];
    if (r.ground && r.speed > 0.2) footstep(r.speed);
  });
  useFrame((_, dt) => {
    const r = runtime.current;
    if (!r) return;
    if (input.active) {
      camera.rotation.y -= input.look[0] * 0.002 * input.sensitivity;
      camera.rotation.x = THREE.MathUtils.clamp(
        camera.rotation.x - input.look[1] * 0.002 * input.sensitivity,
        -1.35,
        1.35,
      );
    }
    input.look = [0, 0];
    const p = r.body.translation();
    camera.position.x = p.x;
    camera.position.z = p.z;
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      p.y + (input.sitting ? 0.25 : 0.82),
      15,
      Math.min(dt, 0.1),
    );
    stats.current.time += dt;
    stats.current.frames++;
    if (stats.current.time > 0.3) {
      if (input.active)
        spatialAudio(
          [p.x, p.y, p.z],
          camera.rotation.y,
          data.props['huangpu-cruise-boat'] || [],
          data.props['city-car'] || [],
        );
      onTelemetry({
        position: [p.x, p.y, p.z],
        yaw: camera.rotation.y,
        speed: r.speed,
        grounded: r.ground,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        fps: stats.current.frames / stats.current.time,
      });
      stats.current = { time: 0, frames: 0 };
    }
  });
  return null;
}
export function Scene(props: Props) {
  return (
    <>
      <Atmosphere night={props.night} />
      <StaticCity data={props.data} night={props.night} />
      <Ground data={props.data} />
      <River night={props.night} quality={props.quality} />
      {Object.entries(props.data.props).map(
        ([name, placements]) =>
          name !== 'city-car' && (
            <Suspense key={name} fallback={null}>
              <Furniture name={name} placements={placements} night={props.night} />
            </Suspense>
          ),
      )}
      <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]} paused={false} interpolate>
        <Suspense fallback={null}>
          <Traffic placements={props.data.props['city-car'] || []} night={props.night} />
        </Suspense>
        <Controller
          data={props.data}
          teleport={props.teleport}
          onReady={props.onReady}
          onTelemetry={props.onTelemetry}
        />
      </Physics>
    </>
  );
}
