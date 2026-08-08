import './visitor-log.js';
import * as THREE from './assets/vendor/three/three.module.js';
import { GLTFLoader } from './assets/vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from './assets/vendor/three/meshopt_decoder.module.js';
import { CASTLE_CHAPTERS } from './castle-scroll.js?v=aligned-1';

const worldElement = document.querySelector('.castle-world');
const stage = document.querySelector('.castle-world__stage');
const canvas = document.querySelector('#castle-scene');
const uiRoot = document.querySelector('#castle-ui-root');
const backdrop = document.querySelector('.castle-world__backdrop');

if (worldElement && stage && canvas && uiRoot) boot().catch(showFatalError);

async function boot() {
  const response = await fetch('./castle-portfolio-fragment.html?v=city-1');
  if (!response.ok) throw new Error(`UI request failed: ${response.status}`);
  uiRoot.innerHTML = await response.text();

  const ui = uiRoot.querySelector('[data-castle-ui]');
  const loading = uiRoot.querySelector('[data-castle-loading]');
  const loadingText = loading?.querySelector('small');
  const current = uiRoot.querySelector('[data-castle-current]');
  const chapters = [...uiRoot.querySelectorAll('[data-castle-chapter]')];
  const links = [...uiRoot.querySelectorAll('[data-castle-jump]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = createCity(canvas, reduced);
  let active = -1;
  let scrollRaf = 0;
  let journeyRaf = 0;

  const loadingTimeout = setTimeout(() => { if (loading) loading.hidden = true; }, 8000);
  scene.loadModel((loaded, total) => {
    if (!loadingText) return;
    const percent = total ? Math.round(loaded / total * 100) : null;
    loadingText.textContent = percent === null ? 'Enhancing city detail…' : `Enhancing city detail… ${percent}%`;
  }).then(() => {
    clearTimeout(loadingTimeout);
    if (loading) loading.hidden = true;
  }).catch((error) => {
    clearTimeout(loadingTimeout);
    console.warn('Detailed city model unavailable; interactive built-in city remains active.', error);
    if (loading) loading.hidden = true;
  });

  function setChapter(chapter) {
    if (chapter.index === active) return;
    active = chapter.index;
    ui.dataset.activeChapter = String(active);
    chapters.forEach((node, index) => node.classList.toggle('is-active', index === active));
    links.forEach((link, index) => {
      link.classList.toggle('is-active', index === active);
      if (index === active) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    if (current) current.textContent = String(active).padStart(2, '0');
  }

  function chapterAt(progress) {
    let chapter = CASTLE_CHAPTERS[0];
    for (const item of CASTLE_CHAPTERS) {
      if (progress >= item.start) chapter = item;
      else break;
    }
    return chapter;
  }

  function read() {
    const max = Math.max(1, worldElement.offsetHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, (scrollY - worldElement.offsetTop) / max));
    scene.setProgress(progress);
    ui.style.setProperty('--castle-progress', `${progress * 100}%`);
    backdrop?.style.setProperty('--castle-bg-y', `${progress * -4}vh`);
    setChapter(chapterAt(progress));
    const past = scrollY > worldElement.offsetTop + worldElement.offsetHeight;
    stage.classList.toggle('is-past', past);
    ui.classList.toggle('is-past', past);
    scene.setVisible(!past);
  }

  function jump(index) {
    const max = Math.max(1, worldElement.offsetHeight - innerHeight);
    scrollTo({
      top: worldElement.offsetTop + CASTLE_CHAPTERS[index].start * max + 2,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  function stopJourney() {
    cancelAnimationFrame(journeyRaf);
    journeyRaf = 0;
  }

  function playJourney() {
    if (reduced) return jump(CASTLE_CHAPTERS.length - 1);
    stopJourney();
    const top = worldElement.offsetTop;
    const distance = Math.max(1, worldElement.offsetHeight - innerHeight);
    const started = performance.now();
    scrollTo({ top, behavior: 'auto' });
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / 18000);
      scrollTo(0, top + progress * distance);
      if (progress < 1) journeyRaf = requestAnimationFrame(frame);
      else stopJourney();
    };
    journeyRaf = requestAnimationFrame(frame);
  }

  uiRoot.addEventListener('click', (event) => {
    const play = event.target.closest('[data-castle-play]');
    if (play) {
      event.preventDefault();
      playJourney();
      return;
    }
    const anchor = event.target.closest('a[href^="#castle-"]');
    if (!anchor) return;
    event.preventDefault();
    stopJourney();
    if (anchor.classList.contains('castle-ui__skip')) {
      scrollTo({ top: worldElement.offsetHeight, behavior: 'smooth' });
      return;
    }
    const index = CASTLE_CHAPTERS.findIndex((item) => anchor.getAttribute('href') === `#castle-${item.id}`);
    if (index >= 0) jump(index);
  });

  addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      read();
    });
  }, { passive: true });
  addEventListener('wheel', stopJourney, { passive: true });
  addEventListener('touchstart', stopJourney, { passive: true });
  addEventListener('pagehide', () => {
    cancelAnimationFrame(scrollRaf);
    stopJourney();
    scene.dispose();
  }, { once: true });
  read();
}

