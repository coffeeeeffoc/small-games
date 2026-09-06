export type CanvasGameTarget = Readonly<{
  canvas: {
    width: number;
    height: number;
    getContext(kind: '2d'): CanvasRenderingContext2D | null;
  };
  onTap(listener: (x: number, y: number) => void): () => void;
  onPress?(start: (x: number, y: number) => void, end: () => void): () => void;
}>;
export type CanvasScreen = Readonly<{
  title: string;
  lines: readonly string[];
  actions: readonly { label: string; run?(): void; press?(): void; release?(): void }[];
  color?: string;
}>;

/** DOM-free text and touch surface shared by reviewed native Game entries. */
export function createCanvasSurface(target: CanvasGameTarget) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  let buttons: Array<CanvasScreen['actions'][number] & { top: number; bottom: number }> = [];
  const findButton = (x: number, y: number) => {
    const logicalX = (x * 390) / target.canvas.width;
    const logicalY = (y * 844) / target.canvas.height;
    return logicalX >= 20 && logicalX <= 370
      ? buttons.find((button) => logicalY >= button.top && logicalY <= button.bottom)
      : undefined;
  };
  const stop = target.onTap((x, y) => {
    findButton(x, y)?.run?.();
  });
  const stopPress = target.onPress?.(
    (x, y) => findButton(x, y)?.press?.(),
    () => buttons.forEach((button) => button.release?.()),
  );
  return {
    draw(screen: CanvasScreen) {
      buttons = [];
      context.save();
      context.scale(target.canvas.width / 390, target.canvas.height / 844);
      context.fillStyle = screen.color ?? '#10221e';
      context.fillRect(0, 0, 390, 844);
      context.fillStyle = '#f1faea';
      context.font = 'bold 27px sans-serif';
      context.fillText(screen.title, 20, 52);
      context.font = '17px sans-serif';
      let y = 90;
      const text = (value: string) => {
        let line = '';
        for (const character of value) {
          if (context.measureText(line + character).width > 340) {
            context.fillText(line, 24, y);
            y += 25;
            line = '';
          }
          line += character;
        }
        context.fillText(line, 24, y);
        y += 30;
      };
      for (const line of screen.lines) text(line);
      for (const action of screen.actions) {
        const top = y;
        const height = Math.max(
          50,
          Math.ceil(context.measureText(action.label).width / 340) * 25 + 25,
        );
        context.fillStyle = '#285646';
        context.fillRect(20, top, 350, height);
        context.fillStyle = '#f1faea';
        y += 25;
        text(action.label);
        buttons.push({ top, bottom: top + height, ...action });
        y = top + height + 12;
      }
      context.restore();
    },
    dispose() {
      buttons = [];
      try {
        stop();
        stopPress?.();
      } finally {
        context.clearRect(0, 0, target.canvas.width, target.canvas.height);
      }
    },
  };
}
