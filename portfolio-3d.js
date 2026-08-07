let THREE;
let GLTFLoader;
let RoundedBoxGeometry;
let MeshoptDecoder;

const canvas = document.querySelector('#scene');
const kind = document.body.dataset.scene;
const pageLoader = document.querySelector('[data-page-loader]');
const loadPercent = pageLoader?.querySelector('[data-load-percent]');
const loadBar = pageLoader?.querySelector('[data-load-bar]');
const loadLabel = pageLoader?.querySelector('.page-loader__meta span');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (kind === 'hunyuan') {
  const sources = [
    'assets/hunyuan-vln/videos/global-path.mp4',
    'assets/hunyuan-vln/videos/local-avoidance.mp4',
    'assets/hunyuan-vln/videos/robot-fpv.mp4',
  ];
  document.querySelectorAll('.gallery img').forEach((image, index) => {
    if (!sources[index]) return;
    const video = document.createElement('video');
    video.src = sources[index];
    video.poster = image.getAttribute('src');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.autoplay = !reduceMotion;
    video.setAttribute('aria-label', image.alt);
    image.replaceWith(video);
  });
}

document.body.setAttribute('aria-busy', 'true');

const tasks = new Map();
const failures = [];

function addTask(id, weight = 1) {
  tasks.set(id, { value: 0, weight });
  updateProgress();
}

function setTask(id, value) {
  const task = tasks.get(id);
  if (!task) return;
  task.value = Math.max(task.value, Math.min(1, Math.max(0, value || 0)));
  updateProgress();
}

function updateProgress() {
  const entries = [...tasks.values()];
  const total = entries.reduce((sum, task) => sum + task.weight, 0) || 1;
  const done = entries.reduce((sum, task) => sum + task.value * task.weight, 0);
  const percent = Math.round(done / total * 100);
  if (loadPercent) loadPercent.value = `${percent}%`;
  if (loadBar) loadBar.style.transform = `scaleX(${percent / 100})`;
}

function finishLoading(fallback = false) {
  tasks.forEach((_, id) => setTask(id, 1));
  document.body.removeAttribute('aria-busy');
  document.body.classList.toggle('has-asset-fallback', fallback);
  if (loadLabel) loadLabel.textContent = fallback ? 'Ready · static fallback available' : 'Project ready';
  pageLoader?.classList.add('is-complete');
  setTimeout(() => { if (pageLoader) pageLoader.hidden = true; }, 500);
}

function track(id, promise) {
  return promise.catch((error) => {
    failures.push({ id, error });
    console.warn(`Asset unavailable: ${id}`, error);
    return null;
  }).finally(() => setTask(id, 1));
}

async function waitForImage(image) {
  if (!image.complete) {
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', () => reject(new Error(image.currentSrc || image.src)), { once: true });
    });
  }
  if (!image.naturalWidth) throw new Error(image.currentSrc || image.src);
  await image.decode?.().catch(() => {});
}

const modelSpecs = {
  sound: [
    { path: 'assets/visionvoice-3d/city-scene/model-web.glb', target: 7, position: [2.2, -1.25, 0], rotation: -.28, weight: 2 },
    { path: 'assets/visionvoice-3d/life-terminal/model-web.glb', target: 1.65, position: [-.15, 1.35, .7], rotation: .42, weight: 1.5 },
    { path: 'assets/visionvoice-3d/location-terminal/model-web.glb', target: 1.55, position: [4.25, 1.25, .35], rotation: -.65, weight: 1.5 },
  ],
  agent: [
    { path: 'assets/scene-redesign/embodied-agent-meshy-v3.glb', target: 7, position: [3.35, -1.05, 0], rotation: -.28, weight: 18 },
  ],
  hunyuan: [
    { path: 'assets/scene-redesign/hunyuan-vln-meshy.glb', target: 7, position: [2.35, -.9, 0], rotation: -.4, weight: 19 },
  ],
};

