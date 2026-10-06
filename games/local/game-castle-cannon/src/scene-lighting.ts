import * as T from 'three';
import { landNoise } from './scene-valley.js';
/** Small original procedural sky supplies real reflections on forged metal and helmets. */
export function siegeLight(scene: T.Scene, renderer: T.WebGLRenderer) {
  scene.background = new T.Color('#c8dce2');
  scene.fog = new T.Fog('#b4c8d0', 100, 440);
  scene.add(new T.HemisphereLight('#abc8e4', '#6a5840', 0.42));
  const sun = new T.DirectionalLight('#ffd59c', 3.1);
  sun.position.set(-48, 44, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -42,
    right: 42,
    top: 42,
    bottom: -42,
    near: 1,
    far: 130,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  sun.target.position.set(4, 0, 10);
  scene.add(sun, sun.target);
  const width = 512,
    height = 256,
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const elevation = -Math.cos((y / (height - 1)) * Math.PI),
        horizon = Math.pow(1 - Math.abs(elevation), 11),
        color = new T.Color(elevation > 0 ? '#75b2d3' : '#776951').lerp(
          new T.Color('#f0ddbb'),
          horizon * 0.84,
        ),
        u = (x / width) * 22,
        v = (y / height) * 16,
        billow =
          landNoise(u, v) * 0.55 +
          landNoise(u * 2.3 + 8, v * 2.3) * 0.28 +
          landNoise(u * 5.9, v * 5.9 + 12) * 0.17,
        coverage = Math.max(0, Math.min(1, (billow - 0.47) / 0.18)),
        cloud = coverage * Math.exp(-((elevation - 0.28) ** 2) / 0.045),
        glow = Math.exp(-((x - 165) ** 2 / 750 + (y - 181) ** 2 / 190));
      color.lerp(new T.Color('#fff8e8'), Math.min(0.95, cloud * 0.92 + glow * 0.72));
      color.convertLinearToSRGB();
      const i = (y * width + x) * 4;
      data[i] = color.r * 255;
      data[i + 1] = color.g * 255;
      data[i + 2] = color.b * 255;
      data[i + 3] = 255;
    }
  const texture = new T.DataTexture(data, width, height);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  const generator = new T.PMREMGenerator(renderer),
    environment = generator.fromEquirectangular(texture);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.36;
  generator.dispose();
  scene.background = texture;
  return () => {
    environment.dispose();
    texture.dispose();
  };
}
