import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cities } from "./rounds.js";

export async function createGuessMap(container, onPick) {
  const response = await fetch(`${import.meta.env.BASE_URL}data/world.json`);
  if (!response.ok) throw new Error("地图加载失败，请重试");
  const world = await response.json();
  const map = L.map(container, {
    minZoom: 1,
    maxZoom: 8,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false,
    maxBounds: [
      [-85, -180],
      [85, 180],
    ],
    maxBoundsViscosity: 1,
  }).setView([30, 90], 2);
  container.setAttribute(
    "aria-label",
    "中文地图，方向键平移，加减键缩放，也可搜索城市或标记中心",
  );
  L.geoJSON(world, {
    interactive: false,
    style: {
      color: "#afa891",
      weight: 0.7,
      fillColor: "#e7e0c9",
      fillOpacity: 1,
    },
  }).addTo(map);
  for (let lng = -180; lng <= 180; lng += 30)
    L.polyline(
      [
        [-85, lng],
        [85, lng],
      ],
      { color: "#728d83", weight: 0.5, opacity: 0.19, interactive: false },
    ).addTo(map);
  for (let lat = -60; lat <= 60; lat += 30)
    L.polyline(
      [
        [lat, -180],
        [lat, 180],
      ],
      { color: "#728d83", weight: 0.5, opacity: 0.19, interactive: false },
    ).addTo(map);
  const countryLabels = L.layerGroup().addTo(map),
    cityLabels = L.layerGroup().addTo(map),
    markers = L.layerGroup().addTo(map);
  let locked = false,
    guessMarker = null;
  function label(point, text, className) {
    const span = document.createElement("span");
    span.textContent = text;
    return L.marker(point, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className, html: span, iconSize: null }),
    });
  }
  function labels() {
    countryLabels.clearLayers();
    cityLabels.clearLayers();
    const zoom = map.getZoom();
    const used = [];
    const visible = (point, width, height) => {
      if (!map.getBounds().pad(0.15).contains(point)) return false;
      const p = map.latLngToContainerPoint(point);
      if (
        used.some(
          (q) =>
            Math.abs(q.x - p.x) < (q.width + width) / 2 &&
            Math.abs(q.y - p.y) < height,
        )
      )
        return false;
      used.push({ x: p.x, y: p.y, width });
      return true;
    };
    if (zoom >= 3)
      for (const city of cities)
        if (visible([city.lat, city.lng], city.name.length * 13, 27))
          label(
            [city.lat, city.lng],
            city.name.split(" / ")[0],
            "city-label",
          ).addTo(cityLabels);
    for (const f of [...world.features].sort(
      (a, b) => a.properties.rank - b.properties.rank,
    )) {
      const p = f.properties;
      if (!p.name || !Number.isFinite(p.x) || p.rank > zoom + 1 || zoom >= 6)
        continue;
      if (visible([p.y, p.x], p.name.length * 16, 30))
        label([p.y, p.x], p.name, "country-label").addTo(countryLabels);
    }
  }
  map.on("zoomend moveend", labels);
  function pin(point, answer = false) {
    return L.marker(point, {
      keyboard: false,
      interactive: false,
      icon: L.divIcon({
        className: `map-pin ${answer ? "answer-pin" : ""}`,
        html: `<span>${answer ? "真" : "猜"}</span>`,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
      }),
    }).addTo(markers);
  }
  function select(point, name = "地图选点") {
    if (locked) return;
    if (guessMarker) markers.removeLayer(guessMarker);
    const normalized = {
      lat: Math.max(-85, Math.min(85, point.lat)),
      lng: Math.max(-180, Math.min(180, point.lng)),
    };
    guessMarker = pin(normalized);
    onPick({ ...normalized, name });
  }
  map.on("click", (event) => select(event.latlng));
  const observer = new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    labels();
  });
  observer.observe(container);
  labels();
  return {
    select,
    center() {
      select(map.getCenter());
    },
    goTo(city) {
      map.setView([city.lat, city.lng], 5, { animate: false });
      select(city, city.name);
    },
    zoom(delta) {
      map.setZoom(map.getZoom() + delta);
    },
    resize() {
      map.invalidateSize({ pan: false });
      labels();
    },
    reset(region) {
      locked = false;
      markers.clearLayers();
      guessMarker = null;
      map.setView(
        region === "china" ? [35, 105] : [27, 45],
        region === "china" ? 3 : 2,
        { animate: false },
      );
    },
    reveal(guess, answer) {
      locked = true;
      pin(answer, true);
      if (guess) {
        L.polyline([guess, answer], {
          color: "#b6462c",
          weight: 2,
          dashArray: "6 7",
          interactive: false,
        }).addTo(markers);
        map.fitBounds(L.latLngBounds([guess, answer]).pad(0.4), {
          maxZoom: 5,
          animate: false,
          padding: [35, 45],
        });
      } else map.setView([answer.lat, answer.lng], 4, { animate: false });
    },
    destroy() {
      observer.disconnect();
      map.remove();
    },
  };
}
