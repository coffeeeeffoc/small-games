import { vi } from 'vitest';
import { canvasContext } from './canvas.fixture.js';
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvasContext());
vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
