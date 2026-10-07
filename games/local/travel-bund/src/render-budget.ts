import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { placementBatches, type Placement } from './world.ts';
import { RENDER_DETAILS, type RenderDetail } from './render-settings.ts';
import { facadeKind } from './facade-detail.ts';

// World-space grains need no texture download and remain fixed while walking.
export function granularSurface(material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, kind: 'granite' | 'asphalt' | 'stone') {
  if (material.userData.bundGrain) return;
  material.userData.bundGrain = kind;
  if (kind !== 'stone') material.color.set(kind === 'asphalt' ? '#343b3c' : '#a7ada8');
  if (material instanceof THREE.MeshStandardMaterial) {
    material.roughness = .93; material.metalness = 0; material.envMapIntensity = .3;
  }
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.bundPaving = {value: kind === 'granite' ? 1 : kind === 'asphalt' ? 0 : 2};
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBundSurface;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 bundSurfacePosition = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          bundSurfacePosition = instanceMatrix * bundSurfacePosition;
        #endif
        vBundSurface = (modelMatrix * bundSurfacePosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBundSurface; uniform float bundPaving;
      float bundGrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Authored linear ivory factors otherwise wash out under the runtime sky.
        diffuseColor.rgb *= bundPaving > 1.5 ? .5 : 1.;
        float grainFade = 1.-smoothstep(.008,.08,max(length(dFdx(vBundSurface.xz)),length(dFdy(vBundSurface.xz))));
        float grain = (bundGrainHash(floor(vBundSurface.xz * 140.))-.5)*grainFade;
        float stoneVariation = .96 + bundGrainHash(floor(vBundSurface.xz / vec2(1.2,.8))) * .08;
        diffuseColor.rgb *= stoneVariation + grain * (bundPaving < .5 ? .3 : .17);
        if(bundPaving > .5 && bundPaving < 1.5){
          vec2 slab=vBundSurface.xz/vec2(1.2,.8), f=fract(slab);
          vec2 seam=1.-smoothstep(vec2(.002),vec2(.006)+fwidth(slab)*.85,min(f,1.-f));
          diffuseColor.rgb *= 1.-max(seam.x,seam.y)*.42;
        }`);
  };
  material.customProgramCacheKey = () => key + ':bund-grain-v1';
}

// Collapse sub-metre decoration within the same approximate surface direction.
// Averaging keeps every survivor inside its original grid cell; material groups
// stay separate, and the original scene/collision assets are never mutated.
export function compactGeometry(original: THREE.BufferGeometry, cell: number) {
  if (cell === 0) return original;
  if (!Number.isFinite(cell) || cell < 0) throw new RangeError('Building cell must be a nonnegative number of metres');
  const position = original.getAttribute('position');
  if (!position || position.count < 256) return original;
  const normal = original.getAttribute('normal');
  const attributes = Object.entries(original.attributes);
  const remap = new Uint32Array(position.count), cells = new Map<string, number>();
  const values = attributes.map(([, attribute]) => [] as number[][]), weights: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const key = [Math.round(position.getX(index)/cell), Math.round(position.getY(index)/cell), Math.round(position.getZ(index)/cell),
      ...(normal ? [Math.round(normal.getX(index)*4), Math.round(normal.getY(index)*4), Math.round(normal.getZ(index)*4)] : [])].join(',');
    let destination = cells.get(key);
    if (destination === undefined) {
      destination = weights.length; cells.set(key, destination); weights.push(0);
      attributes.forEach(([, attribute], part) => values[part].push(Array(attribute.itemSize).fill(0)));
    }
    remap[index] = destination; weights[destination]++;
    attributes.forEach(([, attribute], part) => {
      for (let component=0; component<attribute.itemSize; component++)
        values[part][destination][component] += attribute.getComponent(index, component);
    });
  }
  const source = original.index, sourceCount = source?.count || position.count;
  const groups = original.groups.length ? original.groups : [{ start: 0, count: sourceCount, materialIndex: 0 }];
  const indices: number[] = [], outputGroups: typeof groups = [];
  for (const group of groups) {
    const seen = new Set<string>(), start = indices.length;
    for (let index = group.start; index < group.start + group.count; index += 3) {
      const a=remap[source ? source.getX(index) : index], b=remap[source ? source.getX(index+1) : index+1], c=remap[source ? source.getX(index+2) : index+2];
      if (a === b || b === c || c === a) continue;
      const key = [a,b,c].sort((x,y)=>x-y).join(',');
      if (seen.has(key)) continue;
      seen.add(key); indices.push(a,b,c);
    }
    outputGroups.push({ start, count: indices.length-start, materialIndex: group.materialIndex });
  }
  if (indices.length > sourceCount * .85 || !indices.length) return original;
  const geometry = new THREE.BufferGeometry();
  attributes.forEach(([name, attribute], part) => {
    const array = values[part].flatMap((entry,index)=>entry.map(value=>value/weights[index]));
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(array, attribute.itemSize));
  });
  geometry.normalizeNormals(); geometry.setIndex(indices);
  if (original.groups.length) outputGroups.forEach(group=>geometry.addGroup(group.start,group.count,group.materialIndex));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function compactCityScene(original: THREE.Object3D, cell: number) {
  if (cell === 0) return {scene:original,owned:[] as THREE.BufferGeometry[],ownedMaterials:[] as THREE.Material[]};
  original.updateMatrixWorld(true);
  const pieces: THREE.BufferGeometry[] = [], names: string[] = [];
  original.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const compact = compactGeometry(object.geometry, cell);
    const geometry = compact.index ? compact.toNonIndexed() : compact.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count*3), panes = new Float32Array(count), facadeKinds = new Float32Array(count);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const groups = geometry.groups.length ? geometry.groups : [{start:0,count,materialIndex:0}];
    for (const group of groups) {
      const material = (materials[group.materialIndex || 0] || materials[0]) as THREE.MeshStandardMaterial;
      const color = material.color || new THREE.Color('white');
      const kind = facadeKind(material), pane = kind === 2 ? 1 : 0;
      for (let index=group.start; index<group.start+group.count; index++) {
        colors.set([color.r,color.g,color.b],index*3);panes[index]=pane;facadeKinds[index]=kind;
      }
    }
    for(const attribute of Object.keys(geometry.attributes))
      if(!['position','normal'].includes(attribute))geometry.deleteAttribute(attribute);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometry.setAttribute('bundWindow',new THREE.BufferAttribute(panes,1));
    geometry.setAttribute('bundFacadeKind',new THREE.BufferAttribute(facadeKinds,1));
    geometry.clearGroups();pieces.push(geometry);names.push(object.name);
    if(compact!==object.geometry)compact.dispose();
  });
  const merged = mergeGeometries(pieces)!;pieces.forEach(geometry=>geometry.dispose());
  const material = new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,
    roughness:.9,envMapIntensity:.45,emissive:'#ffca85',emissiveIntensity:.025});
  material.name = 'Bund window and stone · smooth';
  material.userData.bundFacade = true;
  material.onBeforeCompile = shader => {
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float bundWindow;\nvarying float vBundWindow;\nvarying vec3 vBundPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvBundWindow=bundWindow;\nvBundPosition=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vBundWindow;\nvarying vec3 vBundPosition;')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.9,.28,vBundWindow);')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        vec2 pane=vec2((vBundPosition.x+vBundPosition.z)/2.8,vBundPosition.y/3.6);
        vec2 cell=floor(pane),edge=abs(fract(pane)-.5),aa=max(fwidth(pane),vec2(.001));
        float lit=step(.76,fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453));
        vec2 mask=1.-smoothstep(vec2(.33)-aa,vec2(.33)+aa,edge);
        float fade=1.-smoothstep(.4,1.4,max(aa.x,aa.y));
        totalEmissiveRadiance *= vBundWindow*mix(.045,lit*mask.x*mask.y,fade);`);
  };
  const mesh=new THREE.Mesh(merged,material);mesh.name='City tile · smooth';mesh.userData.sourceMeshes=names;
  const scene=new THREE.Group();scene.add(mesh);
  return {scene,owned:[merged],ownedMaterials:[material]};
}
export function disposeCityRender(render: ReturnType<typeof compactCityScene>) {
  render.owned.forEach(geometry=>geometry.dispose());
  render.ownedMaterials.forEach(material=>material.dispose());
}