const panelSpecs = kind === 'sound' ? [
  ['final_pdf/imdt_assets/vision-object.jpg', [-1, 1.25, .55], [0, .42, -.025]],
  ['final_pdf/imdt_assets/vision-location.jpg', [-.72, -.62, .72], [0, .36, .025]],
  ['final_pdf/imdt_assets/vision-life-assistant.jpg', [5.1, 1.25, .25], [0, -.48, .025]],
  ['final_pdf/imdt_assets/vision-album.jpg', [4.82, -.62, .48], [0, -.42, -.025]],
] : [];

const imagePromises = [...document.images].map((image, index) => {
  const id = `image:${index}`;
  addTask(id, .75);
  return track(id, waitForImage(image));
});

for (const spec of modelSpecs[kind] || []) addTask(`model:${spec.path}`, spec.weight);
for (const [path] of panelSpecs) addTask(`texture:${path}`, .75);
addTask('render:first-frame', 1);

if (!canvas || !modelSpecs[kind]) {
  failures.push({ id: 'scene', error: new Error('Scene canvas or type is missing') });
  finishLoading(true);
} else {
  loadDependencies().then(boot).catch((error) => {
    failures.push({ id: 'scene', error });
    document.querySelector('.hero')?.classList.add('scene-fallback');
    console.error('3D scene unavailable; static project content remains accessible.', error);
    finishLoading(true);
  });
}

async function loadDependencies() {
  const [threeModule, loaderModule, geometryModule, meshoptModule] = await Promise.all([
    import('./assets/vendor/three/three.module.js'),
    import('./assets/vendor/three/GLTFLoader.js'),
    import('./assets/vendor/three/RoundedBoxGeometry.js'),
    import('./assets/vendor/three/meshopt_decoder.module.js'),
  ]);
  THREE = threeModule;
  GLTFLoader = loaderModule.GLTFLoader;
  RoundedBoxGeometry = geometryModule.RoundedBoxGeometry;
  MeshoptDecoder = meshoptModule.MeshoptDecoder;
}

