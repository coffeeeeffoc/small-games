import { describe, it, expect, vi } from 'vitest';
import { SceneFrame } from './scene-frame.js';
describe('GPU frame backpressure', () => {
  it('does not enqueue another frame while the previous frame is busy', () => {
    const sync = {},
      gl = {
        TIMEOUT_EXPIRED: 1,
        SYNC_GPU_COMMANDS_COMPLETE: 2,
        clientWaitSync: vi.fn(() => 1),
        deleteSync: vi.fn(),
        fenceSync: vi.fn(() => sync),
        flush: vi.fn(),
      };
    const frame = new SceneFrame(gl as unknown as WebGL2RenderingContext);
    expect(frame.ready()).toBe(true);
    frame.submitted();
    expect(frame.ready()).toBe(false);
    expect(frame.pending).toBe(true);
    expect(gl.fenceSync).toHaveBeenCalledTimes(1);
    gl.clientWaitSync.mockReturnValue(3);
    expect(frame.ready()).toBe(true);
    expect(frame.pending).toBe(false);
    expect(gl.deleteSync).toHaveBeenCalledWith(sync);
    frame.submitted();
    frame.dispose();
    frame.dispose();
    expect(gl.deleteSync).toHaveBeenCalledTimes(2);
  });
});