function createCity(sceneCanvas, reduced) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05051d, .038);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene.add(new THREE.HemisphereLight(0xbcc7ff, 0x08051d, 2.8));
  const sun = new THREE.DirectionalLight(0xffd8f1, 3.4);
  sun.position.set(-6, 10, 8);
  scene.add(sun);

  const city = new THREE.Group();
  scene.add(city);
  const builtIn = buildProceduralCity();
  city.add(builtIn);

  let progress = 0;
  let yaw = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let visible = true;
  let disposed = false;

  sceneCanvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    sceneCanvas.setPointerCapture(event.pointerId);
  });
  sceneCanvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * .006;
    pitch = Math.max(-.5, Math.min(.55, pitch + (event.clientY - lastY) * .004));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = () => { dragging = false; };
  sceneCanvas.addEventListener('pointerup', endDrag);
  sceneCanvas.addEventListener('pointercancel', endDrag);

  const look = new THREE.Vector3(0, .35, 0);
  const clock = new THREE.Clock();

  function resize() {
    const rect = sceneCanvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }

  function frame() {
    if (disposed) return;
    const time = clock.getElapsedTime();
    if (visible && !document.hidden) {
      resize();
      const theta = .72 - progress * 1.55 + yaw + (reduced ? 0 : Math.sin(time * .09) * .04);
      const radius = 14.5 - Math.sin(progress * Math.PI) * 2.2;
      const height = 6.6 + Math.sin(progress * Math.PI * 2) * 1.2 + pitch * 5;
      camera.position.set(Math.sin(theta) * radius, height, Math.cos(theta) * radius);
      camera.lookAt(look);
      city.rotation.y += ((progress * .16) - city.rotation.y) * .035;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  frame();
  addEventListener('resize', resize, { passive: true });

  async function loadModel(onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await new Promise((resolve, reject) => loader.load(
      './assets/visionvoice-3d/city-scene/model-web.glb',
      resolve,
      (event) => onProgress(event.loaded, event.total),
      reject,
    ));
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.copy(center).multiplyScalar(-1);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = true;
      object.material.envMapIntensity = .65;
    });
    const pivot = new THREE.Group();
    pivot.scale.setScalar(9 / Math.max(size.x, size.y, size.z));
    pivot.rotation.y = -.28;
    pivot.position.y = -.65;
    pivot.add(model);
    city.add(pivot);
    builtIn.visible = false;
  }

  function buildProceduralCity() {
    const group = new THREE.Group();
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 7.1, .38, 64),
      new THREE.MeshStandardMaterial({ color: 0x111646, metalness: .7, roughness: .32 }),
    );
    platform.position.y = -.35;
    group.add(platform);

    const buildings = [];
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x8898ff, emissive: 0x171b5e, emissiveIntensity: .55, metalness: .45, roughness: .34 });
    for (let x = -5; x <= 5; x += 1.1) {
      for (let z = -5; z <= 5; z += 1.1) {
        if (Math.hypot(x, z) > 5.7 || Math.abs(x) < .45 || Math.abs(z) < .45) continue;
        const noise = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
        const height = .55 + noise * 2.8 + Math.max(0, 2.1 - Math.hypot(x, z)) * .8;
        buildings.push({ x, z, height, width: .48 + noise * .28 });
      }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, buildings.length);
    const matrix = new THREE.Matrix4();
    buildings.forEach((building, index) => {
      matrix.compose(
        new THREE.Vector3(building.x, building.height / 2, building.z),
        new THREE.Quaternion(),
        new THREE.Vector3(building.width, building.height, building.width),
      );
      mesh.setMatrixAt(index, matrix);
    });
    group.add(mesh);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(.65, 1.1, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0b8ff, emissive: 0x4e1b78, emissiveIntensity: .8, metalness: .7, roughness: .2 }),
    );
    core.position.y = 2.6;
    group.add(core);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: .48 });
    for (const radius of [2.1, 4.2, 6.15]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .018, 6, 120), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .03;
      group.add(ring);
    }
    return group;
  }

  return {
    loadModel,
    setProgress(value) { progress = value; },
    setVisible(value) { visible = value; },
    dispose() { disposed = true; renderer.dispose(); },
  };
}

function showFatalError(error) {
  console.error('Interactive 3D city unavailable.', error);
  document.querySelector('[data-castle-loading]')?.classList.add('is-hidden');
  const fallback = document.querySelector('[data-castle-error]');
  if (fallback) fallback.hidden = false;
}
