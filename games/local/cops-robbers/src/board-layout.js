// Display coordinates are independent of the graph used by the game engine.
export const boardWidth = 600;

export function boardHeight({ width = globalThis.innerWidth || 600, height = globalThis.innerHeight || 600 } = {}) {
  return height >= 700 && height > width ? 880 : 600;
}

export function presentationLevel(source, height = boardHeight()) {
  return {
    ...source,
    width: boardWidth,
    height,
    sourceNodes: source.nodes,
    // Leave room above the upper junction for a full-size character's head.
    nodes: source.nodes.map(point => ({ ...point, y: 50 + point.y * (height - 80) / 600 })),
  };
}

export function actorScale(level) {
  return level.nodes.length <= 14 ? 1 : level.nodes.length <= 18 ? 0.88 : 0.78;
}

export function applyBoardLayout(board, level) {
  const height = level.height || 600;
  board.setAttribute('viewBox', `0 0 ${boardWidth} ${height}`);
  board.style.aspectRatio = `${boardWidth} / ${height}`;
  board.dataset.boardHeight = String(height);
  const frame = board.closest('.board-frame');
  frame?.style.setProperty('--board-aspect', String(height / boardWidth));
  if (frame) frame.dataset.boardHeight = String(height);
}

export function boardExitEndpoint(level, node, outside = false) {
  const point = level.nodes[node], height = level.height || 600;
  const source = level.sourceNodes?.[node] || { x: point.x, y: point.y * 600 / height };
  // Keep the gate on the same side when only the display's height changes.
  const sides = [
    { d: source.x, x: outside ? -28 : 18, y: point.y },
    { d: 600 - source.x, x: outside ? 628 : 582, y: point.y },
    { d: source.y, x: point.x, y: outside ? -28 : 18 },
    { d: 600 - source.y, x: point.x, y: outside ? height + 28 : height - 18 },
  ];
  return sides.sort((a, b) => a.d - b.d)[0];
}
