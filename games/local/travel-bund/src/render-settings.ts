export const RENDER_DETAILS = {
  original: { buildingCellMetres: 0, treeSubdivision: null },
  balanced: { buildingCellMetres: .12, treeSubdivision: 1 },
  light: { buildingCellMetres: .35, treeSubdivision: 0 },
} as const;
export type RenderDetail = keyof typeof RENDER_DETAILS;
export const RENDER_DETAIL_KEY = 'travel-bund.render-detail.v1';
export function isRenderDetail(value: unknown): value is RenderDetail {
  return typeof value === 'string' && Object.hasOwn(RENDER_DETAILS, value);
}
export function readRenderDetail(search: string, stored: string | null, fallback: RenderDetail) {
  const values = new URLSearchParams(search).getAll('renderDetail');
  if (values.length === 1 && isRenderDetail(values[0])) return values[0];
  return isRenderDetail(stored) ? stored : isRenderDetail(fallback) ? fallback : 'original';
}
