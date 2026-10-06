import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Physics, useBeforePhysicsStep, useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky as EnvironmentSky } from 'three/addons/objects/Sky.js';
import {
  input,
  movement,
  TRAVEL_SPEED,
  placementBatches,
  onRiver,
  quayWater,
  bridgeRamps,
  destinations,
  type V3,
  type WorldData,
  type Placement,
} from './world';
import { footstep, spatialAudio } from './audio';
import { createGround, createWalker, createCar, walk, canOccupy } from './physics';
import {
  compactCityScene,
  disposeCityRender,
  smoothRiverMaterial,
  smoothTreeInstances,
  granularSurface,
} from './render-budget';
import { RENDER_DETAILS, type RenderDetail } from './render-settings';
import { StreetLife, RiverWeather } from './StreetLife';
import type { LifeEvent, LifeTarget } from './life';
import { DEFAULT_FOV, zoomFov } from './camera-controls';
import { decorateFacade, facadeKind } from './facade-detail';
import type { PhotoPose } from './photo-hunts';

const url = (name: string) => `${import.meta.env.BASE_URL}world/${name}.glb`;
const decoder = `${import.meta.env.BASE_URL}draco/`;
export type Teleport = { position: V3; yaw: number; pitch?: number; serial: number };
export type Telemetry = {
  position: V3;
  yaw: number;
  pitch: number;
  speed: number;
  grounded: boolean;
  calls: number;
  triangles: number;
  fps: number;
};
export type Props = {
  data: WorldData;
  night: boolean;
  active: boolean;
  ready: boolean;
  teleport: Teleport;
  onReady: () => void;
  onTelemetry: (t: Telemetry) => void;
  onPhotoView?: (read: ((target?: V3) => PhotoPose) | null) => void;
  quality: number;
  renderDetail: RenderDetail;
  crowd: boolean;
  motion: boolean;
  zoom: number;
  lifeEvent: LifeEvent | null;
  onLifeTarget: (target: LifeTarget | null) => void;
};