async function boot() {
  const scene = new THREE.Scene();
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#07100d';
  scene.fog = new THREE.FogExp2(background, .035);

  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = kind === 'agent' ? .88 : 1.25;

  scene.add(new THREE.HemisphereLight(0xeaffdd, 0x07100d, kind === 'agent' ? 1.55 : 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, kind === 'agent' ? 1.9 : 3);
  sun.position.set(-4, 9, 7);
  scene.add(sun);

  const world = new THREE.Group();
  const generated = new THREE.Group();
  world.add(generated);
  scene.add(world);

  const addLine = (points, color) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    world.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .8 })));
  };

  if (kind === 'sound') {
    for (let index = 0; index < 7; index += 1) {
      const wave = new THREE.Mesh(
        new THREE.TorusGeometry(1.1 + index * .3, .014, 6, 100, Math.PI * 1.45),
        new THREE.MeshBasicMaterial({ color: index % 2 ? 0xffcf6d : 0x8fffe2, transparent: true, opacity: .42 - index * .04 }),
      );
      wave.position.set(2.35, .15, .2);
      wave.rotation.set(Math.PI / 2, .12 + index * .08, .45);
      world.add(wave);
    }
    [[-.5, 1.4, .6], [4.1, 1.55, .4], [.1, -.45, 1.25]].forEach((position, index) => {
      const color = index === 2 ? 0xffcf6d : 0x8fffe2;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 2), new THREE.MeshBasicMaterial({ color }));
      orb.position.set(...position);
      world.add(orb);
      addLine([new THREE.Vector3(...position), new THREE.Vector3(2.2, .1, 0)], color);
    });
  }

  const textureLoader = new THREE.TextureLoader();
  const texturePromises = panelSpecs.map(([path, position, rotation]) => {
    const group = new THREE.Group();
    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(1.08, 1.72, .075, 4, .055),
      new THREE.MeshStandardMaterial({ color: 0x09231f, metalness: .68, roughness: .2 }),
    );
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.98, 1.58), material);
    face.position.z = .041;
    group.add(frame, face);
    group.position.set(...position);
    group.rotation.set(...rotation);
    world.add(group);

    const id = `texture:${path}`;
    return track(id, textureLoader.loadAsync(path).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      material.map = texture;
      material.needsUpdate = true;
    }));
  });

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  function mount(spec) {
    const id = `model:${spec.path}`;
    return track(id, new Promise((resolve, reject) => {
      gltfLoader.load(spec.path, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = spec.target / Math.max(size.x, size.y, size.z);
        model.position.copy(center).multiplyScalar(-1);
        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = true;
        });
        const pivot = new THREE.Group();
        pivot.position.set(...spec.position);
        pivot.rotation.y = spec.rotation;
        pivot.scale.setScalar(scale);
        pivot.add(model);
        generated.add(pivot);
        resolve(pivot);
      }, (event) => {
        if (event.total) setTask(id, event.loaded / event.total);
      }, reject);
    }));
  }

  const modelPromises = (modelSpecs[kind] || []).map(mount);
  const controls = createControls(canvas, kind);
  const viewStates = kind === 'agent' ? {
    overview: { camera: [-10.2, 8.8, 10.6], look: [2.2, 0, 0], rotation: -.16, fov: 42 },
    robot: { camera: [5.55, -.92, 2.35], look: [2.45, -.92, -1.55], rotation: 0, fov: 62 },
    target: { camera: [6.1, 2.5, 4.8], look: [2.35, -.35, -.8], rotation: -.08, fov: 44 },
  } : kind === 'sound' ? {
    overview: { camera: [9, 7, 12], look: [1.2, .1, 0], rotation: -.08, fov: 38 },
    vision: { camera: [5.5, 3.2, 7.2], look: [2.2, .55, 1.55], rotation: -.18, fov: 38 },
    audio: { camera: [7.4, 5.4, 8.4], look: [2.15, .1, 0], rotation: .34, fov: 38 },
    interface: { camera: [6.1, 3.1, 7], look: [2.05, .85, .25], rotation: -.52, fov: 38 },
  } : {
    overview: { camera: [9.4, 6.8, 12.5], look: [1.5, .1, 0], rotation: -.26, fov: 41 },
  };

  let activeView = kind === 'agent' ? 'overview' : 'overview';
  let state = viewStates[activeView];
  const cameraGoal = new THREE.Vector3(...state.camera);
  const lookGoal = new THREE.Vector3(...state.look);
  const lookNow = lookGoal.clone();
  const displayCamera = cameraGoal.clone();
  let rotationGoal = state.rotation;
  let fovGoal = state.fov;
  let orbitYaw = 0;
  let orbitPitch = 0;
  let pointerX = 0;
  let pointerY = 0;
  let visible = true;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let responsiveDistance = 1;

  camera.position.copy(cameraGoal);
  camera.fov = fovGoal;
  camera.updateProjectionMatrix();

  const hint = controls?.hint;
  const setHint = (text) => { if (hint) hint.textContent = text; };
  const targetMarker = new THREE.Mesh(
    new THREE.SphereGeometry(.09, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a9ff72'), depthTest: false }),
  );
  targetMarker.visible = false;
  targetMarker.renderOrder = 10;
  world.add(targetMarker);

  function selectView(name) {
    const next = viewStates[name];
    if (!next) return;
    activeView = name;
    state = next;
    cameraGoal.set(...next.camera);
    lookGoal.set(...next.look);
    rotationGoal = next.rotation;
    fovGoal = next.fov;
    orbitYaw = 0;
    orbitPitch = 0;
    camera.near = name === 'robot' ? .85 : .1;
    camera.updateProjectionMatrix();
    controls?.buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    document.body.dataset.sceneView = name;
    if (controls?.drive) controls.drive.hidden = name !== 'robot';
    if (name !== 'target') targetMarker.visible = false;
    if (kind === 'agent') {
      setHint(name === 'robot'
        ? 'ROBOT POV / 使用 WASD、方向键或按钮移动'
        : name === 'target'
          ? 'TARGET VIEW / 点击场景中的物体建立斜上方特写'
          : 'OVERVIEW / 在场景上拖动鼠标旋转视角');
    }
  }

  controls?.buttons.forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view)));
  if (kind === 'agent') selectView('overview');

  const driveState = { forward: false, back: false, left: false, right: false };
  if (controls?.drive) {
    controls.drive.querySelectorAll('button').forEach((button) => {
      const direction = button.dataset.move;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        driveState[direction] = true;
        button.setPointerCapture(event.pointerId);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, () => { driveState[direction] = false; });
      }
    });
    const keyMap = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    addEventListener('keydown', (event) => {
      const direction = keyMap[event.code];
      if (!direction || !visible || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (activeView !== 'robot') selectView('robot');
      driveState[direction] = true;
      event.preventDefault();
    });
    addEventListener('keyup', (event) => {
      const direction = keyMap[event.code];
      if (direction) driveState[direction] = false;
    });
    addEventListener('blur', () => Object.keys(driveState).forEach((key) => { driveState[key] = false; }));
  }

  const raycaster = new THREE.Raycaster();
  const rayPoint = new THREE.Vector2();

  function selectTarget(event) {
    if (kind !== 'agent' || activeView !== 'target' || moved > 7) return;
    const rect = canvas.getBoundingClientRect();
    rayPoint.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(rayPoint, camera);
    const hit = raycaster.intersectObject(generated, true)[0];
    if (!hit) {
      setHint('TARGET VIEW / 未命中，请点击房间或物体表面');
      return;
    }
    world.updateMatrixWorld(true);
    targetMarker.position.copy(world.worldToLocal(hit.point.clone()));
    targetMarker.visible = true;
    lookGoal.copy(hit.point);
    cameraGoal.copy(hit.point).add(new THREE.Vector3(3.15, 2.35, 3.15));
    orbitYaw = 0;
    orbitPitch = 0;
    fovGoal = 42;
    setHint('TARGET LOCKED / 已从斜上方聚焦所选物体');
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!((kind === 'agent' && activeView !== 'robot') || kind === 'hunyuan')) return;
    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - .5;
    pointerY = (event.clientY - rect.top) / rect.height - .5;
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    orbitYaw -= dx * .006;
    orbitPitch = Math.max(-.65, Math.min(.65, orbitPitch + dy * .004));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', (event) => {
    selectTarget(event);
    dragging = false;
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('pointerleave', () => {
    if (!dragging) { pointerX = 0; pointerY = 0; }
  });

  const moveForward = new THREE.Vector3();
  const moveRight = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const spherical = new THREE.Spherical();
  const orbitOffset = new THREE.Vector3();
  const clock = new THREE.Clock();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    responsiveDistance = Math.max(1, .9 / camera.aspect);
    camera.updateProjectionMatrix();
  }

  function renderFrame() {
    resize();
    renderer.render(scene, camera);
    setTask('render:first-frame', 1);
  }

  function loop() {
    const delta = Math.min(.05, clock.getDelta());
    const snap = reduceMotion ? 1 : .08;

    if (kind === 'agent' && activeView === 'robot' && Object.values(driveState).some(Boolean)) {
      moveForward.subVectors(lookGoal, cameraGoal).setY(0).normalize();
      moveRight.crossVectors(moveForward, yAxis).normalize();
      moveDelta.set(0, 0, 0);
      if (driveState.forward) moveDelta.add(moveForward);
      if (driveState.back) moveDelta.sub(moveForward);
      if (driveState.right) moveDelta.add(moveRight);
      if (driveState.left) moveDelta.sub(moveRight);
      if (moveDelta.lengthSq()) {
        moveDelta.normalize().multiplyScalar(delta * 2.1);
        cameraGoal.add(moveDelta);
        lookGoal.add(moveDelta);
      }
    }

    displayCamera.copy(cameraGoal);
    if ((kind === 'agent' && activeView !== 'robot') || kind === 'sound') {
      orbitOffset.subVectors(cameraGoal, lookGoal);
      spherical.setFromVector3(orbitOffset);
      spherical.theta += orbitYaw;
      spherical.phi = Math.max(.28, Math.min(Math.PI - .28, spherical.phi + orbitPitch));
      displayCamera.copy(lookGoal).add(orbitOffset.setFromSpherical(spherical).multiplyScalar(responsiveDistance));
    } else if (kind === 'hunyuan') {
      displayCamera.copy(lookGoal).add(orbitOffset.subVectors(cameraGoal, lookGoal).multiplyScalar(responsiveDistance));
    }

    camera.position.lerp(displayCamera, snap);
    lookNow.lerp(lookGoal, reduceMotion ? 1 : .1);
    camera.lookAt(lookNow);
    camera.fov += (fovGoal - camera.fov) * snap;
    camera.updateProjectionMatrix();

    if (kind === 'sound') {
      world.rotation.y += (rotationGoal + pointerX * .1 - world.rotation.y) * snap;
      world.rotation.x += (pointerY * .035 - world.rotation.x) * snap;
    } else if (kind === 'agent') {
      world.rotation.y += (rotationGoal - world.rotation.y) * snap;
      world.rotation.x += (0 - world.rotation.x) * snap;
    } else {
      world.rotation.y += (rotationGoal + orbitYaw * .45 + pointerX * .05 - world.rotation.y) * snap;
      world.rotation.x += (-orbitPitch * .16 + pointerY * .02 - world.rotation.x) * snap;
    }

    if (visible) renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  resize();
  renderFrame();
  requestAnimationFrame(loop);
  addEventListener('resize', resize, { passive: true });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: '180px' }).observe(canvas);

  let timedOut = false;
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => { timedOut = true; resolve(); }, 45000);
  });
  await Promise.race([
    Promise.all([...imagePromises, ...texturePromises, ...modelPromises]),
    timeout,
  ]);
  clearTimeout(timeoutId);
  renderFrame();
  if (timedOut || failures.some(({ id }) => id.startsWith('model:'))) document.querySelector('.hero')?.classList.add('scene-fallback');
  finishLoading(timedOut || failures.length > 0);
}

