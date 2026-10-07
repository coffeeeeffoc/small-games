import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { grassTuft } from './scene-foliage.js';
import { routeCenter } from './scene-space.js';

/** World-space soil, grass and mineral variation stays attached to the actual landscape. */
export function landscapeMaterial(road: boolean) {
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vLandscape;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvLandscape = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader =
      `varying vec3 vLandscape;
      float soilHash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float soilNoise(vec2 p) {vec2 a=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(soilHash(a),soilHash(a+vec2(1.,0.)),f.x),
          mix(soilHash(a+vec2(0.,1.)),soilHash(a+vec2(1.)),f.x),f.y);}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float broad=soilNoise(vLandscape.xz*0.43);
      float grain=soilNoise(vLandscape.xz*10.0);
      float fleck=soilNoise(vLandscape.xz*34.0);
      ${
        road
          ? `float rut=pow(max(0.0,cos((vLandscape.x-11.5)*2.2)),16.0)*0.07;
        diffuseColor.rgb *= 0.77+broad*0.25+grain*0.12+fleck*0.07-rut;`
          : `float grassPatch=smoothstep(0.40,0.69,broad);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.24,0.25,0.11),grassPatch*0.36);
        diffuseColor.rgb *= 0.73+grain*0.24+fleck*0.16;`
      }
      `,
    );
  };
  material.customProgramCacheKey = () => (road ? 'siege-soil-road-v1' : 'siege-grass-earth-v1');
  return material;
}

/** One continuous winding dirt strip, with worn, irregular edges and wheel tracks. */
export function approachRoad(parent: T.Group) {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= 90; row++) {
    const z = 47 - row * 0.8,
      center = routeCenter(z);
    for (let col = 0; col <= 8; col++) {
      const t = col / 8,
        edge = Math.abs(t - 0.5) * 2,
        x =
          center + (t - 0.5) * (7.1 + Math.sin(z * 0.63) * 0.55) + Math.sin(z * 2.3) * edge * 0.14,
        color = new T.Color('#cbb48b').lerp(new T.Color('#8d9360'), edge ** 12 * 0.65);
      positions.push(x, -0.025 + Math.sin(z * 0.5) * 0.018, z);
      colors.push(color.r, color.g, color.b);
      if (row < 90 && col < 8) {
        const a = row * 9 + col;
        indices.push(a, a + 1, a + 9, a + 1, a + 10, a + 9);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new T.Mesh(geometry, landscapeMaterial(true));
  road.receiveShadow = true;
  parent.add(road);
}

/** The cannon terrace, cliff shoulder and gate footing form one continuous authored approach. */
export function approachDetails(
  k: MeshKit,
  parent: T.Group,
  height: (x: number, z: number) => number,
) {
  // Larger exposed bedrock volumes establish height, then broken strata support the turf rim.
  for (let i = 0; i < 22; i++) {
    const z = 16.5 + i * 1.45,
      x = Math.min(-5.8, routeCenter(z) - 6.3) + Math.sin(i * 0.74) * 0.6;
    const rock = k.rock(parent, x, height(x, z) - 1.1, z, 3.0 + (i % 4) * 0.35, '#9a9480');
    rock.scale.y *= 1.45;
    rock.scale.z *= 1.25;
    rock.rotation.set(0.05 + Math.sin(i) * 0.2, i * 1.7, Math.sin(i * 5) * 0.09);
    const capX = Math.min(x + 2.1, routeCenter(z) - 5.4);
    k.rock(parent, capX, height(capX, z) - 0.25, z + 0.4, 1.4 + (i % 3) * 0.24, '#aca491');
  }
  // Wall-foot erosion and dislodged limestone are clustered against masonry, clear of the route.
  for (let i = 0; i < 58; i++) {
    const x = -9.5 + ((i * 3.719) % 17),
      z = 16.3 + ((i * 7.313) % 4.2);
    const rubble = k.box(
      parent,
      x,
      height(x, z) + 0.18,
      z,
      0.35 + (i % 4) * 0.18,
      0.27 + (i % 3) * 0.16,
      0.48 + (i % 5) * 0.12,
      i % 2 ? '#cbb78e' : '#bda984',
      0.11,
    );
    rubble.rotation.set(Math.sin(i * 13) * 0.38, i * 1.7, Math.cos(i * 5) * 0.32);
  }
  // Long, irregular clumps knit the exposed cliff into the wall and road rather than dotting a plane.
  for (let i = 0; i < 520; i++) {
    const z = 15.8 + ((i * 7.913) % 31),
      x = -9 + ((i * 3.117) % 17);
    if (x > 7 || Math.abs(x - routeCenter(z)) < 4.4 || (x < -5.5 && i % 3 === 0)) continue;
    const key = `approach-grass:${i % 4}`;
    if (!k.geometries.has(key)) k.geometries.set(key, grassTuft(i % 4));
    const grass = k.mesh(parent, k.geometries.get(key)!, '#ffffff', x, height(x, z) + 0.035, z);
    const material = grass.material as T.MeshStandardMaterial;
    material.vertexColors = true;
    material.side = T.DoubleSide;
    grass.rotation.y = i * 1.9;
    grass.scale.setScalar(0.65 + (i % 7) * 0.11);
    grass.castShadow = false;
  }
  // The gate road remains bright and unobstructed, bordered by sparse natural shoulders.
  for (let i = 0; i < 24; i++) {
    const z = 21 + i * 1.06,
      x = routeCenter(z) + 4.7 + Math.sin(i * 1.1) * 0.65;
    k.rock(parent, x, -0.02, z, 0.2 + (i % 4) * 0.16, '#b1a27f');
  }
}
