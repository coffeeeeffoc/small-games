import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { clamp, DURATION, flightFrame, settleProgress } from './flight';
import { loadCity } from './lod';

export type Flight = {
  progress: number;
  target: number;
  playing: boolean;
  speed: number;
  yaw: number;
  dragging: boolean;
};
export function Scene({
  flight,
  onProgress,
  onReady,
  onLoad,
  onError,
}: {
  flight: MutableRefObject<Flight>;
  onProgress: (p: number) => void;
  onReady: () => void;
  onLoad: (p: number) => void;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    retry = useRef<() => void>(() => {});
  const [detailFailed, setDetailFailed] = useState(false);
  useEffect(() => {
    const mount = host.current!,
      abort = new AbortController();
    let renderer: THREE.WebGLRenderer | undefined,
      city: Awaited<ReturnType<typeof loadCity>> | undefined;
    let observer: ResizeObserver | undefined,
      last = 0,
      sun: THREE.DirectionalLight;
    let previousProgress = 0,
      direction = 1,
      yaw = 0;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const visible = () => {
      last = 0;
    };
    const loseContext = (event: Event) => {
      event.preventDefault();
      onError('显卡连接已中断，请重新加载。');
    };
    async function load() {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        logarithmicDepthBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      mount.appendChild(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', loseContext);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#929fa6');
      scene.fog = new THREE.FogExp2('#929fa6', 0.00011);
      const camera = new THREE.PerspectiveCamera(58, 1, 5, 20000);
      scene.add(new THREE.HemisphereLight(0xb9d0e2, 0x827d68, 2));
      sun = new THREE.DirectionalLight(0xfff1d4, 3);
      sun.position.set(-1700, 3000, 1600);
      scene.add(sun);
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      Object.assign(sun.shadow.camera, {
        left: -3100,
        right: 3100,
        top: 3100,
        bottom: -3100,
        near: 100,
        far: 8500,
      });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 2;
      city = await loadCity(scene, onLoad, abort.signal);
      if (abort.signal.aborted) {
        city.dispose();
        return;
      }
      retry.current = () => {
        city?.retry();
        setDetailFailed(false);
      };
      renderer.shadowMap.needsUpdate = true;
      mount.dataset.triangles = String(
        city.manifest.tiles.reduce((sum, tile) => sum + tile.triangles, 0),
      );
      mount.dataset.lowTriangles = String(
        city.manifest.tiles.reduce((sum, tile) => sum + tile.lowTriangles, 0),
      );
      const resize = () => {
        renderer!.setSize(mount.clientWidth, mount.clientHeight);
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();
      document.addEventListener('visibilitychange', visible);
      await renderer.compileAsync(scene, camera);
      if (abort.signal.aborted) return;
      onReady();
      renderer.setAnimationLoop((time) => {
        if (document.hidden) {
          last = 0;
          return;
        }
        const delta = last ? (time - last) / 1000 : 0;
        last = time;
        if (flight.current.playing) {
          flight.current.target = clamp(
            flight.current.target + (delta * flight.current.speed) / DURATION,
          );
        }
        flight.current.progress = media.matches
          ? flight.current.target
          : settleProgress(
              flight.current.progress,
              flight.current.target,
              delta,
              flight.current.dragging ? 24 : flight.current.playing ? 7 : 12,
            );
        if (flight.current.progress === 1) flight.current.playing = false;
        const frame = flightFrame(flight.current.progress);
        if (flight.current.progress !== previousProgress)
          direction = Math.sign(flight.current.progress - previousProgress);
        previousProgress = flight.current.progress;
        camera.position.copy(frame.eye);
        camera.up.set(0, 1, 0);
        camera.lookAt(frame.look);
        yaw = media.matches
          ? flight.current.yaw
          : THREE.MathUtils.damp(yaw, flight.current.yaw, 16, delta);
        if (Math.abs(yaw - flight.current.yaw) < 0.0001) yaw = flight.current.yaw;
        camera.rotateY(yaw);
        if (!media.matches) camera.rotateZ(frame.bank);
        const fov = frame.fov + (camera.aspect < 1 ? 15 : 0);
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        const lod = city!.update(
          camera,
          flightFrame(clamp(flight.current.progress + direction * 0.045)).eye,
          delta,
        );
        setDetailFailed(lod.failed);
        renderer!.render(scene, camera);
        mount.dataset.progress = flight.current.progress.toFixed(5);
        mount.dataset.camera = JSON.stringify(camera.position.toArray());
        mount.dataset.yaw = yaw.toFixed(4);
        mount.dataset.calls = String(renderer!.info.render.calls);
        mount.dataset.detailLoaded = String(lod.loaded);
        mount.dataset.detailVisible = String(lod.detailed);
        mount.dataset.detailFading = String(lod.fading);
        mount.dataset.detailPending = String(lod.pending);
        onProgress(flight.current.progress);
      });
    }
    void load().catch((error) => {
      if (!abort.signal.aborted) {
        console.error(error);
        onError('场景轮廓加载失败，请重新加载。');
      }
    });
    return () => {
      abort.abort();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visible);
      renderer?.setAnimationLoop(null);
      renderer?.domElement.removeEventListener('webglcontextlost', loseContext);
      city?.dispose();
      sun?.shadow.map?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      mount.replaceChildren();
    };
  }, [flight, onProgress, onReady, onLoad, onError]);
  return (
    <>
      <div ref={host} className="scene" aria-label="完整外滩三维场景" />
      {detailFailed && (
        <button className="detail-retry" onClick={() => retry.current()}>
          部分街区细节加载失败 · 点击重试
        </button>
      )}
    </>
  );
}
