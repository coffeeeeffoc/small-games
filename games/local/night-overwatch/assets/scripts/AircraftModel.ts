import {
  Color,
  JsonAsset,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  isValid,
  resources,
  utils,
} from 'cc';

type Geometry = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
const RESOURCE = 'models/aircraft/cabin';
const MUZZLE = new Vec3(-1.8, -1.1, 1.2);

function validate(payload: unknown): Geometry {
  if (!payload || typeof payload !== 'object') throw Error('Expected a geometry object');
  const g = payload as Record<keyof Geometry, unknown>;
  if (
    !Array.isArray(g.positions) ||
    !Array.isArray(g.normals) ||
    !Array.isArray(g.colors) ||
    !Array.isArray(g.indices)
  )
    throw Error('positions, normals, colors and indices must be arrays');
  const { positions, normals, colors, indices } = g;
  const vertices = positions.length / 3;
  // Cocos 3.8.8 utils.createMesh writes 16-bit indices, as in World.mesh.
  if (!Number.isInteger(vertices) || vertices < 3 || vertices > 65535)
    throw Error('positions must contain 3..65535 complete XYZ vertices');
  if (normals.length !== positions.length || colors.length !== vertices * 4)
    throw Error('Expected one XYZ normal and one RGBA color per vertex');
  if (!indices.length || indices.length % 3 !== 0 || indices.length > 8000 * 3)
    throw Error('indices must contain 1..8000 complete triangles');
  for (const [name, values] of Object.entries({ positions, normals, colors, indices }))
    for (const value of values)
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isFinite(Math.fround(value))
      )
        throw Error(`${name} must contain finite float32 numbers`);
  if (colors.some((v) => v < 0 || v > 1)) throw Error('RGBA colors must be normalized to [0, 1]');
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices))
    throw Error('indices must be integers within the vertex array');
  return { positions, normals, colors, indices };
}

/** Explicitly owned runtime model; the main World supplies the Simulation pose. */
export class AircraftModel {
  public readonly node: Node;
  public readonly ready: Promise<void>;
  public status: 'loading' | 'ready' | 'error' | 'disposed' = 'loading';
  public error = '';
  public triangleCount = 0;
  public direction: -1 | 1 = 1;
  private settleReady!: () => void;
  private mesh: Mesh | null = null;
  private material: Material | null = null;
  private renderer: MeshRenderer | null = null;

  constructor(parent: Node) {
    this.node = new Node('asset:aircraft.cabin');
    // Always resolves, including failure/cancellation; callers must inspect status.
    this.ready = new Promise<void>((resolve) => {
      this.settleReady = resolve;
    });
    this.node.once(Node.EventType.NODE_DESTROYED, this.finishDisposal, this);
    if (!isValid(parent, true)) {
      this.dispose();
      return;
    }
    try {
      parent.addChild(this.node);
      if (!this.alive()) return;
      resources.load(RESOURCE, JsonAsset, (error, asset) => {
        let retained: JsonAsset | null = null;
        try {
          // Also balance late callbacks: never force-release a shared cached asset.
          if (asset) {
            asset.addRef();
            retained = asset;
          }
          if (!this.alive()) return;
          if (error) throw error;
          if (!asset) throw Error('Loader returned no JsonAsset');
          const geometry = validate(asset.json);
          this.mesh = new Mesh();
          utils.createMesh(geometry, this.mesh, { calculateBounds: true });
          this.material = new Material();
          this.material.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_VERTEX_COLOR: true },
          });
          this.material.setProperty('mainColor', Color.WHITE);
          this.renderer = this.node.addComponent(MeshRenderer);
          this.renderer.mesh = this.mesh;
          this.renderer.setMaterial(this.material, 0);
          this.triangleCount = geometry.indices.length / 3;
          this.status = 'ready';
        } catch (cause) {
          this.fail(cause);
        } finally {
          // createMesh copies into its own buffers; the JSON is no longer needed.
          retained?.decRef();
          this.settleReady();
        }
      });
    } catch (cause) {
      this.fail(cause);
    }
  }

  /** Simulation radians: Ry(yaw) * Rx(-pitch), matching Flight.muzzlePosition (positive = climb). */
  public update(
    position: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    direction: -1 | 1,
  ): void {
    if (!this.alive()) return;
    this.direction = direction; // Orbit marker only: never mirror the mesh/muzzle or add bank.
    this.node.setPosition(position.x, position.y, position.z);
    this.node.setRotationFromEuler((-pitch * 180) / Math.PI, (yaw * 180) / Math.PI, 0);
  }

  /** Includes the parent world transform; available during loading, null after disposal. */
  public get worldMuzzle(): Vec3 | null {
    if (!this.alive()) return null;
    return Vec3.transformMat4(new Vec3(), MUZZLE, this.node.worldMatrix);
  }

  public dispose(): void {
    if (this.status === 'disposed') return;
    this.node.off(Node.EventType.NODE_DESTROYED, this.finishDisposal, this);
    this.finishDisposal();
    if (isValid(this.node, true)) this.node.destroy();
  }

  private alive(): boolean {
    if (this.status === 'disposed') return false;
    // Parent/ancestor destroy() is deferred; its children may still look valid this frame.
    for (let node: Node | null = this.node; node; node = node.parent)
      if (!isValid(node, true)) {
        this.dispose();
        return false;
      }
    return true;
  }

  private fail(cause: unknown): void {
    if (this.status === 'disposed') return;
    this.status = 'error';
    this.error = cause instanceof Error ? cause.message : String(cause);
    this.releaseGraphics();
    console.error(`[AircraftModel] Failed to load ${RESOURCE}: ${this.error}`, cause);
    this.settleReady();
  }

  // A node destruction event only releases ownership; do not destroy an in-flight node again.
  private finishDisposal(): void {
    if (this.status === 'disposed') return;
    this.status = 'disposed';
    this.releaseGraphics();
    this.settleReady();
  }

  private releaseGraphics(): void {
    if (this.renderer && isValid(this.renderer, true)) {
      this.renderer.mesh = null;
      this.renderer.setMaterial(null, 0);
    }
    if (this.mesh && isValid(this.mesh, true)) this.mesh.destroy();
    if (this.material && isValid(this.material, true)) this.material.destroy();
    this.renderer = null;
    this.mesh = null;
    this.material = null;
    this.triangleCount = 0;
  }
}
