import { Camera, Color, Layers, Material, MeshRenderer, Node, Rect, Texture2D, Vec3, isValid, primitives, resources, screen, utils, view } from 'cc';
import type { ChaseCamera } from './ChaseCamera';
import type { KartState } from './KartPhysics';

const PLAYER = 1 << 18, BACKDROP = 1 << 19;
const rect = (x: number, y: number, width: number, height: number) =>
  new Rect(x / 960, (540 - y - height) / 540, width / 960, height / 540);
const full = new Rect(0, 0, 1, 1);
const garage = rect(520, 155, 380, 225), postcard = rect(52, 142, 396, 208);
const shop = rect(474, 128, 444, 250);
// Preview rectangles follow the UI viewport, including phone letterboxing and DPR.
const inView = (area: Rect) => {
  const viewport = view.getViewportRect(), size = screen.windowSize;
  return new Rect((viewport.x + area.x * viewport.width) / size.width,
    (viewport.y + area.y * viewport.height) / size.height,
    area.width * viewport.width / size.width, area.height * viewport.height / size.height);
};

/** Two small menu textures behind the real equipped kart; the track stays a live preview. */
export class MenuPreview {
  private backdrop: Node;
  private material = new Material();
  private mesh = utils.createMesh({ ...primitives.quad(), uvs: [0, 1, 0, 0, 1, 0, 1, 1] });
  private themeCamera: Camera;
  private textures = new Map<string, Promise<Texture2D>>();
  private loaded: string[] = [];
  private wanted = '';
  private showing = '';
  private player?: Node;
  private childCount = -1;
  private menu = false;
  private point = new Vec3();
  private error = '';

  constructor(parent: Node) {
    this.backdrop = new Node('MenuArtwork');
    this.backdrop.layer = BACKDROP;
    parent.addChild(this.backdrop);
    this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    this.material.setProperty('mainColor', Color.WHITE);
    const renderer = this.backdrop.addComponent(MeshRenderer);
    renderer.mesh = this.mesh;
    renderer.setMaterial(this.material, 0);
    const cameraNode = new Node('DestinationPostcard');
    parent.addChild(cameraNode);
    this.themeCamera = cameraNode.addComponent(Camera);
    this.themeCamera.rect = postcard;
    this.themeCamera.visibility = Layers.Enum.DEFAULT;
    this.themeCamera.near = 0.2;
    this.themeCamera.far = 650;
    this.themeCamera.fov = 56;
    this.themeCamera.clearFlags = Camera.ClearFlag.SKYBOX;
    this.backdrop.active = cameraNode.active = false;
  }

  load(page: string): Promise<void> {
    if (!['home', 'setup', 'shop'].includes(page)) return Promise.resolve();
    const name = page === 'home' ? 'plaza' : 'garage';
    this.wanted = name;
    let pending = this.textures.get(name);
    if (!pending) {
      pending = new Promise<Texture2D>((resolve, reject) => {
        resources.load(`menu/${name}/texture`, Texture2D, (error, texture) => error ? reject(error) : resolve(texture));
      });
      this.textures.set(name, pending);
      void pending.catch(() => this.textures.delete(name));
    }
    return pending.then(texture => {
      if (!isValid(this.backdrop)) return;
      if (!this.loaded.includes(name)) this.loaded.push(name);
      if (this.wanted !== name) return;
      this.material.setProperty('mainTexture', texture);
      this.showing = name;
      this.error = '';
    }).catch(error => {
      if (this.wanted === name) this.error = '菜单场景加载失败，点重试';
      throw error;
    });
  }

  private layer(root: Node, layer: number) {
    root.layer = layer;
    for (const child of root.children) this.layer(child, layer);
  }

  update(page: string | undefined, camera: ChaseCamera, player: Node, kart: KartState) {
    const menu = !!page && ['home', 'setup', 'shop'].includes(page);
    if (this.player !== player || this.menu !== menu || this.childCount !== player.children.length) {
      if (this.player && isValid(this.player)) this.layer(this.player, Layers.Enum.DEFAULT);
      this.player = player;
      this.menu = menu;
      this.childCount = player.children.length;
      this.layer(player, menu ? PLAYER : Layers.Enum.DEFAULT);
      const marker = player.getChildByName('DriverColor');
      if (marker) marker.active = !menu;
    }
    this.themeCamera.node.active = page === 'setup';
    camera.camera.priority = 1;
    camera.camera.visibility = menu ? PLAYER | BACKDROP : Layers.Enum.DEFAULT;
    const area = !menu || page === 'home' ? full : page === 'setup' ? garage : shop;
    camera.camera.rect = menu ? inView(area) : full;
    camera.camera.clearFlags = menu ? page === 'home' ? Camera.ClearFlag.SOLID_COLOR : Camera.ClearFlag.DEPTH_ONLY : Camera.ClearFlag.SKYBOX;
    if (!menu) {
      this.backdrop.active = false;
      this.wanted = '';
      return;
    }
    const name = page === 'home' ? 'plaza' : 'garage';
    if (this.wanted !== name) void this.load(page!).catch(() => {});
    this.backdrop.active = this.showing === name;
    camera.camera.fov = 45;
    camera.camera.clearColor = new Color().fromHEX(page === 'home' ? '#8cdbf1' : '#f5dec1');
    const angle = kart.heading + 0.55;
    camera.node.setPosition(kart.x + Math.sin(angle) * 5.5, kart.y + 3.4, kart.z + Math.cos(angle) * 5.5);
    const offset = page === 'home' ? 0.75 : 0;
    camera.node.lookAt(new Vec3(kart.x + Math.cos(angle) * offset, kart.y + (page === 'home' ? 0.4 : 0.75), kart.z - Math.sin(angle) * offset));
    camera.initialized = false;
    Vec3.scaleAndAdd(this.point, camera.node.position, camera.node.forward, 35);
    this.backdrop.setPosition(this.point);
    this.backdrop.setRotation(camera.node.rotation);
    const height = 70 * Math.tan(Math.PI / 8);
    this.backdrop.setScale(height * (960 * area.width / (540 * area.height)), height, 1);
    if (page === 'setup') {
      this.themeCamera.rect = inView(postcard);
      const scene = this.themeCamera.node;
      scene.setPosition(kart.x - Math.sin(kart.heading) * 8, kart.y + 4.3, kart.z - Math.cos(kart.heading) * 8);
      scene.lookAt(new Vec3(kart.x + Math.sin(kart.heading) * 12, kart.y + 0.3, kart.z + Math.cos(kart.heading) * 12));
    }
  }

  snapshot() { return { loaded: [...this.loaded], background: this.showing, error: this.error, active: this.menu }; }
  dispose() { this.backdrop.destroy(); this.themeCamera.node.destroy(); this.material.destroy(); this.mesh.destroy(); }
}