function createControls(sceneCanvas, sceneKind) {
  if (sceneKind === 'hunyuan') {
    const hint = document.createElement('div');
    hint.className = 'scene-hint scene-hint--hunyuan';
    hint.textContent = 'DRAG TO ROTATE / 拖动查看模型';
    sceneCanvas.after(hint);
    return { buttons: [], hint, drive: null };
  }

  const controls = document.createElement('div');
  controls.className = 'scene-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', sceneKind === 'agent' ? 'Embodied agent camera viewpoints' : '3D 场景视角');
  controls.innerHTML = sceneKind === 'agent'
    ? '<button type="button" data-view="overview" aria-pressed="true">OVERVIEW</button><button type="button" data-view="robot" aria-pressed="false">ROBOT POV</button><button type="button" data-view="target" aria-pressed="false">TARGET VIEW</button>'
    : '<button type="button" data-view="overview" aria-pressed="true">全景</button><button type="button" data-view="vision" aria-pressed="false">视觉</button><button type="button" data-view="audio" aria-pressed="false">声场</button><button type="button" data-view="interface" aria-pressed="false">界面</button>';
  sceneCanvas.after(controls);

  const hint = document.createElement('div');
  hint.className = 'scene-hint';
  if (sceneKind === 'agent') hint.textContent = 'OVERVIEW / 在场景上拖动鼠标旋转视角';
  controls.after(hint);

  let drive = null;
  if (sceneKind === 'agent') {
    drive = document.createElement('div');
    drive.className = 'robot-drive';
    drive.setAttribute('role', 'group');
    drive.setAttribute('aria-label', 'Robot point-of-view movement controls');
    drive.innerHTML = '<button type="button" data-move="forward" aria-label="向前移动">↑</button><button type="button" data-move="left" aria-label="向左移动">←</button><button type="button" data-move="back" aria-label="向后移动">↓</button><button type="button" data-move="right" aria-label="向右移动">→</button><span>WASD / ARROWS · ROBOT POV</span>';
    hint.after(drive);
  }

  return { buttons: [...controls.querySelectorAll('[data-view]')], hint, drive };
}
