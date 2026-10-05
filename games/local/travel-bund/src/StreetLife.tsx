import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import { createVisitor } from './physics';
import * as THREE from 'three';
import { smoothTreeInstances } from './render-budget';
import { input, type V3, type WorldData } from './world';
import {
  kioskPoint,
  lifeBlocks,
  localPoint,
  nearbyLife,
  visitorPose,
  type LifeBlock,
  type LifeEvent,
  type LifeTarget,
} from './life';

type Props = {
  data: WorldData;
  crowd: boolean;
  motion: boolean;
  event: LifeEvent | null;
  onTarget: (target: LifeTarget | null) => void;
};
const colour = new THREE.Color();

function LifeInstances({
  blocks,
  crowd,
  motion,
  event,
  onTarget,
}: Omit<Props, 'data'> & { blocks: LifeBlock[] }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}life/street-life.glb`, `${import.meta.env.BASE_URL}draco/`);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const bodies = useRef(new Map<string, ReturnType<typeof createVisitor>>());
  const poses = useRef(new Map<string, V3>());
  // Dispose our bodies before Physics frees the WASM world in its passive cleanup.
  useLayoutEffect(() => {
    if (!crowd) return;
    const created = new Map<string, ReturnType<typeof createVisitor>>();
    for (const block of blocks) for (let i = 0; i < 3; i++) {
      const id = `${block.id}/visitor/${i}`;
      const p = visitorPose(block, i, clocks.current.get(id) || 0).position;
      poses.current.set(id, p);
      created.set(id, createVisitor({world, rapier}, p, i === 1 ? .93 : 1));
    }
    bodies.current = created;
    return () => {
      bodies.current = new Map();
      for (const body of created.values()) world.removeRigidBody(body);
    };
  }, [world, rapier, blocks, crowd]);
  useBeforePhysicsStep(() => {
    for (const [id, body] of bodies.current) {
      const p = poses.current.get(id)!;
      body.setNextKinematicTranslation({x:p[0],y:p[1]+.83*(id.endsWith('/1') ? .93 : 1),z:p[2]});
    }
  });
  const trees = useMemo(
    () =>
      smoothTreeInstances(
        blocks.map((b) => ({
          position: localPoint(b, 5.8, 2.3),
          yaw: b.yaw,
          scale: [0.5, 0.5, 0.5],
        })),
        'balanced',
      ),
    [blocks],
  );
  useEffect(
    () => () => {
      trees.forEach((tree) => tree.dispose());
      new Set(trees.map((tree) => tree.geometry)).forEach((g) => g.dispose());
      new Set(trees.map((tree) => tree.material as THREE.Material)).forEach((m) => m.dispose());
    },
    [trees],
  );
  const contact = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!,
      gradient = context.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(30,49,45,.28)');
    gradient.addColorStop(1, 'rgba(30,49,45,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      blocks.length * 6,
    );
    mesh.renderOrder = 1;
    return { mesh, texture };
  }, [blocks]);
  const clocks = useRef(new Map<string, number>()),
    responses = useRef(new Map<string, number>()),
    serial = useRef(-1),
    elapsed = useRef(0),
    sample = useRef(0);
  const library = useMemo(() => {
    const map = new Map<string, THREE.Mesh>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) map.set(o.name, o);
    });
    return map;
  }, [scene]);
  const instances = useMemo(() => {
    const result = new Map<string, THREE.InstancedMesh>();
    for (const [name, original] of library) {
      const count = name.startsWith('visitor')
        ? blocks.length * 3
        : name.startsWith('pigeon')
          ? blocks.length * 3
          : blocks.length * (name === 'flowers' ? 2 : 1);
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
      if (name === 'banner')
        material.onBeforeCompile = (shader) => {
          shader.uniforms.bundWind = { value: 0 };
          material.userData.wind = shader.uniforms.bundWind;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float bundWind;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\ntransformed.z += sin(position.y*5.+bundWind*1.9)*.07*smoothstep(.10,.4,position.x);',
            );
        };
      const mesh = new THREE.InstancedMesh(original.geometry, material, count);
      mesh.name = name;
      if (name.startsWith('visitor'))
        for (let i = 0; i < count; i++)
          mesh.setColorAt(i, colour.set(['#ffffff', '#b0d5d1', '#f4d5b5'][i % 3]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      result.set(name, mesh);
    }
    return result;
  }, [library, blocks]);
  const scratch = useMemo(
    () => ({
      root: new THREE.Matrix4(),
      joint: new THREE.Matrix4(),
      rotation: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      xAxis: new THREE.Vector3(1, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      position: new THREE.Vector3(),
      project: new THREE.Vector3(),
    }),
    [],
  );
  const sign = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff0cf';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#294d55';
    ctx.font = 'bold 56px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('江风小站', 256, 68);
    ctx.font = '20px sans-serif';
    ctx.fillText('一杯清凉 · 一张风景', 256, 105);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(
    () => () => {
      for (const mesh of instances.values()) {
        mesh.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
    [instances],
  );
  useEffect(() => () => sign.dispose(), [sign]);
  useEffect(
    () => () => {
      contact.mesh.dispose();
      contact.mesh.geometry.dispose();
      (contact.mesh.material as THREE.Material).dispose();
      contact.texture.dispose();
    },
    [contact],
  );
  useEffect(() => () => onTarget(null), [onTarget]);
  useEffect(() => {
    if (!window.SmallGamesDev.isEnabled()) return;
    return window.SmallGamesDev.registerSnapshot(() => {
      const parts = (name: string) => {
        const mesh = instances.get(name)!;
        return Array.from({ length: mesh.count }, (_, i) => ({
          id: `${blocks[Math.floor(i / 3)].id}/${name.startsWith('visitor') ? 'visitor' : 'pigeon'}/${i % 3}`,
          matrix: Array.from(mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16)),
        }));
      };
      return {
        streetLife: {
          blocks: blocks.map((b) => ({ id: b.id, kiosk: b.kiosk, position: kioskPoint(b) })),
          time: elapsed.current,
          camera: {
            position: camera.position.toArray(),
            yaw: camera.rotation.y,
            pitch: camera.rotation.x,
          },
          visitors: parts('visitor-body'),
          arms: parts('visitor-arm-right'),
          pigeons: parts('pigeon-body'),
          colliders: [...bodies.current].map(([id,body]) => ({id, position: body.translation()})),
        },
      };
    });
  }, [instances, blocks, camera]);
  useFrame(({ camera }, delta) => {
    const dt = input.active ? Math.min(delta, 0.08) : 0;
    elapsed.current += dt;
    const time = elapsed.current;
    if (event && serial.current !== event.serial) {
      serial.current = event.serial;
      responses.current.set(event.id, time + 3.2);
    }
    const candidates: LifeTarget[] = [];
    const shadow = (index: number, p: V3, x: number, z: number) => {
      scratch.position.set(p[0], p[1] + 0.018, p[2]);
      scratch.rotation.setFromAxisAngle(scratch.xAxis, -Math.PI / 2);
      scratch.scale.set(x, z, 1);
      scratch.root.compose(scratch.position, scratch.rotation, scratch.scale);
      contact.mesh.setMatrixAt(index, scratch.root);
    };
    const write = (
      name: string,
      index: number,
      position: V3,
      yaw: number,
      scale = 1,
      rx = 0,
      rz = 0,
    ) => {
      const mesh = instances.get(name)!,
        original = library.get(name)!;
      scratch.position.set(...position);
      scratch.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      scratch.scale.setScalar(scale);
      scratch.root.compose(scratch.position, scratch.rotation, scratch.scale);
      scratch.joint.makeRotationFromEuler(scratch.euler.set(rx, 0, rz));
      scratch.joint.setPosition(original.position);
      mesh.setMatrixAt(index, scratch.root.multiply(scratch.joint));
    };
    const offer = (id: string, kind: LifeTarget['kind'], name: string, p: V3, height: number) => {
      const distance = camera.position.distanceTo(scratch.project.set(...p));
      if (distance > 9) return;
      scratch.project.set(p[0], p[1] + height, p[2]).project(camera);
      if (
        scratch.project.z < 0 ||
        scratch.project.z > 1 ||
        Math.abs(scratch.project.x) > 0.9 ||
        Math.abs(scratch.project.y) > 0.8
      )
        return;
      candidates.push({
        id,
        kind,
        name,
        position: p,
        screen: [(scratch.project.x + 1) * 50, (1 - scratch.project.y) * 50],
      });
    };
    blocks.forEach((block, bi) => {
      for (let i = 0; i < 3; i++) {
        const id = `${block.id}/visitor/${i}`;
        const old = clocks.current.get(id) || 0;
        const pose = visitorPose(block, i, old);
        const waving = (responses.current.get(id) || 0) > time;
        const near =
          Math.hypot(camera.position.x - pose.position[0], camera.position.z - pose.position[2]) <
          1.25;
        const clock = old + (motion && !waving && !near ? dt : 0);
        clocks.current.set(id, clock);
        const p = visitorPose(block, i, clock),
          stride = motion && !near && !waving ? p.stride : 0;
        poses.current.set(id, p.position);
        const yaw =
          waving || i === 2
            ? Math.atan2(camera.position.x - p.position[0], camera.position.z - p.position[2])
            : p.yaw;
        const size = crowd ? (i === 1 ? 0.93 : 1) : 0;
        shadow(bi * 6 + i, p.position, crowd ? 0.75 : 0, crowd ? 0.62 : 0);
        for (const name of [
          'visitor-body',
          'visitor-arm-left',
          'visitor-arm-right',
          'visitor-leg-left',
          'visitor-leg-right',
        ]) {
          const swing = name.endsWith('left') ? stride : -stride;
          write(
            name,
            bi * 3 + i,
            p.position,
            yaw,
            size,
            name === 'visitor-body' ? 0 : swing,
            name === 'visitor-arm-right' && waving
              ? 2.4 + (motion ? Math.sin(time * 12) * 0.15 : 0)
              : 0,
          );
        }
        if (crowd) offer(id, 'visitor', '打个招呼', p.position, 1.7);
      }
      const cart = kioskPoint(block);
      write('kiosk', bi, cart, block.yaw, block.kiosk ? 1 : 0);
      shadow(bi * 6 + 3, cart, block.kiosk ? 2.4 : 0, block.kiosk ? 1.5 : 0);
      if (block.kiosk) offer(`${block.id}/kiosk`, 'kiosk', '江风小站', cart, 2.3);
      for (let i = 0; i < 2; i++) {
        const p = localPoint(block, i === 0 ? -4.6 : 4.6, -2.25);
        write('flowers', bi * 2 + i, p, block.yaw);
        shadow(bi * 6 + 4 + i, p, 1.2, 0.85);
      }
      write('banner', bi, localPoint(block, -4.7, 1.3), block.yaw);
      for (let i = 0; i < 3; i++) {
        const id = `${block.id}/pigeon/${i}`,
          response = responses.current.get(id) || 0;
        const flight = motion ? Math.max(0, Math.min(3.2, response - time)) : 0;
        const p = localPoint(block, -1 + i * 0.6, 0.4 + i * 0.7);
        p[1] +=
          flight > 0
            ? Math.sin(((3.2 - flight) / 3.2) * Math.PI) * 1.7
            : motion
              ? Math.max(0, Math.sin(time * 2.2 + i * 3)) * 0.025
              : 0;
        const yaw = block.yaw + (motion ? Math.sin(time * 0.4 + i) * 0.35 : 0);
        write('pigeon-body', bi * 3 + i, p, yaw, crowd ? 1 : 0);
        for (const side of ['left', 'right'])
          write(
            `pigeon-wing-${side}`,
            bi * 3 + i,
            p,
            yaw,
            crowd ? 1 : 0,
            0,
            flight > 0 ? Math.sin(time * 23) * (side === 'left' ? 1 : -1) : 0,
          );
        if (crowd) offer(id, 'pigeon', '看看小鸽子', p, 0.65);
      }
    });
    for (const [name, mesh] of instances) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (name === 'banner' && material.userData.wind)
        material.userData.wind.value = motion ? time : 0;
    }
    contact.mesh.instanceMatrix.needsUpdate = true;
    contact.mesh.computeBoundingSphere();
    sample.current += delta;
    if (sample.current > 0.25) {
      sample.current = 0;
      candidates.sort(
        (a, b) =>
          Math.hypot(a.screen[0] - 50, a.screen[1] - 50) -
          Math.hypot(b.screen[0] - 50, b.screen[1] - 50),
      );
      onTarget(input.active ? candidates[0] || null : null);
    }
  });
  return (
    <group>
      {[...instances].map(([name, mesh]) => (
        <primitive key={name} object={mesh} />
      ))}
      {trees.map((tree, i) => (
        <primitive key={`planter-${i}`} object={tree} />
      ))}
      <primitive object={contact.mesh} />
      {blocks
        .filter((b) => b.kiosk)
        .map((b) => {
          const p = kioskPoint(b);
          return (
            <group key={b.id} position={p} rotation={[0, b.yaw, 0]}>
              <mesh position={[0, 2.24, 0.19]}>
                <planeGeometry args={[1.9, 0.29]} />
                <meshBasicMaterial map={sign} toneMapped={false} />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

export function StreetLife(props: Props) {
  const blocks = useMemo(() => lifeBlocks(props.data), [props.data]);
  const [visible, setVisible] = useState<LifeBlock[]>([]);
  const timer = useRef(1),
    signature = useRef('');
  useFrame(({ camera }, dt) => {
    timer.current += dt;
    if (timer.current < 0.4) return;
    timer.current = 0;
    const next = nearbyLife(blocks, [camera.position.x, camera.position.y, camera.position.z]);
    const key = next.map((b) => b.id).join(',');
    if (key === signature.current) return;
    signature.current = key;
    setVisible(next);
  });
  return visible.length > 0 ? <LifeInstances {...props} blocks={visible} /> : null;
}

export function RiverWeather({ night, motion }: { night: boolean; motion: boolean }) {
  const clouds = useRef<THREE.InstancedMesh>(null),
    birds = useRef<THREE.InstancedMesh>(null),
    time = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ camera }, dt) => {
    if (input.active && motion) time.current += Math.min(dt, 0.1);
    if (clouds.current)
      for (let i = 0; i < 32; i++) {
        const cluster = Math.floor(i / 4),
          p = i % 4,
          a = (cluster * Math.PI) / 4;
        dummy.position.set(
          camera.position.x + Math.cos(a) * 900 + Math.sin(time.current * 0.012) * 35 + p * 55,
          190 + (cluster % 3) * 35 + (p % 2) * 12,
          camera.position.z + Math.sin(a) * 900,
        );
        dummy.scale.set(70 + p * 12, 40 + p * 8, 45 + p * 4);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        clouds.current.setMatrixAt(i, dummy.matrix);
      }
    if (clouds.current) {
      clouds.current.instanceMatrix.needsUpdate = true;
      clouds.current.computeBoundingSphere();
    }
    if (birds.current)
      for (let i = 0; i < 12; i++) {
        const a = time.current * 0.06 + Math.floor(i / 2) * 0.32;
        dummy.position.set(
          camera.position.x + Math.sin(a) * 65,
          12 + Math.floor(i / 2) * 1.2,
          camera.position.z + Math.cos(a) * 65,
        );
        dummy.scale.set(0.5, 0.025, 0.15);
        dummy.rotation.set(0, a, (i % 2 ? 1 : -1) * Math.sin(time.current * 4) * 0.5);
        dummy.updateMatrix();
        birds.current.setMatrixAt(i, dummy.matrix);
      }
    if (birds.current) {
      birds.current.instanceMatrix.needsUpdate = true;
      birds.current.computeBoundingSphere();
    }
  });
  return (
    <>
      <instancedMesh ref={clouds} args={[undefined, undefined, 32]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial color={night ? '#617589' : '#f4fcff'} fog={false} />
      </instancedMesh>
      <instancedMesh ref={birds} args={[undefined, undefined, 12]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={night ? '#99abb0' : '#527477'} />
      </instancedMesh>
    </>
  );
}
