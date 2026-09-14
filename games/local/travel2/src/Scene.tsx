import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { sceneArt, sceneFrame } from './scene-math';

function makeFerry() {
  const ferry = new Container();
  const body = new Graphics()
    .poly([-46, -4, 45, -4, 32, 9, -34, 9])
    .fill(0x263f41)
    .poly([-43, -4, 43, -4, 36, 0, -39, 0])
    .fill(0xd5c6a2)
    .roundRect(-29, -18, 55, 14, 2)
    .fill(0xe3d9b8)
    .rect(-33, -19, 65, 3)
    .fill(0x576962)
    .rect(-12, -27, 24, 8)
    .fill(0xe3d9b8)
    .rect(-15, -29, 30, 3)
    .fill(0x576962)
    .rect(-8, -25, 7, 4)
    .fill(0x668884)
    .rect(3, -25, 6, 4)
    .fill(0x668884)
    .rect(-26, -14, 47, 6)
    .fill(0x496863);
  for (let x = -18; x <= 19; x += 10) body.rect(x, -14, 2, 6).fill(0xd2c8aa);
  body
    .moveTo(21, -19)
    .lineTo(21, -35)
    .stroke({ color: 0x384c49, width: 1 })
    .poly([21, -35, 32, -32, 21, -29])
    .fill(0xa34b3e)
    .circle(-28, 2, 2)
    .fill(0x142e32)
    .circle(28, 2, 2)
    .fill(0x142e32);
  const reflection = new Graphics()
    .ellipse(0, 13, 40, 3)
    .fill({ color: 0x283d3b, alpha: 0.17 })
    .moveTo(-63, 10)
    .lineTo(-39, 10)
    .moveTo(-79, 14)
    .lineTo(-43, 14)
    .moveTo(-58, 18)
    .lineTo(-35, 18)
    .stroke({ color: 0xf4e6c8, alpha: 0.6, width: 1 });
  const lights = new Graphics();
  for (let x = -25; x <= 15; x += 10) lights.rect(x, -13, 6, 4).fill(0xffc770);
  lights.rect(-8, -25, 7, 4).rect(3, -25, 6, 4).fill(0xffc770);
  lights.alpha = 0;
  ferry.addChild(reflection, body, lights);
  return { ferry, body, lights };
}

