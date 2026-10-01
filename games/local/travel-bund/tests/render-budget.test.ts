import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { compactCityScene, compactGeometry, disposeCityRender, smoothRiverMaterial, smoothTreeInstances } from '../src/render-budget.ts';
import { placementBatches } from '../src/world.ts';
import { RENDER_DETAILS, readRenderDetail } from '../src/render-settings.ts';

test('smooth trees keep every authored transform with less than 3% of the original geometry', () => {
  const data = JSON.parse(readFileSync(new URL('../../../../assets/bund/runtime/world/world.json',import.meta.url),'utf8'));
  const placements = data.props['plane-tree-planter'], batches = placementBatches(placements);
  const trees = smoothTreeInstances(placements);
  assert.equal(trees.length,batches.length,'Each four-colour tree batch needs one draw');
  let triangles=0;
  trees.forEach((tree,index)=>{
    const batch = batches[index % batches.length];
    assert.equal(tree.count,batch.length);
    batch.forEach((placement,instance)=>{
      const actual=new THREE.Matrix4();tree.getMatrixAt(instance,actual);
      const expected=new THREE.Matrix4().compose(new THREE.Vector3(...placement.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),placement.yaw),new THREE.Vector3(...placement.scale));
      actual.elements.forEach((value,part)=>assert(Math.abs(value-expected.elements[part])<.001));
    });
    assert(tree.boundingSphere?.radius>0);
    triangles+=(tree.geometry.index?.count||tree.geometry.getAttribute('position').count)/3*tree.count;
  });
  assert.equal(triangles,96*572);
  assert(triangles < 1903616*.03);
  new Set(trees.map(tree=>tree.geometry)).forEach(geometry=>geometry.dispose());
  new Set(trees.map(tree=>tree.material)).forEach(material=>(material as THREE.Material).dispose());
  trees.forEach(tree=>tree.dispose());
});
test('building clustering preserves bounds, material faces and the original geometry while reducing sub-metre detail', () => {
  const original = new THREE.BoxGeometry(6,12,8,40,80,40);
  const originalIndex=original.index!.count, originalVertices=original.getAttribute('position').count;
  const compact=compactGeometry(original,RENDER_DETAILS.light.buildingCellMetres);
  assert.notEqual(compact,original);
  assert(compact.index!.count<originalIndex*.65);
  assert.equal(original.index!.count,originalIndex);assert.equal(original.getAttribute('position').count,originalVertices);
  assert.equal(compact.groups.length,original.groups.length);
  assert.deepEqual(compact.groups.map(group=>group.materialIndex),original.groups.map(group=>group.materialIndex));
  original.computeBoundingBox();
  for(const axis of ['x','y','z'] as const) {
    assert(Math.abs(compact.boundingBox!.min[axis]-original.boundingBox!.min[axis])<.35);
    assert(Math.abs(compact.boundingBox!.max[axis]-original.boundingBox!.max[axis])<.35);
  }
  const p=compact.getAttribute('position'),normal=compact.getAttribute('normal');
  for(let index=0;index<p.count;index++) {
    assert([p.getX(index),p.getY(index),p.getZ(index)].every(Number.isFinite));
    assert(Math.abs(Math.hypot(normal.getX(index),normal.getY(index),normal.getZ(index))-1)<.001);
  }
  const tiny=new THREE.BoxGeometry(2,4,2);assert.equal(compactGeometry(tiny,.35),tiny);
  const source=new THREE.Group();source.add(new THREE.Mesh(original),new THREE.Mesh(tiny));
  const result=compactCityScene(source,.35);
  assert.equal(result.owned.length,1);assert.equal(result.scene.children.length,1,'Tile materials become one vertex-colour draw');
  assert.equal((result.scene.children[0] as THREE.Mesh).userData.sourceMeshes.length,source.children.length);
  assert(result.owned[0].getAttribute('color'));assert(result.owned[0].getAttribute('bundWindow'));
  assert.equal((source.children[0] as THREE.Mesh).geometry,original);
  compact.dispose();original.dispose();tiny.dispose();result.owned.forEach(geometry=>geometry.dispose());result.ownedMaterials.forEach(material=>material.dispose());
});
test('original detail is the exact source scene and geometry; two simplification strengths are explicit and disposable', () => {
  const geometry=new THREE.BoxGeometry(6,12,8,40,80,40),material=new THREE.MeshStandardMaterial();
  const source=new THREE.Group();source.add(new THREE.Mesh(geometry,material));
  let sourceDisposals=0;geometry.addEventListener('dispose',()=>sourceDisposals++);material.addEventListener('dispose',()=>sourceDisposals++);
  const original=compactCityScene(source,RENDER_DETAILS.original.buildingCellMetres);
  assert.equal(original.scene,source);assert.equal(compactGeometry(geometry,0),geometry);
  assert.equal(RENDER_DETAILS.original.treeSubdivision,null,'Original detail renders the authored tree GLB');
  disposeCityRender(original);assert.equal(sourceDisposals,0);
  const balanced=compactCityScene(source,RENDER_DETAILS.balanced.buildingCellMetres),light=compactCityScene(source,RENDER_DETAILS.light.buildingCellMetres);
  assert(light.owned[0].getAttribute('position').count<balanced.owned[0].getAttribute('position').count);
  let released=0;
  for(const render of [balanced,light]) {
    render.owned.forEach(item=>item.addEventListener('dispose',()=>released++));
    render.ownedMaterials.forEach(item=>item.addEventListener('dispose',()=>released++));
    disposeCityRender(render);
  }
  assert.equal(released,4);assert.equal(sourceDisposals,0,'Detail switches must not destroy cached original models');
  const trees=smoothTreeInstances([{position:[0,0,0],yaw:0,scale:[1,1,1]}],'balanced');
  assert.equal(trees[0].geometry.getAttribute('position').count/3,300);
  trees[0].geometry.dispose();(trees[0].material as THREE.Material).dispose();trees[0].dispose();geometry.dispose();material.dispose();
});
test('render detail URLs accept exactly one known preset and otherwise use a valid saved or device default', () => {
  assert.equal(readRenderDetail('?renderDetail=original','light','balanced'),'original');
  for(const search of ['?renderDetail=__proto__','?renderDetail=0','?renderDetail=light&renderDetail=original','?renderDetail=light&renderDetail=light'])
    assert.equal(readRenderDetail(search,'balanced','light'),'balanced');
  assert.equal(readRenderDetail('','broken','original'),'original');
});
test('smooth river retains world-space ripples, fog and tone mapping without a reflection texture', () => {
  const material=smoothRiverMaterial();
  assert(material.fog);assert.equal(material.uniforms.time.value,0);
  assert(material.fragmentShader.includes('riverWorld.xz'));assert(material.fragmentShader.includes('fog_fragment'));
  assert(!Object.keys(material.uniforms).some(name=>/mirror|reflect|sampler/i.test(name)));
  material.dispose();
});