function surfaceMaterial(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial;
  if (m.isMeshStandardMaterial || (material as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
    if (/Promenade paving/i.test(m.name)) granularSurface(m, 'granite');
    else if (/Road asphalt/i.test(m.name)) granularSurface(m, 'asphalt');
    else if (/Limestone|Carved stone|Sandstone|Bund window and stone/i.test(m.name))
      granularSurface(m, 'stone');
  }
  if (!m.isMeshStandardMaterial) return;
  if (!m.userData.bundGrain) m.envMapIntensity = 0.65;
  if (!m.userData.bundGrain && /pav|stone|trim|brick/i.test(m.name)) m.roughness = 0.85;
  if (m.userData.bundFacade || facadeKind(m) !== 2) return;
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
  renderDetail,
}: {
  name: string;
  night: boolean;
  loaded: (name: string) => void;
  renderDetail: RenderDetail;
}) {
  const asset = useGLTF(url(name), decoder);
  const render = useMemo(
    () =>
      name.startsWith('city_')
        ? compactCityScene(asset.scene, RENDER_DETAILS[renderDetail].buildingCellMetres)
        : { scene: asset.scene, owned: [], ownedMaterials: [] },
    [asset.scene, renderDetail, name],
  );
  const scene = render.scene;
  useEffect(() => () => disposeCityRender(render), [render]);
  const materials = useMemo(() => {
    const set = new Set<THREE.MeshStandardMaterial>();
    if (name.startsWith('city_')) {
      scene.userData.bundCityTile = name;
      scene.userData.bundCityBounds = new THREE.Box3().setFromObject(scene);
    }
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = name.startsWith('city_');
      o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        // Cached source materials retain their composed shader when presets change.
        if (!m.userData.bundFacadeDetail) surfaceMaterial(m);
        if (name.startsWith('city_')) decorateFacade(m);
        set.add(m);
      }
    });
    return [...set];
  }, [scene, name]);
  useEffect(() => {
    loaded(name);
  }, [name, loaded]);
  useFrame((_, dt) => {
    for (const m of materials)
      if (m.userData.bundFacade || facadeKind(m) === 2 || /gold/i.test(m.name)) {
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
function StaticCity({
  data,
  night,
  renderDetail,
}: {
  data: WorldData;
  night: boolean;
  renderDetail: RenderDetail;
}) {
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
        // Ground detail needs nearby tiles; distant buildings still form the skyline.
        return (
          sphere.distanceToPoint(camera.position) < 180 ||
          (!tile.name.startsWith('sidewalk_') && frustum.intersectsSphere(sphere))
        );
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
          <CityTile name={name} night={night} loaded={loaded} renderDetail={renderDetail} />
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
  const batches = useMemo(
    () => (live || name === 'huangpu-cruise-boat' ? [placements] : placementBatches(placements)),
    [placements, live, name],
  );
  const objects = useMemo(() => {
    const result: THREE.InstancedMesh[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const batch of batches) {
        const materials = (Array.isArray(o.material) ? o.material : [o.material]).map((m) =>
          m.clone(),
        );
        materials.forEach(surfaceMaterial);
        if (name === 'promenade-section' || name === 'promenade-open') {
          for (const m of materials as THREE.MeshStandardMaterial[]) if (/Carved stone/i.test(m.name)) {
            const previous = m.onBeforeCompile;
            m.onBeforeCompile = (shader,renderer) => {
              previous.call(m,shader,renderer);
              // Remove the old oversized painted grid; the granite now has fine real joints.
              shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
                '#include <color_fragment>\nif(vBundSurface.y < .934) discard;');
            };
            const key=m.customProgramCacheKey();m.customProgramCacheKey=()=>key+':deck-joints';
          }
        }
        const mesh = new THREE.InstancedMesh(
          o.geometry,
          Array.isArray(o.material) ? materials : materials[0],
          batch.length,
        );
        mesh.castShadow = name !== 'plane-tree-planter';
        mesh.receiveShadow = true;
        batch.forEach((p, i) => {
          const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(...p.position),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
            new THREE.Vector3(...p.scale),
          );
          mesh.setMatrixAt(i, matrix.multiply(o.matrixWorld));
        });
        mesh.computeBoundingSphere();
        result.push(mesh);
      }
    });
    return result;
  }, [scene, name, batches]);
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
  useLayoutEffect(() => {
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
function SmoothTrees({
  placements,
  detail,
}: {
  placements: Placement[];
  detail: Exclude<RenderDetail, 'original'>;
}) {
  const objects = useMemo(() => smoothTreeInstances(placements, detail), [placements, detail]);
  useEffect(
    () => () => {
      const geometries = new Set(objects.map((object) => object.geometry));
      const materials = new Set(objects.map((object) => object.material as THREE.Material));
      objects.forEach((object) => object.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
    [objects],
  );
  return (
    <group>
      {objects.map((object, index) => (
        <primitive key={index} object={object} />
      ))}
    </group>
  );
}
function River({ data, night, quality }: { data: WorldData; night: boolean; quality: number }) {
  const river = useMemo(() => {
    const points = [...data.water,...quayWater(data)].flatMap(t => {
      const [a,b,c]=t;
      const up=(b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1]);
      return (up>=0 ? t : [a,c,b]).flatMap(([x,z])=>[x,0,z]);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.computeVertexNormals(); geometry.rotateX(Math.PI/2);
    if (quality === 0) {
      const object = new THREE.Mesh(geometry!, smoothRiverMaterial());
      object.rotation.x = -Math.PI / 2;
      object.position.y = 0.25;
      return { object };
    }
    const object = new Water(geometry!, {
      textureWidth: quality === 0 ? 256 : quality === 1 ? 1024 : 2048,
      textureHeight: quality === 0 ? 256 : quality === 1 ? 1024 : 2048,
      sunDirection: new THREE.Vector3(0.6, 0.18, -0.5).normalize(),
      sunColor: 0xffd4a0,
      waterColor: 0x397c83,
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
  }, [data, quality]);
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
function Atmosphere({ night, quality }: { night: boolean; quality: number }) {
  const { scene, camera, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null),
    veil = useRef<THREE.MeshBasicMaterial>(null);
  const mix = useRef(0);
  useEffect(() => {
    const environment = new THREE.Scene(),
      sky = new EnvironmentSky();
    sky.scale.setScalar(10000);
    sky.material.uniforms.sunPosition.value.set(325, 240, -350);
    sky.material.uniforms.turbidity.value = 2.2;
    sky.material.uniforms.rayleigh.value = 1.6;
    if (night) environment.background = new THREE.Color('#35465b');
    else environment.add(sky);
    const generator = new THREE.PMREMGenerator(gl),
      target = generator.fromScene(environment, 0.04, 0.1, 20000);
    scene.environment = target.texture;
    const previousIntensity=scene.environmentIntensity;
    scene.environmentIntensity=.35;
    return () => {
      scene.environment = null;
      scene.environmentIntensity=previousIntensity;
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
    const c = new THREE.Color('#dfccb0').lerp(new THREE.Color('#26394e'), mix.current);
    if (!scene.fog) scene.fog = new THREE.Fog(c, 750, 4500);
    else scene.fog.color.copy(c);
    if (veil.current) veil.current.opacity = mix.current;
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(1.6, 0.65, mix.current);
      sun.current.position.set(camera.position.x + 65, 48, camera.position.z - 70);
      sun.current.target.position.copy(camera.position);
      sun.current.target.updateMatrixWorld();
    }
  });
  return (
    <>
      <mesh renderOrder={-2}>
        <sphereGeometry args={[8800, 24, 12]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
          uniforms={{
            horizon: { value: new THREE.Color('#e2cbaa') },
            zenith: { value: new THREE.Color('#779dad') },
          }}
          vertexShader="varying float height; void main(){height=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }"
          fragmentShader={`varying float height; uniform vec3 horizon; uniform vec3 zenith;
            void main(){
              gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-.08,.6,height)),1.);
              #include <colorspace_fragment>
            }`}
        />
      </mesh>
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
        args={[night ? '#7594b9' : '#bbc9d4', night ? '#18212b' : '#766c54', night ? 1.1 : .55]}
      />
      <directionalLight
        ref={sun}
        color={night ? '#adc8ee' : '#ffd2a0'}
        castShadow
        shadow-mapSize={quality === 0 ? [512,512] : [2048, 2048]}
        shadow-camera-left={quality === 0 ? -35 : -55}
        shadow-camera-right={quality === 0 ? 35 : 55}
        shadow-camera-top={quality === 0 ? 35 : 55}
        shadow-camera-bottom={quality === 0 ? -35 : -55}
        shadow-camera-near={1}
        shadow-camera-far={240}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
    </>
  );
}

function Ground({ data }: { data: WorldData }) {
  const { scene } = useGLTF(url('terrain'), decoder);
  const ramps=useMemo(()=>bridgeRamps(data).map(r=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(r.hull.flat(),3));
    geometry.setIndex([4,6,5,4,7,6, 0,1,2,0,2,3, 0,4,5,0,5,1,
      1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0]);
    const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals();
    flat.addGroup(0,6,0);flat.addGroup(6,30,1);
    const asphalt=new THREE.MeshStandardMaterial({color:'#343b3c',roughness:.93});
    granularSurface(asphalt,'asphalt');
    const grain=asphalt.onBeforeCompile;
    asphalt.onBeforeCompile=(shader,renderer)=>{
      grain.call(asphalt,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vBridgeRoad;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvBridgeRoad=position.xz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vBridgeRoad;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 slab=fract(vBridgeRoad/vec2(1.2,.8));
          float seam=step(.008,min(min(slab.x,1.-slab.x),min(slab.y,1.-slab.y)));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.4,.37)*mix(.65,1.,seam),step(6.,abs(vBridgeRoad.y)));
          float edge=1.-smoothstep(.04,.08,abs(abs(vBridgeRoad.y)-5.85));
          float dash=(1.-smoothstep(.055,.085,abs(vBridgeRoad.y)))*step(mod(vBridgeRoad.x+13.,6.),3.);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.65),max(edge,dash));`);
    };
    asphalt.customProgramCacheKey=()=> 'bund-bridge-road-v1';
    const stone=new THREE.MeshStandardMaterial({color:'#8b8b7f',roughness:.95});
    granularSurface(stone,'stone');
    return {...r,geometry:flat,materials:[asphalt,stone]};
  }),[data]);
  useEffect(()=>()=>ramps.forEach(r=>{r.geometry.dispose();r.materials.forEach(m=>m.dispose());}),[ramps]);
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
      {ramps.map((r, i) => (
        <group key={i} position={r.position} rotation={[0, r.yaw, 0]}>
          <mesh geometry={r.geometry} material={r.materials} castShadow receiveShadow/>
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
  onPhotoView,
  zoom,
}: {
  data: WorldData;
  teleport: Teleport;
  onReady: () => void;
  onTelemetry: Props['onTelemetry'];
  onPhotoView: Props['onPhotoView'];
  zoom: number;
}) {
  const { world, rapier } = useRapier();
  const { camera, gl, scene } = useThree();
  useLayoutEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = zoomFov(zoom);
      camera.updateProjectionMatrix();
    }
  }, [camera, zoom]);
  const runtime = useRef<ReturnType<typeof createWalker> | null>(null);
  const lastSafe = useRef<V3>(destinations[0].position);
  const serial = useRef(-1);
  const initialized = useRef(false);
  const stats = useRef({ time: 0, frames: 0 });
  const framePhotoPose = useRef<PhotoPose | null>(null);
  useEffect(() => {
    onPhotoView?.((target) => {
      const pose = framePhotoPose.current ?? {
        position: [camera.position.x, camera.position.y, camera.position.z] as V3,
        yaw: camera.rotation.y,
        pitch: camera.rotation.x,
        grounded: false,
        verticalFov:
          camera instanceof THREE.PerspectiveCamera
            ? THREE.MathUtils.degToRad(camera.getEffectiveFOV())
            : undefined,
        aspect: camera instanceof THREE.PerspectiveCamera ? camera.aspect : undefined,
      };
      if (!target) return pose;
      const point = new THREE.Vector3(...target),
        roots = [...scene.children];
      let landmarkLoaded = false;
      // City roots already own cached world bounds. Prune their large mesh trees;
      // the photograph action is the only time this loading check runs.
      while (roots.length && !landmarkLoaded) {
        const root = roots.pop()!;
        if (root.userData.bundCityTile) {
          landmarkLoaded = root.userData.bundCityBounds?.containsPoint(point) === true;
        } else roots.push(...root.children);
      }
      return { ...pose, landmarkLoaded };
    });
    return () => onPhotoView?.(null);
  }, [camera, scene, onPhotoView]);
  useEffect(() => {
    const previous = gl.info.autoReset;
    // Include all passes, including the water reflection, in each rendered-frame sample.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);
  useLayoutEffect(() => {
    const fixed = createGround({ world, rapier }, data);
    const walker = createWalker({ world, rapier });
    const { body, collider, controller } = walker;
    runtime.current = walker;
    framePhotoPose.current = null;
    camera.rotation.order = 'YXZ';
    initialized.current = false;
    return () => {
      runtime.current = null;
      framePhotoPose.current = null;
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
      world.removeRigidBody(fixed);
    };
  }, [world, rapier, data, camera, onReady]);
  function placeSafe(position: V3, yaw: number, pitch = 0) {
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
      if (y > 6 || y < -0.1 || (y < 0.7 && onRiver(x, z, data))) continue;
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
      camera.rotation.set(pitch, yaw, 0);
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
      placeSafe(teleport.position, teleport.yaw, teleport.pitch);
      serial.current = teleport.serial;
      initialized.current = true;
      onReady();
    }
  });
  useBeforePhysicsStep(() => {
    const r = runtime.current;
    if (!r || !initialized.current) return;
    if (serial.current !== teleport.serial) {
      placeSafe(teleport.position, teleport.yaw, teleport.pitch);
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
    const move = movement(
      input.sitting ? 0 : x,
      input.sitting ? 0 : z,
      camera.rotation.y,
      TRAVEL_SPEED,
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
    if (r.ground && !onRiver(next.x, next.z, data)) lastSafe.current = [next.x, next.y, next.z];
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
    // The event handler reads this rendered view rather than a new projection
    // changed by a layout effect while the preserved drawing buffer is still old.
    framePhotoPose.current = {
      position: [p.x, p.y, p.z],
      yaw: camera.rotation.y,
      pitch: camera.rotation.x,
      grounded: r.ground,
      verticalFov:
        camera instanceof THREE.PerspectiveCamera
          ? THREE.MathUtils.degToRad(camera.getEffectiveFOV())
          : undefined,
      aspect: camera instanceof THREE.PerspectiveCamera ? camera.aspect : undefined,
    };
    stats.current.time += dt;
    stats.current.frames++;
    if (input.active && stats.current.time > 0.3) {
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
        pitch: camera.rotation.x,
        speed: r.speed,
        grounded: r.ground,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        fps: stats.current.frames / stats.current.time,
      });
      stats.current = { time: 0, frames: 0 };
    }
    gl.info.reset();
  });
  return null;
}
export function Scene(props: Props) {
  return (
    <>
      <Atmosphere night={props.night} quality={props.quality}/>
      <RiverWeather night={props.night} motion={props.motion} />
      <StaticCity data={props.data} night={props.night} renderDetail={props.renderDetail} />
      <Ground data={props.data} />
      <River data={props.data} night={props.night} quality={props.quality} />
      {Object.entries(props.data.props).map(
        ([name, placements]) =>
          name !== 'city-car' && (
            <Suspense key={name} fallback={null}>
              {name === 'plane-tree-planter' && props.renderDetail !== 'original' ? (
                <SmoothTrees placements={placements} detail={props.renderDetail} />
              ) : (
                <Furniture name={name} placements={placements} night={props.night} />
              )}
            </Suspense>
          ),
      )}
      <Physics
        timeStep={1 / 60}
        gravity={[0, -9.81, 0]}
        paused={props.ready && !props.active}
        interpolate
      >
        <Suspense fallback={null}>
          <StreetLife data={props.data} crowd={props.crowd} motion={props.motion}
            event={props.lifeEvent} onTarget={props.onLifeTarget} />
        </Suspense>
        <Suspense fallback={null}>
          <Traffic placements={props.data.props['city-car'] || []} night={props.night} />
        </Suspense>
        <Controller
          data={props.data}
          teleport={props.teleport}
          onReady={props.onReady}
          onTelemetry={props.onTelemetry}
          onPhotoView={props.onPhotoView}
          zoom={props.zoom}
        />
      </Physics>
    </>
  );
}

// The homepage and tour share one runtime and viewpoint; inactive views render on demand.
export function Tour(props: Props & {onRenderer: (gl: THREE.WebGLRenderer) => void}) {
  return <Canvas frameloop={props.active || !props.ready ? 'always' : 'demand'}
    // Measure the logical layout, not the swapped bounding box of CSS rotation.
    resize={{ offsetSize: true }}
    shadows
    dpr={[props.quality === 0 ? .85 : 1, props.quality === 0 ? .85 : props.quality === 1 ? 1.25 : 2]}
    camera={{position: [-393,2.6,37],fov:DEFAULT_FOV,near:.25,far:12000}}
    gl={{antialias:true, logarithmicDepthBuffer:true, preserveDrawingBuffer:true,
      powerPreference:'high-performance',toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.9}}
    onCreated={({gl})=>props.onRenderer(gl)}>
    <Suspense fallback={null}><Scene {...props}/></Suspense>
  </Canvas>;
}
