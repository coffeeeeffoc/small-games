import type { CricketMatch } from '../domain/cricket.js';
import { drawCricketScene } from '../view/scene.js';
/** Minimal native Canvas and input surface; no browser DOM or platform SDK enters Game logic. */
export type CricketCanvasTarget = Readonly<{
  canvas: {
    width: number;
    height: number;
    getContext(kind: '2d'): CanvasRenderingContext2D | null;
  };
  onTap(listener: (x: number, y: number) => void): () => void;
}>;

/** Render-only screen description with Game-owned player actions. */
export type CanvasScreen = Readonly<{
  title: string;
  arena: CricketMatch;
  lines: readonly string[];
  actions: readonly { label: string; run(): void }[];
}>;

/** Renders readable text and touch actions against a fixed logical viewport. */
export function createCricketSurface(target: CricketCanvasTarget) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  let buttons: Array<{ top: number; bottom: number; run(): void }> = [];
  const stop = target.onTap((x, y) => {
    const logicalX = (x * 390) / target.canvas.width;
    const logicalY = (y * 844) / target.canvas.height;
    if (logicalX < 20 || logicalX > 370) return;
    buttons.find((button) => logicalY >= button.top && logicalY <= button.bottom)?.run();
  });

  function draw(screen: CanvasScreen) {
    buttons = [];
    context!.save();
    context!.scale(target.canvas.width / 390, target.canvas.height / 844);
    context!.fillStyle = '#191d17';
    context!.fillRect(0, 0, 390, 844);
    context!.fillStyle = '#d9f2d4';
    context!.font = 'bold 27px serif';
    context!.fillText(screen.title, 20, 52);
    context!.fillStyle = '#bfa66b';
    context!.fillRect(20, 67, 350, 1);
    context!.font = '14px serif';
    context!.fillText('金区出击 · 看准抬头，收梗闪避', 20, 820);
    context!.save();
    context!.translate(0, 75);
    drawCricketScene(context!, screen.arena, Date.now() / 1000, undefined, 390, 400);
    context!.restore();
    context!.fillStyle = '#d9f2d4';
    context!.font = '17px sans-serif';
    let y = 505;
    const text = (value: string) => {
      let line = '';
      for (const character of value) {
        if (context!.measureText(line + character).width > 340) {
          context!.fillText(line, 24, y);
          y += 25;
          line = '';
        }
        line += character;
      }
      context!.fillText(line, 24, y);
      y += 30;
    };
    for (const line of screen.lines) text(line);
    for (const action of screen.actions) {
      const top = y;
      const rows = Math.max(1, Math.ceil(context!.measureText(action.label).width / 340));
      const height = rows * 25 + 25;
      context!.fillStyle = '#285646';
      context!.fillRect(20, top, 350, height);
      context!.fillStyle = '#f1faea';
      y += 25;
      text(action.label);
      buttons.push({ top, bottom: top + height, run: action.run });
      y = top + height + 12;
    }
    context!.restore();
  }

  return {
    draw,
    dispose() {
      buttons = [];
      try {
        stop();
      } finally {
        context.clearRect(0, 0, target.canvas.width, target.canvas.height);
      }
    },
  };
}
