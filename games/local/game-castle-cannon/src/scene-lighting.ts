import * as T from 'three';
/** Small original procedural sky supplies real reflections on forged metal and helmets. */
export function siegeLight(scene: T.Scene, renderer: T.WebGLRenderer) {
  scene.background = new T.Color('#c8dce2');
  scene.fog = new T.Fog('#a9bdcf', 80, 285);
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
  const data = new Uint8Array(256 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 256; x++) {
      const elevation = -Math.cos((y / 127) * Math.PI),
        color = new T.Color(elevation > 0 ? '#469dd8' : '#66583e').lerp(
          new T.Color('#f2d3a4'),
          Math.pow(1 - Math.abs(elevation), 25),
        ),
        cloud =
          Math.max(
            0,
            Math.sin(x * 0.14 + Math.sin(y * 0.28)) * Math.cos(y * 0.22) +
              Math.sin(x * 0.31 + y * 0.4) * 0.2 -
              0.12,
          ) * Math.exp(-((y - 77) ** 2) / 300),
        glow = Math.exp(-((x - 82) ** 2 / 170 + (y - 95) ** 2 / 60));
      color.lerp(new T.Color('#ffffff'), Math.min(0.95, glow * 0.95 + cloud * 0.95));
      color.convertLinearToSRGB();
      const i = (y * 256 + x) * 4;
      data[i] = color.r * 255;
      data[i + 1] = color.g * 255;
      data[i + 2] = color.b * 255;
      data[i + 3] = 255;
    }
  const texture = new T.DataTexture(data, 256, 128);
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
