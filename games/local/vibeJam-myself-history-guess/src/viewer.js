import * as THREE from "three";
import { clamp } from "./game.js";

// WenWare's inward-facing sphere approach, with a scoped mobile gesture lifecycle.
export function createViewer(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    /* Interactive flat panorama on devices without WebGL. */
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 1, 1100);
  const geometry = new THREE.SphereGeometry(500, 48, 32);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.append(renderer.domElement);
  } else {
    container.classList.add("flat-panorama");
    container.setAttribute(
      "aria-description",
      "此设备使用平面全景，仍可拖动与缩放",
    );
  }
  let yaw = 180,
    pitch = 0,
    velocity = 0,
    frame = 0,
    active = true,
    requestId = 0,
    disposed = false;
  let initialView = { yaw: 180, pitch: 0, fov: 75 };
  const pointers = new Map();
  const events = new AbortController();
  const listen = (target, name, fn, options = {}) =>
    target.addEventListener(name, fn, { ...options, signal: events.signal });
  const span = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  function draw() {
    frame = 0;
    if (!active || disposed || document.hidden) return;
    if (!pointers.size && Math.abs(velocity) > 0.01) {
      yaw += velocity;
      velocity *= 0.87;
    }
    pitch = clamp(pitch, -65, 65);
    const phi = THREE.MathUtils.degToRad(90 - pitch),
      theta = THREE.MathUtils.degToRad(yaw);
    camera.lookAt(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta),
    );
    if (renderer) renderer.render(scene, camera);
    else {
      container.style.backgroundPosition = `${50 + (yaw - 180) * 0.28}% ${50 + pitch * 0.5}%`;
      container.style.backgroundSize = `auto ${Math.round((100 * 90) / camera.fov)}%`;
    }
    container.dataset.yaw = yaw.toFixed(2);
    container.dataset.fov = camera.fov.toFixed(2);
    if (!pointers.size && Math.abs(velocity) > 0.01) invalidate();
  }
  function invalidate() {
    if (!frame && active && !document.hidden && !disposed)
      frame = requestAnimationFrame(draw);
  }
  function cancel() {
    for (const id of pointers.keys())
      if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
    pointers.clear();
    velocity = 0;
  }
  function zoom(delta) {
    camera.fov = clamp(camera.fov + delta, 35, 90);
    camera.updateProjectionMatrix();
    invalidate();
  }
  function reset() {
    cancel();
    yaw = initialView.yaw;
    pitch = initialView.pitch;
    camera.fov = initialView.fov;
    camera.updateProjectionMatrix();
    invalidate();
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer?.setSize(width, height);
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  listen(container, "pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    velocity = 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture(event.pointerId);
  });
  listen(container, "pointermove", (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const oldSpan = span(),
      dx = event.clientX - last.x,
      dy = event.clientY - last.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) {
      const newSpan = span();
      if (oldSpan > 0 && newSpan > 0)
        zoom(camera.fov * (oldSpan / newSpan - 1));
    } else {
      const sensitivity = camera.fov / container.clientHeight;
      velocity = -dx * sensitivity * 0.32;
      yaw -= dx * sensitivity;
      pitch += dy * sensitivity;
      invalidate();
    }
  });
  listen(container, "pointerup", (event) => {
    pointers.delete(event.pointerId);
    if (container.hasPointerCapture(event.pointerId))
      container.releasePointerCapture(event.pointerId);
    invalidate();
  });
  listen(container, "pointercancel", cancel);
  listen(container, "lostpointercapture", (event) => {
    pointers.delete(event.pointerId);
  });
  listen(window, "blur", cancel);
  listen(document, "game-displaychange", () => {
    cancel();
    resize();
  });
  listen(document, "visibilitychange", () => {
    cancel();
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  });
  listen(
    container,
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(event.deltaY * 0.04);
    },
    { passive: false },
  );
  listen(container, "keydown", (event) => {
    const actions = {
      ArrowLeft: () => (yaw -= 6),
      ArrowRight: () => (yaw += 6),
      ArrowUp: () => (pitch += 6),
      ArrowDown: () => (pitch -= 6),
      "+": () => zoom(-5),
      "=": () => zoom(-5),
      "-": () => zoom(5),
      Home: reset,
    };
    if (actions[event.key]) {
      event.preventDefault();
      velocity = 0;
      actions[event.key]();
      invalidate();
    }
  });
  if (renderer)
    listen(renderer.domElement, "webglcontextlost", (event) => {
      event.preventDefault();
      container.dispatchEvent(new CustomEvent("viewererror"));
    });
  async function load({ image: url, view }) {
    const id = ++requestId;
    initialView = view;
    reset();
    // Keep only the active GPU texture; do not retain the whole question bank in phone memory.
    const texture = await new Promise((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(new Error("场景加载超时，请重试"));
      }, 20000);
      new THREE.TextureLoader().load(
        url,
        (t) => {
          clearTimeout(timer);
          if (expired) t.dispose();
          else resolve(t);
        },
        undefined,
        () => {
          clearTimeout(timer);
          reject(new Error("场景加载失败，请重试"));
        },
      );
    });
    if (id !== requestId || disposed) {
      texture.dispose();
      return false;
    }
    material.map?.dispose();
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    if (!renderer) container.style.backgroundImage = `url("${url}")`;
    container.dataset.image = url;
    resize();
    return true;
  }
  resize();
  return {
    load,
    reset,
    zoom,
    resize,
    setActive(value) {
      active = value;
      cancel();
      if (value) invalidate();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    destroy() {
      disposed = true;
      requestId++;
      cancel();
      events.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    },
  };
}
