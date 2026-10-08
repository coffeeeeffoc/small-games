import * as T from 'three';
import { landNoise } from './scene-valley.js';
/** Small original procedural sky supplies real reflections on forged metal and helmets. */
export function siegeLight(scene: T.Scene, renderer: T.WebGLRenderer) {
  scene.background = new T.Color('#c8dce2');
  scene.fog = new T.Fog('#c1d0dc', 85, 360);
  scene.add(new T.HemisphereLight('#c2d9ee', '#827057', 0.35));
  const sun = new T.DirectionalLight('#ffe2b4', 3.4);
  sun.position.set(-48, 44, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
    data = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const elevation = -Math.cos((y / (height - 1)) * Math.PI),
        horizon = Math.pow(1 - Math.abs(elevation), 11),
        color = new T.Color(elevation > 0 ? '#76b5e9' : '#776951').lerp(
          new T.Color('#f0ddbb'),
          horizon * 0.84,
        ),
        u = (x / width) * 14,
        v = (y / height) * 8,
        billow =
          landNoise(u, v) * 0.55 +
          landNoise(u * 2.3 + 8, v * 2.3) * 0.28 +
          landNoise(u * 5.9, v * 5.9 + 12) * 0.17,
        coverage = Math.max(0, Math.min(1, (billow - 0.47) / 0.18)),
        cloud = coverage * Math.exp(-((elevation - 0.2) ** 2) / 0.06),
        glow = Math.exp(-((x - 165) ** 2 / 750 + (y - 181) ** 2 / 190));
      color.lerp(new T.Color('#fff8e8'), Math.min(0.95, cloud * 0.92 + glow * 0.72));
      // Keep the sun's radiance above one so iron can reflect a bright highlight.
      const radiance = Math.exp(-((x - 165) ** 2 / 14 + (y - 181) ** 2 / 5)) * 24;
      color.add(new T.Color('#fff0d7').multiplyScalar(radiance));
      const i = (y * width + x) * 4;
      data[i] = T.DataUtils.toHalfFloat(color.r);
      data[i + 1] = T.DataUtils.toHalfFloat(color.g);
      data[i + 2] = T.DataUtils.toHalfFloat(color.b);
      data[i + 3] = T.DataUtils.toHalfFloat(1);
    }
  const texture = new T.DataTexture(data, width, height, T.RGBAFormat, T.HalfFloatType);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.colorSpace = T.LinearSRGBColorSpace;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  const generator = new T.PMREMGenerator(renderer),
    environment = generator.fromEquirectangular(texture);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  generator.dispose();
  scene.background = texture;
  return () => {
    environment.dispose();
    texture.dispose();
  };
}
