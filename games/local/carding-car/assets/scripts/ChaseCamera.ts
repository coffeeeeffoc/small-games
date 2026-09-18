import { Camera, Color, Node, Vec3 } from 'cc';
import { KartConfig as C, angleDelta } from './KartConfig';
import type { KartState } from './KartPhysics';
export class ChaseCamera {
  node: Node;
  camera: Camera;
  heading = 0;
  initialized = false;
  constructor(parent: Node) {
    this.node = new Node('ChaseCamera');
    parent.addChild(this.node);
    this.camera = this.node.addComponent(Camera);
    this.camera.clearColor = new Color(159, 218, 232);
    this.camera.near = 0.2;
    this.camera.far = 650;
    this.camera.fov = C.cameraFov;
  }
  update(k: KartState, dt: number) {
    const blend = this.initialized ? 1 - Math.exp(-C.cameraLag * dt) : 1;
    if (!this.initialized) {
      this.heading = k.heading;
      this.initialized = true;
    }
    // Follow the nose continuously, including while reversing; velocity can flip at zero speed.
    this.heading += angleDelta(k.heading, this.heading) * blend;
    const distance = 7.8 + k.speed * 0.045;
    const shake = k.collision > 0 ? Math.sin(k.collision * 120) * C.cameraShake : 0;
    const position = this.node.position;
    this.node.setPosition(
      position.x + (k.x - Math.sin(this.heading) * distance + shake - position.x) * blend,
      position.y + (k.y + 4.4 - position.y) * blend,
      position.z + (k.z - Math.cos(this.heading) * distance - position.z) * blend,
    );
    this.node.lookAt(
      new Vec3(k.x + Math.sin(this.heading) * 6, k.y + 1.1, k.z + Math.cos(this.heading) * 6),
    );
    this.camera.fov +=
      ((k.boost > 0 ? C.cameraBoostFov : C.cameraFov) - this.camera.fov) * (1 - Math.exp(-5 * dt));
  }
}
