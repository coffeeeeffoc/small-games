import { writeFileSync } from "node:fs";

// Natural Earth 1:110m: retain geometry and Chinese labels; no live tile service.
const response = await fetch(
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
);
if (!response.ok) throw new Error(`Map download failed: ${response.status}`);
const source = await response.json();
const shortNames = {
  大不列颠及北爱尔兰联合王国: "英国",
  美利坚合众国: "美国",
  俄罗斯联邦: "俄罗斯",
  朝鲜民主主义人民共和国: "朝鲜",
  大韩民国: "韩国",
  中华人民共和国: "中国",
};
const roundCoordinates = (value) =>
  Array.isArray(value) ? value.map(roundCoordinates) : Number(value.toFixed(3));
const features = source.features.map(({ geometry, properties: p }) => ({
  type: "Feature",
  properties: {
    name: shortNames[p.NAME_ZH] || p.NAME_ZH || p.name_zh,
    x: p.LABEL_X ?? p.label_x,
    y: p.LABEL_Y ?? p.label_y,
    rank: p.LABELRANK ?? p.labelrank,
  },
  geometry: {
    ...geometry,
    coordinates: roundCoordinates(geometry.coordinates),
  },
}));
writeFileSync(
  new URL("../public/data/world.json", import.meta.url),
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log(`Saved ${features.length} Chinese map regions.`);
