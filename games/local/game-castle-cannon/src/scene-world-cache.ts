import * as T from 'three';
/** Cache the fixed camera's actual 3D architecture, including depth. Never a concept backdrop. */
export class WorldCache {
  private key = '';
  private target: T.WebGLRenderTarget;
  private quadScene = new T.Scene();
  private camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  private capturing = false;
  private enabled: boolean;
  private modified = new Map<T.Material, [boolean, boolean]>();
  worldTriangles = 0;
  worldCalls = 0;
  constructor(
    private renderer: T.WebGLRenderer,
    private roots: T.Object3D[],
    cacheWorld = true,
  ) {
    this.enabled = cacheWorld && renderer.extensions.has('EXT_color_buffer_float');
    this.target = new T.WebGLRenderTarget(768, 432, {
      type: renderer.extensions.has('EXT_color_buffer_float')
        ? T.HalfFloatType
        : T.UnsignedByteType,
      depthTexture: new T.DepthTexture(768, 432, T.UnsignedIntType),
      samples: 4,
    });
    this.quad = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.ShaderMaterial({
        uniforms: {
          image: { value: this.target.texture },
          depth: { value: this.target.depthTexture },
        },
        vertexShader:
          'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: `uniform sampler2D image; uniform sampler2D depth; varying vec2 vUv;
        void main(){gl_FragColor=texture2D(image,vUv);gl_FragDepth=texture2D(depth,vUv).r;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
        depthTest: true,
        depthFunc: T.AlwaysDepth,
        depthWrite: true,
      }),
    );
    this.quadScene.add(this.quad);
  }
  registerDynamic(object: T.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof T.Mesh || child instanceof T.Line) || child.userData.cacheHook) return;
      child.userData.cacheHook = true;
      const before = child.onBeforeRender,
        after = child.onAfterRender;
      child.onBeforeRender = (...args) => {
        before.apply(child, args);
        if (!this.capturing) return;
        const material = args[4];
        this.modified.set(material, [material.colorWrite, material.depthWrite]);
        material.colorWrite = false;
        material.depthWrite = false;
      };
      child.onAfterRender = (...args) => {
        const material = args[4],
          state = this.modified.get(material);
        if (state) {
          [material.colorWrite, material.depthWrite] = state;
          this.modified.delete(material);
        }
        after.apply(child, args);
      };
    });
  }
  draw(scene: T.Scene, camera: T.PerspectiveCamera, key: string) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    const size = this.renderer.getSize(new T.Vector2()),
      background = scene.background;
    const samples = this.renderer.shadowMap.enabled ? 4 : 0;
    if (this.target.samples !== samples) {
      this.target.samples = samples;
      this.target.dispose();
      this.key = '';
    }
    if (size.x !== this.target.width || size.y !== this.target.height) {
      this.target.setSize(size.x, size.y);
      this.key = '';
    }
    if (
      this.key !== key ||
      (this.renderer.shadowMap.enabled && this.renderer.shadowMap.needsUpdate)
    ) {
      this.capturing = true;
      this.renderer.shadowMap.needsUpdate = this.renderer.shadowMap.enabled;
      this.renderer.setRenderTarget(this.target);
      try {
        this.renderer.render(scene, camera);
      } finally {
        this.capturing = false;
        for (const [material, state] of this.modified)
          [material.colorWrite, material.depthWrite] = state;
        this.modified.clear();
        this.renderer.setRenderTarget(null);
      }
      this.worldTriangles = this.renderer.info.render.triangles;
      this.worldCalls = this.renderer.info.render.calls;
      this.renderer.setRenderTarget(null);
      this.key = key;
    }
    scene.background = null;
    const autoClear = this.renderer.autoClear,
      visibility = this.roots.map((root) => root.visible);
    this.renderer.autoClear = false;
    try {
      this.renderer.clear();
      this.renderer.render(this.quadScene, this.camera);
      for (const root of this.roots) root.visible = false;
      this.renderer.render(scene, camera);
    } finally {
      this.roots.forEach((root, index) => {
        root.visible = visibility[index]!;
      });
      this.renderer.autoClear = autoClear;
      scene.background = background;
    }
  }
  dispose() {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
