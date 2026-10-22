// Original game-authored shaders for the official Cocos 3.8.8 runtime.
// Uniform layouts match Cocos' camera/local rendering ABI.
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
  ].map((name) => ['vec4', name]),
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
  ].map((name) => ['vec4', name]),
];
function uniforms(version, name, fields) {
  return version === 3
    ? `layout(std140) uniform ${name} {\n${fields.map(([type, n]) => `${type} ${n};`).join('\n')}\n};`
    : fields.map(([type, n]) => `uniform ${type} ${n};`).join('\n');
}
function source(version, geometry = false) {
  const a = version === 3 ? 'in' : 'attribute',
    v = version === 3 ? 'out' : 'varying',
    f = version === 3 ? 'in' : 'varying';
  const vert = `precision highp float;\n${uniforms(version, 'CCCamera', CAMERA)}\n#if USE_LOCAL\n${uniforms(version, 'CCLocal', LOCAL)}\n#endif\n${a} vec3 a_position;\n${a} vec4 a_color;\n${geometry ? '' : `${a} vec2 a_texCoord;\n${v} vec2 uv0;`}\n${v} vec4 color;\nvoid main(){\nvec4 p=vec4(a_position,1.0);\n#if USE_LOCAL\np=cc_matWorld*p;\n#endif\ngl_Position=cc_matViewProj*p;\ncolor=a_color;\n${geometry ? '' : 'uv0=a_texCoord;'}\n}`;
  const frag = `precision highp float;\n${f} vec4 color;\n${geometry ? '' : `${f} vec2 uv0;\n#if USE_TEXTURE\nuniform sampler2D cc_spriteTexture;\n#endif`}\n${version === 3 ? 'out vec4 fragColor;' : ''}\nvoid main(){\nvec4 o=color;\n${geometry ? '' : `#if USE_TEXTURE\no*=${version === 3 ? 'texture' : 'texture2D'}(cc_spriteTexture,uv0);\n#endif`}\n${version === 3 ? 'fragColor' : 'gl_FragColor'}=o;\n}`;
  return { vert, frag };
}
export function installMaterials(cc) {
  let hash = 68350880;
  function effect(name, geometry = false, techniques = 1) {
    const program = `orbit/${name}`;
    const pass = {
      program,
      blendState: {
        targets: [
          {
            blend: true,
            blendSrc: cc.gfx.BlendFactor.SRC_ALPHA,
            blendDst: cc.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
            blendSrcAlpha: cc.gfx.BlendFactor.ONE,
            blendDstAlpha: cc.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          },
        ],
      },
      rasterizerState: { cullMode: cc.gfx.CullMode.NONE },
      depthStencilState: { depthTest: false, depthWrite: false },
    };
    const e = new cc.EffectAsset();
    e.name = name;
    e.techniques = Array.from({ length: techniques }, () => ({
      passes: [JSON.parse(JSON.stringify(pass))],
    }));
    e.shaders = [
      {
        name: program,
        hash: hash++,
        glsl3: source(3, geometry),
        glsl1: source(1, geometry),
        builtins: {
          globals: {
            blocks: [{ name: 'CCCamera', defines: [] }],
            samplerTextures: [],
            buffers: [],
            images: [],
          },
          locals: {
            blocks: [{ name: 'CCLocal', defines: ['USE_LOCAL'] }],
            samplerTextures: geometry
              ? []
              : [{ name: 'cc_spriteTexture', defines: ['USE_TEXTURE'] }],
            buffers: [],
            images: [],
          },
          statistics: {},
        },
        defines: [
          { name: 'USE_LOCAL', type: 'boolean' },
          { name: 'USE_TEXTURE', type: 'boolean' },
        ],
        attributes: [
          { name: 'a_position', defines: [], format: cc.gfx.Format.RGB32F, location: 0 },
          ...(geometry
            ? []
            : [{ name: 'a_texCoord', defines: [], format: cc.gfx.Format.RG32F, location: 1 }]),
          { name: 'a_color', defines: [], format: cc.gfx.Format.RGBA8, location: 2 },
        ],
        blocks: [],
        samplerTextures: [],
        buffers: [],
        images: [],
        textures: [],
        samplers: [],
        subpassInputs: [],
      },
    ];
    e.onLoaded();
    return e;
  }
  const spriteEffect = effect('orbit-ui'),
    graphicsEffect = effect('orbit-graphics', true);
  // The forward pipeline creates these optional debugging materials at startup.
  // These are actual shader programs; gameplay leaves debug drawing disabled.
  effect('internal/builtin-geometry-renderer', true, 6);
  effect('internal/builtin-occlusion-query', true);
  for (const name of [
    'ui-base-material',
    'ui-sprite-material',
    'ui-sprite-gray-material',
    'ui-sprite-alpha-sep-material',
    'ui-sprite-gray-alpha-sep-material',
    'ui-graphics-material',
  ]) {
    const mat = new cc.Material();
    mat.name = name;
    mat.initialize({
      effectAsset: name === 'ui-graphics-material' ? graphicsEffect : spriteEffect,
      defines: {
        USE_TEXTURE: name !== 'ui-base-material' && name !== 'ui-graphics-material',
        USE_LOCAL: name === 'ui-graphics-material',
      },
    });
    cc.builtinResMgr.addAsset(name, mat);
  }
  // MaskComponent clears its stencil using a clip-space quad (position-only mesh).
  // Register the real shader rather than reusing the UI shader's camera/color inputs.
  const clear = new cc.EffectAsset();
  const program = 'flick/clear-stencil';
  clear.name = program;
  clear.techniques = [
    {
      passes: [
        {
          program,
          blendState: { targets: [{ blend: false, blendColorMask: cc.gfx.ColorMask.NONE }] },
          rasterizerState: { cullMode: cc.gfx.CullMode.NONE },
          depthStencilState: { depthTest: false, depthWrite: false },
        },
      ],
    },
  ];
  clear.shaders = [
    {
      name: program,
      hash: hash++,
      glsl3: {
        vert: 'precision highp float; in vec3 a_position; void main(){gl_Position=vec4(a_position,1.0);}',
        frag: 'precision highp float; out vec4 fragColor; void main(){fragColor=vec4(0.0);}',
      },
      glsl1: {
        vert: 'precision highp float; attribute vec3 a_position; void main(){gl_Position=vec4(a_position,1.0);}',
        frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
      },
      builtins: {
        globals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
        locals: { blocks: [], samplerTextures: [], buffers: [], images: [] },
        statistics: {},
      },
      defines: [],
      attributes: [{ name: 'a_position', defines: [], format: cc.gfx.Format.RGB32F, location: 0 }],
      blocks: [],
      samplerTextures: [],
      buffers: [],
      images: [],
      textures: [],
      samplers: [],
      subpassInputs: [],
    },
  ];
  clear.onLoaded();
  const stencil = new cc.Material();
  stencil.name = 'default-clear-stencil';
  stencil.initialize({ effectAsset: clear });
  cc.builtinResMgr.addAsset(stencil.name, stencil);
}
