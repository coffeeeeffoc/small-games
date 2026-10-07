// Shared by the native camera viewports, cream cutouts and UI diagnostics.
export const menuLayout = {
  garage: { x: 512, y: 136, width: 404, height: 196 },
  shop: { x: 474, y: 134, width: 440, height: 230 },
  scenery: { x: 44, y: 136, width: 408, height: 196 },
};
export const sceneryArea = (advanced = false) => ({ ...menuLayout.scenery,
  height: advanced ? 100 : menuLayout.scenery.height });
export const centeredArea = (area: { x: number; y: number; width: number; height: number }) => ({
  x: area.x + area.width / 2 - 480, y: 270 - area.y - area.height / 2,
  width: area.width, height: area.height,
});