export function Scene({ progress, reducedMotion }: { progress: number; reducedMotion: boolean }) {
  const target = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  const current = useRef({ progress, reducedMotion });
  current.current = { progress, reducedMotion };

  useEffect(() => {
    const host = target.current;
    if (!host) return;
    const measure = new ResizeObserver(() =>
      setSize({ width: host.clientWidth, height: host.clientHeight }),
    );
    measure.observe(host);
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    let observer: ResizeObserver | undefined;
    let fogTexture: Texture | undefined;
    let redraw: (() => void) | undefined;

    const destroy = () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      if (!initialized || destroyed) return;
      destroyed = true;
      redraw = undefined;
      // Assets owns the panorama textures; another mount may still be loading them.
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      fogTexture?.destroy(true);
    };
    const visibility = () => {
      if (!initialized || disposed || destroyed) return;
      if (document.hidden) app.stop();
      else {
        redraw?.();
        app.start();
      }
    };

    const mount = async () => {
      try {
        await app.init({
          resizeTo: host,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          // Raster art needs no MSAA; it can expose a diagonal seam during the night crossfade.
          antialias: false,
          backgroundAlpha: 0,
          preference: 'webgl',
          autoStart: false,
        });
        initialized = true;
        if (disposed) {
          destroy();
          return;
        }
        const panorama = await Assets.load<Texture>(
          `${import.meta.env.BASE_URL}art/bund-panorama.webp`,
        );
        if (disposed) {
          destroy();
          return;
        }
        app.canvas.setAttribute('aria-hidden', 'true');
        app.canvas.style.display = 'block';
        host.appendChild(app.canvas);
        app.stage.eventMode = 'none';
        app.ticker.maxFPS = 40;

        const day = new Sprite(panorama);
        const pictures: Partial<Record<keyof typeof sceneArt, Sprite>> = { river: day };
        const landscape = new Container();
        landscape.addChild(day);
        app.stage.addChild(landscape);

        const shade = new Graphics().rect(0, 0, 1, 1).fill(0x172d47);
        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = 128;
        fogCanvas.height = 128;
        const context = fogCanvas.getContext('2d');
        if (context) {
          const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
          gradient.addColorStop(0, 'rgba(238,235,210,0.24)');
          gradient.addColorStop(1, 'rgba(238,235,210,0)');
          context.fillStyle = gradient;
          context.fillRect(0, 0, 128, 128);
        }
        fogTexture = Texture.from(fogCanvas);
        const fog = [new Sprite(fogTexture), new Sprite(fogTexture)];
        fog.forEach((cloud) => cloud.anchor.set(0.5));
        const { ferry, body: ferryBody, lights: ferryLights } = makeFerry();
        const ripples = new Graphics();
        for (let i = 0; i < 14; i++) {
          const x = 0.55 + ((i * 0.037) % 0.18);
          const y = 0.71 + ((i * 0.019) % 0.09);
          ripples.moveTo(x, y).lineTo(x + 0.012 + (i % 3) * 0.004, y);
        }
        ripples.stroke({ color: 0xffefcf, width: 0.0007, alpha: 0.2 });
        const birds = Array.from({ length: 3 }, () =>
          new Graphics()
            .moveTo(-8, 0)
            .quadraticCurveTo(-4, -4, 0, 0)
            .quadraticCurveTo(4, -4, 8, 0)
            .stroke({ color: 0x405852, width: 1.2, alpha: 0.65 }),
        );
        app.stage.addChild(shade, ...fog, ripples, ferry, ...birds);

        let elapsed = 0;
        redraw = () => {
          const { width, height } = app.screen;
          const state = current.current;
          const p = Math.min(1, Math.max(0, Number.isFinite(state.progress) ? state.progress : 0));
          const frame = sceneFrame(
            width,
            height,
            panorama.width,
            panorama.height,
            p,
            state.reducedMotion,
          );
          for (const [art, picture] of Object.entries(pictures)) {
            const pictureFrame = sceneFrame(
              width,
              height,
              picture.texture.width,
              picture.texture.height,
              p,
              state.reducedMotion,
            );
            picture.scale.set(pictureFrame.scale);
            picture.position.set(pictureFrame.x, pictureFrame.y);
            picture.alpha = frame.weights[art as keyof typeof sceneArt];
          }
          shade.width = width;
          shade.height = height;
          shade.alpha = frame.night * 0.05;
          const riverWeight = frame.weights.river + frame.weights.night;
          const time = state.reducedMotion ? 0 : elapsed;
          fog.forEach((cloud, i) => {
            cloud.position.set(
              width * (0.24 + i * 0.49 - p * 0.025) + Math.sin(time / 14000 + i * 2) * 15,
              height * (0.52 + i * 0.07),
            );
            cloud.width = width * 0.85;
            cloud.height = height * 0.18;
            cloud.alpha = riverWeight * (1 - frame.night * 0.65) * (i === 0 ? 0.65 : 0.4);
          });
          // River details use artwork coordinates so the camera cannot slide them onto the promenade.
          const imageWidth = panorama.width * frame.scale;
          const imageHeight = panorama.height * frame.scale;
          ripples.scale.set(imageWidth, imageHeight);
          ripples.position.set(frame.x + Math.sin(time / 3500) * frame.scale * 2, frame.y);
          ripples.alpha =
            riverWeight * (0.5 + Math.sin(time / 1800) * 0.15) * (1 - frame.night * 0.4);
          ferry.scale.set(frame.scale * 0.65);
          ferry.position.set(
            frame.x + imageWidth * (0.58 + p * 0.14 + Math.sin(time / 13000) * 0.014),
            frame.y + imageHeight * 0.715 + Math.sin(time / 1400) * frame.scale * 1.3,
          );
          ferry.rotation = Math.sin(time / 1800) * 0.006;
          ferry.alpha = 0.88 * riverWeight;
          ferryBody.tint = 0xffffff - Math.round(frame.night * 0x45) * 0x010101;
          ferryLights.alpha = frame.night * 0.9;
          birds.forEach((bird, i) => {
            bird.position.set(
              width * (0.63 + i * 0.027 - p * 0.075) + Math.sin(time / 9000 + i) * 14,
              height * (0.29 + i * 0.014) + Math.sin(time / 2200 + i) * 3,
            );
            bird.scale.set(
              0.6 + i * 0.12,
              (0.6 + i * 0.12) * (0.7 + Math.sin(time / 500 + i) * 0.2),
            );
            bird.alpha = riverWeight * (1 - frame.night * 0.8);
          });
        };
        app.ticker.add((ticker) => {
          if (!current.current.reducedMotion) elapsed += Math.min(ticker.deltaMS, 50);
          redraw?.();
        });
        observer = new ResizeObserver(() => {
          if (disposed || destroyed) return;
          app.resize();
          redraw?.();
          app.render();
        });
        observer.observe(host);
        document.addEventListener('visibilitychange', visibility);
        redraw();
        app.render();
        host.dataset.renderer = 'pixi';
        host.dataset.ready = 'true';
        visibility();

        // Load the remaining views without delaying the opening. CSS images stay beneath Pixi.
        for (const art of ['arcade', 'deck', 'night'] as const) {
          void Assets.load<Texture>(`${import.meta.env.BASE_URL}art/${sceneArt[art]}`)
            .then((texture) => {
              if (disposed || destroyed) return;
              const picture = new Sprite(texture);
              pictures[art] = picture;
              landscape.addChild(picture);
              redraw?.();
            })
            .catch(() => {
              /* The matching CSS view remains available. */
            });
        }
      } catch {
        if (disposed) return;
        destroy();
        host.dataset.renderer = 'fallback';
        host.dataset.ready = 'true';
      }
    };
    void mount();
    return () => {
      disposed = true;
      measure.disconnect();
      destroy();
    };
  }, []);

  const frame = sceneFrame(size.width, size.height, 1536, 1024, progress, reducedMotion);
  return (
    <div ref={target} className="scene" aria-hidden="true" data-ready="false">
      {Object.entries(sceneArt).map(([art, file]) => (
        <img
          key={art}
          src={`${import.meta.env.BASE_URL}art/${file}`}
          alt=""
          draggable={false}
          style={{
            opacity: frame.weights[art as keyof typeof sceneArt],
            width: 1536 * frame.scale,
            height: 1024 * frame.scale,
            transform: `translate(${frame.x}px, ${frame.y}px)`,
          }}
        />
      ))}
    </div>
  );
}