// The authored tree is 3,328 triangles. Light detail represents its planter,
// trunk and foliage with 96 triangles, at every original placement.
export function smoothTreeInstances(placements: readonly Placement[], detail: Exclude<RenderDetail,'original'> = 'light') {
  const subdivision = RENDER_DETAILS[detail].treeSubdivision;
  const canopy = (x: number, y: number, radius: number) =>
    new THREE.IcosahedronGeometry(radius, subdivision).scale(1, 1, .78).translate(x, y, 0);
  const dark = [canopy(-.7, 4.6, 1.85), canopy(.65, 5.1, 2.0)];
  const merged = mergeGeometries(dark)!;
  dark.forEach(geometry => geometry.dispose());
  const parts = [
    { geometry: new THREE.BoxGeometry(3, .7, 3).translate(0, .35, 0), colour: '#b19773' },
    { geometry: new THREE.CylinderGeometry(.24, .38, 3.8, detail === 'balanced' ? 12 : 6).translate(0, 2.6, 0), colour: '#795335' },
    { geometry: merged, colour: '#3d704c' },
    { geometry: canopy(0, 6.0, 1.3), colour: '#6a8d4d' },
  ];
  const pieces = parts.map(part => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.deleteAttribute('uv');
    const colour = new THREE.Color(part.colour), count=geometry.getAttribute('position').count;
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:count},()=>[colour.r,colour.g,colour.b]).flat(),3));
    part.geometry.dispose();
    return geometry;
  });
  const geometry = mergeGeometries(pieces)!;pieces.forEach(piece=>piece.dispose());
  const material = new THREE.MeshLambertMaterial({vertexColors:true});
  const batches = placementBatches(placements);
  return batches.map(batch => {
      const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      batch.forEach((placement, index) => mesh.setMatrixAt(index, new THREE.Matrix4().compose(
        new THREE.Vector3(...placement.position),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw),
        new THREE.Vector3(...placement.scale),
      )));
      mesh.computeBoundingSphere();
      return mesh;
  });
}

// A single pass retains moving world-space ripples without rendering the city
// into a second camera. Higher quality continues to use the authored Water.
export function smoothRiverMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, waterColor: { value: new THREE.Color('#397c83') },
      sunColor: { value: new THREE.Color('#ffd4a0') },
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 riverWorld;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        riverWorld = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float time;
      uniform vec3 waterColor;
      uniform vec3 sunColor;
      varying vec3 riverWorld;
      void main() {
        #include <logdepthbuf_fragment>
        float ripple = sin(dot(riverWorld.xz, vec2(.73,.31))-time*1.2)
          * cos(dot(riverWorld.xz, vec2(-.27,.51))+time*.83);
        gl_FragColor = vec4(waterColor * (.92 + .07*ripple) + sunColor * pow(max(ripple,0.),8.)*.025, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
