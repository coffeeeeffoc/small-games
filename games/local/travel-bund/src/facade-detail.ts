import * as THREE from 'three';

// Keep roof metal, structural ribs, lamps and outdoor paving out of the wall treatment.
export type FacadeKind = 0 | 1 | 2 | 3;
export function facadeKind(material: THREE.Material): FacadeKind {
  if (/lamp/i.test(material.name)) return 0;
  if (/glass|window|curtain wall/i.test(material.name)) return 2;
  if (/Limestone|Carved stone|Sandstone/i.test(material.name)) return 1;
  if (/Heritage red brick/i.test(material.name)) return 3;
  return 0;
}

// Relief is shaded into the existing wall draws. It needs no downloaded texture
// or extra mesh, and uses metres in the world so detail survives all model presets.
export function decorateFacade(material: THREE.Material) {
  if (
    !(
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshLambertMaterial
    )
  )
    return;
  const merged = material.userData.bundFacade === true;
  const kind = facadeKind(material);
  if ((!merged && kind === 0) || material.userData.bundFacadeDetail) return;
  material.userData.bundFacadeDetail = true;
  const previous = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${merged ? 'attribute float bundFacadeKind;' : ''}
        varying float vBundDetailKind;
        varying vec3 vBundDetailPosition;
        varying vec3 vBundDetailNormal;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vBundDetailNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBundDetailKind = ${merged ? 'bundFacadeKind' : `${kind}.`};
        vec4 bundDetailPosition = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          bundDetailPosition = instanceMatrix * bundDetailPosition;
        #endif
        vBundDetailPosition = (modelMatrix * bundDetailPosition).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vBundDetailKind;
        varying vec3 vBundDetailPosition;
        varying vec3 vBundDetailNormal;
        float bundDetailLine(float distance, float width, float aa) {
          return 1. - smoothstep(width, width + aa, abs(distance));
        }
        float bundDetailHash(vec2 cell) {
          return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bundWallNormal = normalize(vBundDetailNormal);
        float bundWall = 1. - smoothstep(.25, .72, abs(bundWallNormal.y));
        vec2 bundTangent = normalize(vec2(bundWallNormal.z, -bundWallNormal.x) + vec2(.00001));
        vec2 bundFace = vec2(dot(vBundDetailPosition.xz, bundTangent), vBundDetailPosition.y);
        float bundFootprint = max(length(dFdx(bundFace)), length(dFdy(bundFace)));
        float bundDetailFade = (1. - smoothstep(.30, 1.1, bundFootprint)) * bundWall;
        float bundAa = max(.002, bundFootprint * .55);
        if (vBundDetailKind > .5 && abs(vBundDetailKind - 2.) > .4) {
          bool bundBrick = vBundDetailKind > 2.5;
          vec2 bundBlockSize = bundBrick ? vec2(.65, .24) : vec2(1.6, .64);
          vec2 bundBlocks = bundFace / bundBlockSize;
          bundBlocks.x += mod(floor(bundBlocks.y), 2.) * .5;
          vec2 bundJointDistance = min(fract(bundBlocks), 1. - fract(bundBlocks)) * bundBlockSize;
          float bundJoint = max(bundDetailLine(bundJointDistance.x, .008, bundAa),
            bundDetailLine(bundJointDistance.y, .008, bundAa));
          float bundVariation = .96 + bundDetailHash(floor(bundBlocks)) * .08;
          diffuseColor.rgb *= mix(1., bundVariation, bundDetailFade);
          if (bundBrick) {
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + vec3(.025),
              bundJoint * bundDetailFade * .52);
          } else {
            diffuseColor.rgb *= 1. - bundJoint * bundDetailFade * .22;
            // Paired cornice lines and repeating diamond/fan relief stay on stone.
            float bundFloorY = mod(bundFace.y, 3.6);
            float bundCornice = max(bundDetailLine(bundFloorY - 3.06, .035, bundAa),
              bundDetailLine(bundFloorY - 3.20, .025, bundAa));
            vec2 bundMotif = vec2((fract(bundFace.x / 3.2) - .5) * 3.2, bundFloorY - 2.60);
            float bundDiamond = bundDetailLine(abs(bundMotif.x) * .38 + abs(bundMotif.y) - .18, .018, bundAa);
            float bundFan = max(bundDetailLine(bundMotif.x, .012, bundAa),
              max(bundDetailLine(bundMotif.x - bundMotif.y * 1.5, .012, bundAa),
                bundDetailLine(bundMotif.x + bundMotif.y * 1.5, .012, bundAa)));
            float bundFrieze = 1. - smoothstep(.18, .26 + bundAa, abs(bundMotif.y));
            float bundOrnament = max(bundDiamond, bundFan * .55) * bundFrieze
              * (1. - smoothstep(.43, .65 + bundAa, abs(bundMotif.x)));
            float bundReliefFade = (1. - smoothstep(.40, 1.25, bundFootprint)) * bundWall
              * smoothstep(1., 2., bundFace.y) * (1. - smoothstep(32., 48., bundFace.y));
            diffuseColor.rgb *= 1. - bundCornice * bundReliefFade * .23 - bundOrnament * bundReliefFade * .30;
          }
        } else if (abs(vBundDetailKind - 2.) < .4) {
          // Match the existing room-light grid: frame edges never cut through lit panes.
          vec2 bundPane = vec2((vBundDetailPosition.x + vBundDetailPosition.z) / 2.8,
            vBundDetailPosition.y / 3.6);
          vec2 bundPaneEdge = abs(fract(bundPane) - .5);
          vec2 bundPaneAa = max(fwidth(bundPane) * .55, vec2(.002));
          vec2 bundFrame = smoothstep(vec2(.43) - bundPaneAa, vec2(.47) + bundPaneAa, bundPaneEdge);
          float bundMullion = 1. - smoothstep(.012, .025 + bundPaneAa.x, bundPaneEdge.x);
          diffuseColor.rgb *= 1. - max(max(bundFrame.x, bundFrame.y), bundMullion * .5) * bundDetailFade * .46;
        }`,
      );
  };
  material.customProgramCacheKey = () => key + `:bund-relief-v1:${merged ? 'vertex' : kind}`;
  material.needsUpdate = true;
}
