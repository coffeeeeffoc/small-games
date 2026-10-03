import * as THREE from 'three';
import type { Axis, Box, Level, Offsets, PieceDefinition } from '../core/types';

interface PieceView {
  definition: PieceDefinition;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  labelMaterial: THREE.MeshBasicMaterial;
  seat: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineDashedMaterial>;
  center: THREE.Vector3;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** Extract only the outside of a box union. Internal voxel seams never become
 * visible, and the visible surface uses exactly the collision model's bounds. */
function unionGeometry(boxes: readonly Box[]): THREE.BufferGeometry {
  const coordinates = ([0, 1, 2] as const).map((axis) =>
    [...new Set(boxes.flatMap((box) => [box.min[axis], box.max[axis]]))].sort((a, b) => a - b),
  );
  const [xs, ys, zs] = coordinates;
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const nz = zs.length - 1;
  const occupied = new Uint8Array(Math.max(0, nx * ny * nz));
  const index = (x: number, y: number, z: number) => (x * ny + y) * nz + z;
  const solid = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && occupied[index(x, y, z)] === 1;

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const midpoint = [
          (xs[x] + xs[x + 1]) / 2,
          (ys[y] + ys[y + 1]) / 2,
          (zs[z] + zs[z + 1]) / 2,
        ];
        if (
          boxes.some((box) => midpoint.every((v, axis) => v > box.min[axis] && v < box.max[axis]))
        ) {
          occupied[index(x, y, z)] = 1;
        }
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const face = (normal: number[], corners: number[][]) => {
    const offset = positions.length / 3;
    corners.forEach((corner) => {
      positions.push(...corner);
      normals.push(...normal);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  };

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        if (!solid(x, y, z)) continue;
        const [x0, x1, y0, y1, z0, z1] = [xs[x], xs[x + 1], ys[y], ys[y + 1], zs[z], zs[z + 1]];
        if (!solid(x + 1, y, z))
          face(
            [1, 0, 0],
            [
              [x1, y0, z0],
              [x1, y1, z0],
              [x1, y1, z1],
              [x1, y0, z1],
            ],
          );
        if (!solid(x - 1, y, z))
          face(
            [-1, 0, 0],
            [
              [x0, y0, z1],
              [x0, y1, z1],
              [x0, y1, z0],
              [x0, y0, z0],
            ],
          );
        if (!solid(x, y + 1, z))
          face(
            [0, 1, 0],
            [
              [x0, y1, z1],
              [x1, y1, z1],
              [x1, y1, z0],
              [x0, y1, z0],
            ],
          );
        if (!solid(x, y - 1, z))
          face(
            [0, -1, 0],
            [
              [x0, y0, z0],
              [x1, y0, z0],
              [x1, y0, z1],
              [x0, y0, z1],
            ],
          );
        if (!solid(x, y, z + 1))
          face(
            [0, 0, 1],
            [
              [x1, y0, z1],
              [x1, y1, z1],
              [x0, y1, z1],
              [x0, y0, z1],
            ],
          );
        if (!solid(x, y, z - 1))
          face(
            [0, 0, -1],
            [
              [x0, y0, z0],
              [x0, y1, z0],
              [x1, y1, z0],
              [x1, y0, z0],
            ],
          );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    if (drawable.geometry) geometries.add(drawable.geometry);
    if (drawable.material) {
      const attached = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
      attached.forEach((material) => {
        materials.add(material);
        const map = (material as THREE.MeshBasicMaterial).map;
        if (map) textures.add(map);
      });
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function addLetterStamps(
  group: THREE.Group,
  definition: PieceDefinition,
  letter: string,
): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(18, 29, 40, 0.68)';
    context.beginPath();
    context.arc(64, 64, 58, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff5e2';
    context.font = '700 76px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(letter, 64, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const axisIndex = { x: 0, y: 1, z: 2 }[definition.axis];
  const bar = [...definition.boxes].sort(
    (a, b) => b.max[axisIndex] - b.min[axisIndex] - (a.max[axisIndex] - a.min[axisIndex]),
  )[0];
  if (!bar) return material;
  const crossSizes = [0, 1, 2]
    .filter((axis) => axis !== axisIndex)
    .map((axis) => bar.max[axis] - bar.min[axis]);
  const size = Math.min(...crossSizes) * 0.7;
  const center = new THREE.Vector3(...bar.min)
    .add(new THREE.Vector3(...bar.max))
    .multiplyScalar(0.5);
  const geometry = new THREE.PlaneGeometry(size, size);
  for (const sign of [-1, 1]) {
    const stamp = new THREE.Mesh(geometry, material);
    stamp.position.copy(center);
    stamp.position[definition.axis] =
      (sign > 0 ? bar.max[axisIndex] : bar.min[axisIndex]) + sign * 0.006;
    stamp.quaternion.setFromUnitVectors(AXES.z, AXES[definition.axis].clone().multiplyScalar(sign));
    group.add(stamp);
  }
  return material;
}

/** View only: input gestures and puzzle rules live outside the Three scene. */
export class PuzzleScene {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 160);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pieces = new Map<string, PieceView>();
  private readonly piecesGroup = new THREE.Group();
  private readonly stage = new THREE.Group();
  private readonly axisGuide = new THREE.Group();
  private readonly target = new THREE.Vector3();
  private readonly assemblyBounds = new THREE.Box3();
  private readonly resizeObserver: ResizeObserver;
  private readonly shadowLight: THREE.DirectionalLight;
  private frame = 0;
  private disposed = false;
  private width = 1;
  private height = 1;
  private yaw = 0.72;
  private pitch = 0.5;
  private zoomFactor = 1;
  private baseSpan = 12;
  private cameraDistance = 35;
  private assemblyMinY = 0;
  private selectedId: string | null = null;
  private selectedIds = new Set<string>();
  private activeAxis: Axis | undefined;
  private xray = false;
  private hintDirection: -1 | 1 | null = null;
  private phase: 'disassemble' | 'reassemble' = 'disassemble';

  constructor(
    private readonly container: HTMLElement,
    level: Level,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'puzzle-canvas';
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute(
      'aria-label',
      '鲁班锁三维操作区，可点选构件并沿箭头拖动，空白处拖动旋转视角',
    );
    this.renderer.setClearColor(0x111d2b, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.append(this.canvas);

    this.scene.add(new THREE.HemisphereLight(0xc9e2ff, 0x1f2634, 2.5));
    this.shadowLight = new THREE.DirectionalLight(0xfff2db, 3.7);
    this.shadowLight.position.set(-9, 16, 11);
    this.shadowLight.castShadow = true;
    this.shadowLight.shadow.mapSize.set(1024, 1024);
    this.shadowLight.shadow.normalBias = 0.035;
    this.shadowLight.shadow.bias = -0.0002;
    this.shadowLight.shadow.camera.near = 0.5;
    this.shadowLight.shadow.camera.far = 70;
    this.scene.add(this.shadowLight, this.shadowLight.target);
    const rim = new THREE.DirectionalLight(0xa8c7ff, 2.3);
    rim.position.set(8, 5, -9);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.65);
    fill.position.set(2, -3, 10);
    this.scene.add(fill);
    this.scene.add(this.piecesGroup, this.stage, this.axisGuide);
    this.axisGuide.renderOrder = 10;
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.canvas.addEventListener('webglcontextrestored', this.invalidate);
    this.setLevel(level);
    this.resize();
  }

  setLevel(level: Level): void {
    this.piecesGroup.children.forEach(disposeObject);
    this.piecesGroup.clear();
    this.pieces.clear();
    this.selectedId = null;
    this.selectedIds.clear();
    this.activeAxis = undefined;
    this.xray = false;
    this.phase = 'disassemble';
    const bounds = new THREE.Box3();

    for (const definition of level.pieces) {
      const geometry = unionGeometry(definition.boxes);
      const material = new THREE.MeshStandardMaterial({
        color: definition.color,
        roughness: 0.34,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.pieceId = definition.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }),
      );
      const group = new THREE.Group();
      group.add(mesh, edges);
      const labelMaterial = addLetterStamps(
        group,
        definition,
        String.fromCharCode(65 + this.pieces.size),
      );
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      const seat = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineDashedMaterial({
          color: definition.color,
          transparent: true,
          opacity: 0.62,
          dashSize: 0.12,
          gapSize: 0.09,
          depthTest: false,
          depthWrite: false,
        }),
      );
      seat.computeLineDistances();
      seat.visible = false;
      seat.renderOrder = 8;
      bounds.union(geometry.boundingBox!);
      this.pieces.set(definition.id, {
        definition,
        group,
        mesh,
        edges,
        labelMaterial,
        seat,
        center,
      });
      this.piecesGroup.add(group, seat);
    }

    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-3, -3, -3), new THREE.Vector3(3, 3, 3));
    bounds.getCenter(this.target);
    this.assemblyBounds.copy(bounds);
    const size = bounds.getSize(new THREE.Vector3());
    this.assemblyMinY = bounds.min.y;
    this.baseSpan = Math.max(size.x, size.y, size.z) * 1.55 + 2;
    this.buildStage(bounds);
    this.buildAxisGuide();
    this.resetCamera();
  }

