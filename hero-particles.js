/**
 * One page-wide WebGL scene. It is a fixed visual layer behind the document:
 * scrolling content never changes the flow field, its composition, or opacity.
 */
const FLOW_VIEWBOX = Object.freeze({ width: 1600, height: 1120 });
const MAX_PIXEL_RATIO = 1.5;
const RESIZE_DEBOUNCE_MS = 160;
const FPS_SAMPLE_WINDOW_MS = 2_000;
const FPS_DEGRADE_THRESHOLD = 45;
const FPS_RECOVER_THRESHOLD = 55;
const FIBER_SEGMENTS = 72;
const PARTICLE_COUNT = 280;
const PARTICLE_DEGRADED_COUNT = 168;
const GLOBAL_FLOW_SETTINGS = Object.freeze({
  verticalScale: 1.24,
  coreStrength: 0.82,
  fanScale: 0.88,
});

const flowRoot = document.documentElement;
const flowMount = document.querySelector("[data-flow-webgl]");
const flowVisibilityTargets = [
  document.querySelector("#main-content"),
  document.querySelector(".site-footer"),
].filter(Boolean);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// Queue initialization so the shared GLSL field is fully defined first.
queueMicrotask(() => {
  if (flowMount && flowVisibilityTargets.length && window.THREE) initializeFlowScene();
});

