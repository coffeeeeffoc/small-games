/** Keep at most one submitted GPU frame in flight; rules and input continue on their own clock. */
export class SceneFrame {
  pending = false;
  private sync: WebGLSync | null = null;
  constructor(private gl: WebGL2RenderingContext) {}
  ready() {
    if (!this.sync) return true;
    if (this.gl.clientWaitSync(this.sync, 0, 0) === this.gl.TIMEOUT_EXPIRED) {
      this.pending = true;
      return false;
    }
    this.gl.deleteSync(this.sync);
    this.sync = null;
    this.pending = false;
    return true;
  }
  submitted() {
    this.sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.gl.flush();
  }
  dispose() {
    if (this.sync) this.gl.deleteSync(this.sync);
    this.sync = null;
  }
}