  update(
    offsets: Offsets,
    selectedId: string | null,
    blockedIds: readonly string[] = [],
    xray = false,
    selectedIds: readonly string[] = selectedId ? [selectedId] : [],
    axis?: Axis,
    hintDirection: -1 | 1 | null = null,
    phase: 'disassemble' | 'reassemble' = 'disassemble',
  ): void {
    this.selectedId = selectedId;
    this.selectedIds = new Set(selectedIds);
    this.activeAxis = axis;
    this.xray = xray;
    this.hintDirection = hintDirection;
    this.phase = phase;
    let lowestY = this.assemblyMinY;
    for (const [id, view] of this.pieces) {
      view.group.position.set(...(offsets[id] ?? [0, 0, 0]));
      lowestY = Math.min(lowestY, view.mesh.geometry.boundingBox!.min.y + view.group.position.y);
      const selected = this.selectedIds.has(id);
      const blocked = blockedIds.includes(id);
      // The dashed silhouette stays at the assembled position while its part moves.
      view.seat.visible =
        phase === 'reassemble' &&
        selected &&
        (offsets[id] ?? [0, 0, 0]).some((value) => Math.abs(value) > 0.001);
      const material = view.mesh.material;
      material.emissive.set(blocked ? 0xff3454 : selected ? view.definition.color : 0x000000);
      material.emissiveIntensity = blocked ? 0.55 : selected ? 0.24 : 0;
      const transparent = xray && this.selectedIds.size > 0 && !selected;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = transparent ? 0.13 : 1;
      view.labelMaterial.opacity = transparent ? 0.18 : 1;
      material.depthWrite = !transparent;
      view.mesh.castShadow = !transparent;
      view.edges.material.color.set(blocked ? 0xff6275 : selected ? 0xfff0bc : 0xffffff);
      view.edges.material.opacity = blocked || selected ? 0.9 : transparent ? 0.16 : 0.17;
    }
    // The display plinth is not a puzzle obstacle; keep it below all parts.
    this.stage.position.y = lowestY - this.assemblyMinY;
    this.updateAxisGuide();
    this.invalidate();
  }

  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Input can arrive before the next render frame after a camera gesture.
    // The camera is not a child of scene, so scene's update does not cover it.
    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.pieces.values()].map((view) => view.mesh),
      false,
    );
    if (this.xray) {
      const selectedHit = hits.find((hit) => this.selectedIds.has(hit.object.userData.pieceId));
      if (selectedHit) return selectedHit.object.userData.pieceId as string;
    }
    return hits.length ? (hits[0].object.userData.pieceId as string) : null;
  }

  projectPiece(pieceId: string): ScreenPoint {
    const view = this.pieces.get(pieceId);
    if (!view) return { x: this.width / 2, y: this.height / 2 };
    return this.project(view.center.clone().add(view.group.position));
  }

  projectAxisEnds(pieceId: string, axis?: Axis): { negative: ScreenPoint; positive: ScreenPoint } {
    const view = this.pieces.get(pieceId);
    if (!view)
      return { negative: this.projectPiece(pieceId), positive: this.projectPiece(pieceId) };
    const movementAxis = axis ?? view.definition.axis;
    const center = view.center.clone().add(view.group.position);
    const extension = AXES[movementAxis]
      .clone()
      .multiplyScalar(this.guideHalfLength(view, movementAxis));
    return {
      negative: this.project(center.clone().sub(extension)),
      positive: this.project(center.add(extension)),
    };
  }

  axisScreen(pieceId: string, axis?: Axis): { x: number; y: number; pixelsPerUnit: number } {
    const view = this.pieces.get(pieceId);
    if (!view) return { x: 1, y: 0, pixelsPerUnit: 1 };
    const start = view.center.clone().add(view.group.position);
    const a = this.project(start);
    const b = this.project(start.add(AXES[axis ?? view.definition.axis]));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const pixelsPerUnit = Math.hypot(dx, dy);
    // A nearly end-on axis remains explicit to callers, which can offer buttons.
    return {
      x: pixelsPerUnit > 0.001 ? dx / pixelsPerUnit : 1,
      y: pixelsPerUnit > 0.001 ? dy / pixelsPerUnit : 0,
      pixelsPerUnit,
    };
  }

  /** Surface samples stay on actual wood, unlike the center of a notched part.
   * Consumers can use pick() to identify which samples are visible. */
  projectedSurfacePoints(pieceId: string): ScreenPoint[] {
    const view = this.pieces.get(pieceId);
    if (!view) return [];
    const positions = view.mesh.geometry.getAttribute('position');
    const center = new THREE.Vector3();
    const corner = new THREE.Vector3();
    const points: ScreenPoint[] = [];
    // unionGeometry emits four vertices for each exposed rectangular face.
    for (let i = 0; i < positions.count; i += 4) {
      center.set(0, 0, 0);
      for (let j = 0; j < 4; j++) center.add(corner.fromBufferAttribute(positions, i + j));
      center.multiplyScalar(0.25).add(view.group.position);
      points.push(this.project(center));
    }
    return points;
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.007;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, -0.6, 1.35);
    this.positionCamera();
    this.invalidate();
  }

  /** A factor above one pulls the camera back. */
  zoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * factor, 0.55, 1.85);
    this.resize();
  }

  resetCamera(): void {
    this.yaw = 0.72;
    this.pitch = 0.5;
    this.fitPieces();
  }

  /** Explicit framing only: dragging never changes the screen-space movement scale. */
  fitPieces(offsets?: Offsets): void {
    // Disassembly follows the actual assembly even after a whole-group translation.
    // Reassembly also includes the original seats so its ghost outlines stay visible.
    const bounds = this.phase === 'reassemble' ? this.assemblyBounds.clone() : new THREE.Box3();
    for (const [id, view] of this.pieces) {
      const position = offsets
        ? new THREE.Vector3(...(offsets[id] ?? [0, 0, 0]))
        : view.group.position;
      bounds.union(view.mesh.geometry.boundingBox!.clone().translate(position));
    }
    if (bounds.isEmpty()) bounds.copy(this.assemblyBounds);
    bounds.getCenter(this.target);
    const size = bounds.getSize(new THREE.Vector3());
    const diagonal = size.length();
    this.baseSpan = Math.max(Math.max(size.x, size.y, size.z) * 1.55, diagonal) + 2;
    this.cameraDistance = Math.max(35, diagonal * 1.2);
    this.camera.far = Math.max(160, this.cameraDistance + diagonal + 35);
    this.zoomFactor = 1;
    this.positionCamera();
    this.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextrestored', this.invalidate);
    disposeObject(this.scene);
    this.shadowLight.shadow.map?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.pieces.clear();
  }

  private buildStage(bounds: THREE.Box3): void {
    this.stage.children.forEach(disposeObject);
    this.stage.clear();
    this.stage.position.set(0, 0, 0);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.78 + 1.1;
    const floor = bounds.min.y - 0.55;
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 0.1, 0.25, 80),
      new THREE.MeshStandardMaterial({ color: 0x1b2a3b, roughness: 0.85, metalness: 0.12 }),
    );
    pedestal.position.set(center.x, floor - 0.125, center.z);
    pedestal.receiveShadow = true;
    this.stage.add(pedestal);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.024, radius, 80),
      new THREE.MeshBasicMaterial({
        color: 0x7189a3,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
      }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(center.x, floor + 0.008, center.z);
    this.stage.add(rim);

    const linePositions: number[] = [];
    const spacing = Math.max(0.5, Math.round((radius / 6) * 2) / 2);
    for (
      let position = -Math.floor(radius / spacing) * spacing;
      position <= radius;
      position += spacing
    ) {
      const extent = Math.sqrt(Math.max(0, radius * radius - position * position));
      linePositions.push(
        -extent,
        0,
        position,
        extent,
        0,
        position,
        position,
        0,
        -extent,
        position,
        0,
        extent,
      );
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const grid = new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color: 0x8097ae, transparent: true, opacity: 0.07 }),
    );
    grid.position.set(center.x, floor + 0.012, center.z);
    this.stage.add(grid);

    const shadowCamera = this.shadowLight.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -radius * 2.5;
    shadowCamera.right = shadowCamera.top = radius * 2.5;
    shadowCamera.updateProjectionMatrix();
    this.shadowLight.target.position.copy(center);
    this.shadowLight.position.copy(center).add(new THREE.Vector3(-9, 16, 11));
  }

  private buildAxisGuide(): void {
    this.axisGuide.children.forEach(disposeObject);
    this.axisGuide.clear();
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({
        color: 0xf5d396,
        transparent: true,
        opacity: 0.48,
        dashSize: 0.12,
        gapSize: 0.12,
        depthTest: false,
        depthWrite: false,
      }),
    );
    line.computeLineDistances();
    line.renderOrder = 10;
    this.axisGuide.add(line);
    for (const sign of [-1, 1]) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.105, 0.28, 12),
        new THREE.MeshBasicMaterial({
          color: 0xf7dba9,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        }),
      );
      arrow.position.y = sign;
      if (sign < 0) arrow.rotation.z = Math.PI;
      arrow.renderOrder = 11;
      this.axisGuide.add(arrow);
    }
    this.axisGuide.visible = false;
  }

  private updateAxisGuide(): void {
    const view = this.selectedId ? this.pieces.get(this.selectedId) : undefined;
    this.axisGuide.visible = Boolean(view);
    if (!view) return;
    const axis = this.activeAxis ?? view.definition.axis;
    const halfLength = this.guideHalfLength(view, axis);
    this.axisGuide.position.copy(view.center).add(view.group.position);
    this.axisGuide.quaternion.setFromUnitVectors(AXES.y, AXES[axis]);
    const line = this.axisGuide.children[0];
    line.scale.y = halfLength;
    this.axisGuide.children[1].position.y = -halfLength;
    this.axisGuide.children[2].position.y = halfLength;
    for (const [index, direction] of [
      [1, -1],
      [2, 1],
    ] as const) {
      const arrow = this.axisGuide.children[index] as THREE.Mesh<
        THREE.ConeGeometry,
        THREE.MeshBasicMaterial
      >;
      const suggested = this.hintDirection === direction;
      arrow.material.opacity = this.hintDirection === null ? 0.9 : suggested ? 1 : 0.18;
      arrow.material.color.set(suggested ? 0xffedb0 : 0xf7dba9);
      arrow.scale.setScalar(suggested ? 1.55 : 1);
    }
  }

  private guideHalfLength(view: PieceView, axis: Axis): number {
    const box = view.mesh.geometry.boundingBox!;
    return Math.max(1, (box.max[axis] - box.min[axis]) / 2 + 0.85);
  }

  private project(point: THREE.Vector3): ScreenPoint {
    this.camera.updateMatrixWorld(true);
    // Projecting must not mutate the world point: axisScreen reuses it to form
    // the endpoint one world unit away when determining drag direction.
    const projected = point.clone().project(this.camera);
    return { x: ((projected.x + 1) * this.width) / 2, y: ((1 - projected.y) * this.height) / 2 };
  }

  private positionCamera(): void {
    const distance = this.cameraDistance;
    this.stage.visible = this.pitch > 0.02;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * distance,
      this.target.y + Math.sin(this.pitch) * distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * distance,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    const aspect = this.width / this.height;
    // Keep the same playable span across portrait and landscape screens.
    const halfHeight = (this.baseSpan * this.zoomFactor) / (2 * Math.min(1, aspect));
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.invalidate();
  };

  private readonly invalidate = (): void => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  };
}