function initializeFlowScene() {
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
  } catch {
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
  camera.position.z = 1;
  const flowUniforms = createFlowUniforms();
  const ribbonLayers = [
    createRibbonLayer(20, 15, 0.028, 0.65, flowUniforms),
    createRibbonLayer(46, 3.6, 0.105, 1.25, flowUniforms),
    createRibbonLayer(132, 0.82, 0.205, 1.72, flowUniforms),
  ];
  const particles = createParticles(PARTICLE_COUNT, flowUniforms);

  ribbonLayers.forEach(({ mesh }) => scene.add(mesh));
  scene.add(particles.points);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  flowMount.append(renderer.domElement);
  flowRoot.classList.add("webgl-flow-ready");

  let animationFrame = 0;
  let resizeTimer = 0;
  let running = false;
  let destroyed = false;
  let stageVisible = isAnyFlowTargetInViewport();
  let sampleStartedAt = null;
  let sampledFrames = 0;
  let isDegraded = false;
  const parallaxTarget = new THREE.Vector2();
  const parallaxCurrent = new THREE.Vector2();

  flowUniforms.uVerticalScale.value = GLOBAL_FLOW_SETTINGS.verticalScale;
  flowUniforms.uCoreStrength.value = GLOBAL_FLOW_SETTINGS.coreStrength;
  flowUniforms.uFanScale.value = GLOBAL_FLOW_SETTINGS.fanScale;

  function applyTheme(theme = flowRoot.dataset.theme) {
    const isDark = theme === "dark";
    const color = isDark ? "#CCFF00" : "#36542C";
    const themeOpacity = isDark ? 1 : 0.42;
    const blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

    ribbonLayers.forEach(({ material }) => {
      material.uniforms.uColor.value.set(color);
      material.uniforms.uThemeOpacity.value = themeOpacity;
      material.blending = blending;
      material.needsUpdate = true;
    });
    particles.material.uniforms.uColor.value.set(color);
    particles.material.uniforms.uThemeOpacity.value = isDark ? 0.8 : 0.3;
    particles.material.blending = blending;
    particles.material.needsUpdate = true;
    renderStill();
  }

  function resizeRenderer() {
    const bounds = flowMount.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(bounds.width, bounds.height, false);
    camera.left = -bounds.width / bounds.height / 2;
    camera.right = bounds.width / bounds.height / 2;
    camera.updateProjectionMatrix();

    const cover = Math.max(bounds.width / FLOW_VIEWBOX.width, bounds.height / FLOW_VIEWBOX.height);
    const flowWidth = (FLOW_VIEWBOX.width * cover) / bounds.height;
    const flowHeight = (FLOW_VIEWBOX.height * cover) / bounds.height;
    flowUniforms.uFlowOrigin.value.set(camera.right - flowWidth, flowHeight / 2);
    flowUniforms.uFlowSize.value.set(flowWidth, flowHeight);
    flowUniforms.uWorldPerPixel.value = 1 / bounds.height;
    flowUniforms.uPixelRatio.value = pixelRatio;
    renderStill();
  }

  function scheduleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resizeRenderer, RESIZE_DEBOUNCE_MS);
  }

  function renderScene() {
    renderer.render(scene, camera);
  }

  function renderStill() {
    if (!stageVisible || document.hidden) return;
    flowUniforms.uTime.value = 0;
    renderScene();
  }

  function setDegraded(nextDegraded) {
    if (isDegraded === nextDegraded) return;
    isDegraded = nextDegraded;
    ribbonLayers.forEach(({ geometry, count }) => {
      const visibleFibers = nextDegraded ? Math.ceil(count * 0.62) : count;
      geometry.setDrawRange(0, visibleFibers * FIBER_SEGMENTS * 6);
    });
    particles.geometry.setDrawRange(0, nextDegraded ? PARTICLE_DEGRADED_COUNT : PARTICLE_COUNT);
  }

  function sampleFrameRate(now) {
    if (sampleStartedAt === null) {
      sampleStartedAt = now;
      sampledFrames = 0;
      return;
    }
    sampledFrames += 1;
    const elapsed = now - sampleStartedAt;
    if (elapsed < FPS_SAMPLE_WINDOW_MS) return;
    const fps = (sampledFrames * 1000) / elapsed;
    if (fps < FPS_DEGRADE_THRESHOLD) setDegraded(true);
    if (fps >= FPS_RECOVER_THRESHOLD) setDegraded(false);
    sampleStartedAt = now;
    sampledFrames = 0;
  }

  function renderFrame(now) {
    if (!running) return;
    parallaxCurrent.lerp(parallaxTarget, 0.045);
    flowUniforms.uParallax.value.copy(parallaxCurrent);
    flowUniforms.uTime.value = now;
    renderScene();
    sampleFrameRate(now);
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function startRendering() {
    if (running || !stageVisible || document.hidden || reducedMotionQuery.matches) return;
    running = true;
    sampleStartedAt = null;
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  function stopRendering() {
    running = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function syncRenderingState() {
    if (stageVisible && !document.hidden && !reducedMotionQuery.matches) {
      startRendering();
    } else {
      stopRendering();
      renderStill();
    }
  }

  function isAnyFlowTargetInViewport() {
    return flowVisibilityTargets.some((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight;
    });
  }

  const visibilityState = new Map(flowVisibilityTargets.map((element) => [element, false]));
  const visibilityObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        visibilityState.set(entry.target, entry.isIntersecting);
      });
      stageVisible = [...visibilityState.values()].some(Boolean);
      syncRenderingState();
    }, { threshold: 0 })
    : null;

  function handlePointerMove(event) {
    const bounds = flowMount.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    parallaxTarget.set(
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      -((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    );
  }

  function handleMotionChange() {
    parallaxTarget.set(0, 0);
    parallaxCurrent.set(0, 0);
    syncRenderingState();
  }

  function handlePageHide(event) {
    if (!event.persisted) destroy();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopRendering();
    window.clearTimeout(resizeTimer);
    visibilityObserver?.disconnect();
    window.removeEventListener("resize", scheduleResize);
    window.removeEventListener("scroll", syncViewportFallback);
    document.removeEventListener("visibilitychange", syncRenderingState);
    window.removeEventListener("fluxtech:themechange", handleThemeChange);
    window.removeEventListener("pagehide", handlePageHide);
    reducedMotionQuery.removeEventListener?.("change", handleMotionChange);
    reducedMotionQuery.removeListener?.(handleMotionChange);
    window.removeEventListener("pointermove", handlePointerMove);
    ribbonLayers.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
    particles.geometry.dispose();
    particles.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
    flowRoot.classList.remove("webgl-flow-ready");
  }

  function syncViewportFallback() {
    stageVisible = isAnyFlowTargetInViewport();
    syncRenderingState();
  }

  function handleThemeChange(event) {
    applyTheme(event.detail?.theme);
  }

  window.addEventListener("resize", scheduleResize, { passive: true });
  document.addEventListener("visibilitychange", syncRenderingState);
  window.addEventListener("fluxtech:themechange", handleThemeChange);
  window.addEventListener("pagehide", handlePageHide);
  reducedMotionQuery.addEventListener?.("change", handleMotionChange);
  reducedMotionQuery.addListener?.(handleMotionChange);
  if (visibilityObserver) flowVisibilityTargets.forEach((element) => visibilityObserver.observe(element));
  else window.addEventListener("scroll", syncViewportFallback, { passive: true });
  if (window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
  }

  syncViewportFallback();
  resizeRenderer();
  applyTheme();
  syncRenderingState();
}

function createFlowUniforms() {
  return {
    uTime: { value: 0 },
    uFlowOrigin: { value: new THREE.Vector2(-0.7, 0.5) },
    uFlowSize: { value: new THREE.Vector2(1.6, 1.12) },
    uWorldPerPixel: { value: 0.001 },
    uPixelRatio: { value: 1 },
    uParallax: { value: new THREE.Vector2() },
    uVerticalScale: { value: GLOBAL_FLOW_SETTINGS.verticalScale },
    uCoreStrength: { value: GLOBAL_FLOW_SETTINGS.coreStrength },
    uFanScale: { value: GLOBAL_FLOW_SETTINGS.fanScale },
  };
}

// This exact field is inserted into both ribbon and particle vertex shaders.
const FLOW_FIELD_GLSL = `
  uniform float uVerticalScale;
  uniform float uFanScale;

  vec2 cubic(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
    float r = 1.0 - t;
    return r * r * r * a + 3.0 * r * r * t * b + 3.0 * r * t * t * c + t * t * t * d;
  }

  float hash11(float value) {
    return fract(sin(value * 91.733) * 43758.5453123);
  }

  vec2 flowSpine(float t) {
    // The spine follows the raster reference: a tight right-side convergence,
    // a deliberate counter-bend, then a broad lower-left release. The endpoints
    // remain outside the frame so responsive crops never expose a hard start.
    if (t < 0.28) {
      return cubic(vec2(1.780, 0.080), vec2(1.450, 0.080), vec2(1.000, 0.220), vec2(0.850, 0.360), t / 0.28);
    }
    if (t < 0.62) {
      return cubic(vec2(0.850, 0.360), vec2(0.700, 0.480), vec2(1.080, 0.550), vec2(0.840, 0.640), (t - 0.28) / 0.34);
    }
    return cubic(vec2(0.840, 0.640), vec2(0.620, 0.720), vec2(0.000, 0.900), vec2(-0.720, 1.120), (t - 0.62) / 0.38);
  }

  vec2 flowPoint(float t, float lane, float seed) {
    vec2 point = flowSpine(t);
    float delta = 0.0025;
    vec2 tangent = normalize(flowSpine(min(1.0, t + delta)) - flowSpine(max(0.0, t - delta)));
    vec2 normal = vec2(-tangent.y, tangent.x);
    float fan = mix(0.001, 0.215, pow(t, 0.86)) * uFanScale;
    float weave = sin(t * 4.4 + seed * 8.0) * 0.0038 * pow(t, 1.8);
    float offset = lane * fan + weave * (0.45 + hash11(seed) * 0.55);
    return point + normal * offset;
  }

  vec2 flowToWorld(vec2 flowPoint, vec2 origin, vec2 size, vec2 parallax) {
    flowPoint.y *= uVerticalScale;
    return origin + vec2(flowPoint.x * size.x, -flowPoint.y * size.y) + parallax * vec2(0.011, 0.007);
  }
`;

function createRibbonLayer(count, widthPx, opacity, density, flowUniforms) {
  const geometry = createRibbonGeometry(count, density);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      ...flowUniforms,
      uColor: { value: new THREE.Color("#36542C") },
      uThemeOpacity: { value: 0.42 },
      uWidthPx: { value: widthPx },
      uLayerOpacity: { value: opacity },
    },
    vertexShader: `
      attribute float aT;
      attribute float aSide;
      attribute float aLane;
      attribute float aSeed;
      uniform vec2 uFlowOrigin;
      uniform vec2 uFlowSize;
      uniform vec2 uParallax;
      uniform float uWorldPerPixel;
      uniform float uWidthPx;
      varying float vSide;
      varying float vProgress;
      ${FLOW_FIELD_GLSL}
      void main() {
        vec2 fieldPoint = flowPoint(aT, aLane, aSeed);
        vec2 before = flowPoint(max(0.0, aT - 0.003), aLane, aSeed);
        vec2 after = flowPoint(min(1.0, aT + 0.003), aLane, aSeed);
        vec2 tangent = normalize(after - before);
        vec2 normal = vec2(-tangent.y, tangent.x);
        float width = uWidthPx * uWorldPerPixel * (0.72 + hash11(aSeed + 4.0) * 0.56);
        vec2 world = flowToWorld(fieldPoint, uFlowOrigin, uFlowSize, uParallax);
        world += normal * aSide * width;
        vSide = aSide;
        vProgress = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uThemeOpacity;
      uniform float uLayerOpacity;
      uniform float uCoreStrength;
      uniform float uTime;
      varying float vSide;
      varying float vProgress;
      void main() {
        float edge = 1.0 - smoothstep(0.22, 1.0, abs(vSide));
        float trace = 0.90 + 0.10 * sin(vProgress * 16.0 - uTime * 0.00052);
        float convergence = mix(1.0, 0.55 + 0.75 * (1.0 - smoothstep(0.0, 0.36, vProgress)), uCoreStrength);
        float entry = smoothstep(0.02, 0.30, vProgress);
        float alpha = edge * trace * convergence * entry * uLayerOpacity * uThemeOpacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  return { count, geometry, material, mesh: new THREE.Mesh(geometry, material) };
}

function createRibbonGeometry(instanceCount, density) {
  const verticesPerFiber = FIBER_SEGMENTS * 6;
  const vertexCount = instanceCount * verticesPerFiber;
  const positions = new Float32Array(vertexCount * 3);
  const progress = new Float32Array(vertexCount);
  const sides = new Float32Array(vertexCount);
  const lanes = new Float32Array(vertexCount);
  const seeds = new Float32Array(vertexCount);
  let vertex = 0;

  const writeVertex = (t, side, lane, seed) => {
    progress[vertex] = t;
    sides[vertex] = side;
    lanes[vertex] = lane;
    seeds[vertex] = seed;
    vertex += 1;
  };

  for (let index = 0; index < instanceCount; index += 1) {
    const random = deterministicRandom(index * 2.17 + density * 19.3);
    const signed = random * 2 - 1;
    const lane = Math.sign(signed) * Math.pow(Math.abs(signed), density);
    const seed = deterministicRandom(index * 6.31 + density * 7.7);
    for (let step = 0; step < FIBER_SEGMENTS; step += 1) {
      const t0 = step / FIBER_SEGMENTS;
      const t1 = (step + 1) / FIBER_SEGMENTS;
      writeVertex(t0, 1, lane, seed);
      writeVertex(t0, -1, lane, seed);
      writeVertex(t1, 1, lane, seed);
      writeVertex(t0, -1, lane, seed);
      writeVertex(t1, -1, lane, seed);
      writeVertex(t1, 1, lane, seed);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aT", new THREE.BufferAttribute(progress, 1));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute("aLane", new THREE.BufferAttribute(lanes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setDrawRange(0, vertexCount);
  return geometry;
}

function createParticles(count, flowUniforms) {
  const positions = new Float32Array(count * 3);
  const progress = new Float32Array(count);
  const lanes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const random = deterministicRandom(index * 8.93);
    const signed = deterministicRandom(index * 4.29 + 3) * 2 - 1;
    progress[index] = random;
    lanes[index] = Math.sign(signed) * Math.pow(Math.abs(signed), 1.7);
    seeds[index] = deterministicRandom(index * 1.77 + 11);
    sizes[index] = 1.1 + deterministicRandom(index * 2.51 + 4) * 1.9;
    speeds[index] = 0.42 + deterministicRandom(index * 5.73 + 2) * 0.72;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aProgress", new THREE.BufferAttribute(progress, 1));
  geometry.setAttribute("aLane", new THREE.BufferAttribute(lanes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setDrawRange(0, count);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      ...flowUniforms,
      uColor: { value: new THREE.Color("#36542C") },
      uThemeOpacity: { value: 0.3 },
    },
    vertexShader: `
      attribute float aProgress;
      attribute float aLane;
      attribute float aSeed;
      attribute float aSize;
      attribute float aSpeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uFlowOrigin;
      uniform vec2 uFlowSize;
      uniform vec2 uParallax;
      varying float vEnergy;
      varying float vProgress;
      ${FLOW_FIELD_GLSL}
      void main() {
        float t = fract(aProgress + uTime * 0.000055 * aSpeed);
        vec2 point = flowPoint(t, aLane, aSeed);
        vec2 before = flowPoint(max(0.0, t - 0.004), aLane, aSeed);
        vec2 after = flowPoint(min(1.0, t + 0.004), aLane, aSeed);
        vec2 normal = vec2(-normalize(after - before).y, normalize(after - before).x);
        float dissipation = smoothstep(0.72, 1.0, t) * (hash11(aSeed + 8.0) - 0.5) * 0.026;
        point += normal * dissipation;
        vec2 world = flowToWorld(point, uFlowOrigin, uFlowSize, uParallax);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.01, 1.0);
        gl_PointSize = aSize * uPixelRatio * (1.08 + smoothstep(0.0, 0.6, t) * 0.92);
        vEnergy = 0.5 + 0.5 * sin(t * 31.0 + aSeed * 18.0);
        vProgress = t;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uThemeOpacity;
      varying float vEnergy;
      varying float vProgress;
      void main() {
        float radius = distance(gl_PointCoord, vec2(0.5));
        float halo = smoothstep(0.5, 0.08, radius) * 0.30;
        float core = smoothstep(0.20, 0.0, radius);
        float entry = smoothstep(0.02, 0.30, vProgress);
        float alpha = (halo + core) * (0.38 + vEnergy * 0.62) * entry * uThemeOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  return { geometry, material, points: new THREE.Points(geometry, material) };
}

function deterministicRandom(value) {
  const sine = Math.sin(value * 12.9898) * 43758.5453;
  return sine - Math.floor(sine);
}
