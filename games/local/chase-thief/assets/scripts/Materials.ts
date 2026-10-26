import * as cc from 'cc';
import { installMaterials as installUI } from './UiMaterials.ts';

const CAMERA = [
  ['mat4', 'cc_matView'],
  ['mat4', 'cc_matViewInv'],
  ['mat4', 'cc_matProj'],
  ['mat4', 'cc_matProjInv'],
  ['mat4', 'cc_matViewProj'],
  ['mat4', 'cc_matViewProjInv'],
  ...[
    'cc_cameraPos',
    'cc_surfaceTransform',
    'cc_screenScale',
    'cc_exposure',
    'cc_mainLitDir',
    'cc_mainLitColor',
    'cc_ambientSky',
    'cc_ambientGround',
    'cc_fogColor',
    'cc_fogBase',
    'cc_fogAdd',
    'cc_nearFar',
    'cc_viewPort',
  ].map((n) => ['vec4', n]),
];
const LOCAL = [
  ['mat4', 'cc_matWorld'],
  ['mat4', 'cc_matWorldIT'],
  ...[
    'cc_lightingMapUVParam',
    'cc_localShadowBias',
    'cc_reflectionProbeData1',
    'cc_reflectionProbeData2',
    'cc_reflectionProbeBlendData1',
    'cc_reflectionProbeBlendData2',
  ].map((n) => ['vec4', n]),
];
function block(version, name, fields) {
  const lines = fields.map(([t, n]) => t + ' ' + n + ';').join('\n');
  return version === 3
    ? 'layout(std140) uniform ' + name + ' {\n' + lines + '\n};'
    : fields.map(([t, n]) => 'uniform ' + t + ' ' + n + ';').join('\n');
}
function source(version, textured, road) {
  const input = version === 3 ? 'in' : 'attribute';
  const vout = version === 3 ? 'out' : 'varying';
  const vin = version === 3 ? 'in' : 'varying';
  const vert = [
    'precision highp float;',
    block(version, 'CCCamera', CAMERA),
    block(version, 'CCLocal', LOCAL),
    input + ' vec3 a_position;',
    input + ' vec3 a_normal;',
    input + ' vec4 a_color;',
    input + ' vec2 a_texCoord;',
    vout + ' vec3 worldPos;',
    vout + ' vec3 worldNormal;',
    vout + ' vec4 tint;',
    vout + ' vec2 uv;',
    'void main(){vec4 p=cc_matWorld*vec4(a_position,1.0);worldPos=p.xyz;',
    'worldNormal=normalize(mat3(cc_matWorldIT)*a_normal);tint=a_color;uv=a_texCoord;',
    'gl_Position=cc_matViewProj*p;}',
  ].join('\n');
  const frag = [
    'precision highp float;',
    block(version, 'CCCamera', CAMERA),
    vin + ' vec3 worldPos;',
    vin + ' vec3 worldNormal;',
    vin + ' vec4 tint;',
    vin + ' vec2 uv;',
    textured ? 'uniform sampler2D mainTexture;' : '',
    version === 3 ? 'out vec4 fragColor;' : '',
    'float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'void main(){vec4 c=tint;',
    textured ? 'c*=' + (version === 3 ? 'texture' : 'texture2D') + '(mainTexture,uv);' : '',
    road
      ? [
          'vec2 grid=vec2(uv.x*1.45+mod(floor(uv.y*1.4),2.0)*.5,uv.y*1.4);',
          'vec2 f=fract(grid);float grout=smoothstep(0.0,.025,f.x)*smoothstep(0.0,.03,f.y)*smoothstep(0.0,.025,1.0-f.x)*smoothstep(0.0,.03,1.0-f.y);',
          'float detail=1.0-smoothstep(18.0,70.0,length(worldPos-cc_cameraPos.xyz));',
          'c.rgb*=mix(.96,mix(.87,.95+noise(floor(grid))*.07,grout),detail);',
        ].join('\n')
      : '',
    'vec3 n=normalize(worldNormal);float sun=max(0.0,dot(n,normalize(vec3(-.42,.80,-.35))));',
    'float sky=.67+.15*n.y;c.rgb*=vec3(sky)+sun*vec3(.46,.41,.34);',
    'float fog=smoothstep(48.0,155.0,length(worldPos-cc_cameraPos.xyz));',
    'c.rgb=mix(c.rgb,vec3(.65,.81,.88),fog*.88);',
    (version === 3 ? 'fragColor' : 'gl_FragColor') + '=c;}',
  ].join('\n');
  return { vert, frag };
}
let installed = false;
export function installMaterials() {
  if (installed) return;
  installed = true;
  installUI(cc);
  for (const [i, name] of ['city-solid', 'city-facade', 'city-road', 'city-shadow'].entries()) {
    const textured = i === 1;
    const program = 'chase/' + name;
    const effect = new cc.EffectAsset();
    effect.name = name;
    effect.techniques = [
      {
        passes: [
          {
            program,
            properties: textured ? { mainTexture: { value: 'white' } } : {},
            rasterizerState: { cullMode: cc.gfx.CullMode.NONE },
            depthStencilState: { depthTest: true, depthWrite: i !== 3 },
            blendState: {
              targets: [
                {
                  blend: i === 3,
                  blendSrc: cc.gfx.BlendFactor.SRC_ALPHA,
                  blendDst: cc.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                },
              ],
            },
          },
        ],
      },
    ] as any;
    effect.shaders = [
      {
        name: program,
        hash: 8845100 + i,
        glsl3: source(3, textured, i === 2),
        glsl1: source(1, textured, i === 2),
        builtins: {
          globals: {
            blocks: [{ name: 'CCCamera', defines: [] }],
            samplerTextures: [],
            buffers: [],
            images: [],
          },
          locals: {
            blocks: [{ name: 'CCLocal', defines: [] }],
            samplerTextures: [],
            buffers: [],
            images: [],
          },
          statistics: {},
        },
        defines: [],
        attributes: [
          { name: 'a_position', format: cc.gfx.Format.RGB32F, location: 0, defines: [] },
          { name: 'a_normal', format: cc.gfx.Format.RGB32F, location: 1, defines: [] },
          { name: 'a_color', format: cc.gfx.Format.RGBA32F, location: 2, defines: [] },
          { name: 'a_texCoord', format: cc.gfx.Format.RG32F, location: 3, defines: [] },
        ],
        blocks: [],
        samplerTextures: textured
          ? [
              {
                name: 'mainTexture',
                binding: 0,
                type: cc.gfx.Type.SAMPLER2D,
                count: 1,
                stageFlags: cc.gfx.ShaderStageFlagBit.FRAGMENT,
              },
            ]
          : [],
        buffers: [],
        images: [],
        textures: [],
        samplers: [],
        subpassInputs: [],
      },
    ] as any;
    effect.onLoaded();
  }
}
export function material(name: string, texture?: cc.Texture2D) {
  const m = new cc.Material();
  m.initialize({ effectName: name });
  if (texture) m.setProperty('mainTexture', texture);
  return m;
}
