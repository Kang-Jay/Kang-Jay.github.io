/**
 * Aether Lane scroll / camera choreography.
 *
 * Expected scene controller API:
 *   controller.setCameraPose({
 *     position: { x, y, z },
 *     target: { x, y, z },
 *     fov: number,
 *     chapter: Chapter,
 *     progress: number,
 *     reducedMotion: boolean
 *   })
 *
 * Optional controller hooks:
 *   controller.setActiveChapter(chapter, previousChapter)
 *   controller.setPointerParallax({ x, y, translationViewport, rotationDeg })
 *   controller.setMotionLayers({ modelProgress, backgroundProgress, textProgress })
 *
 * The module never prevents wheel/touch events and never writes scroll position.
 * It emits `castlechapterchange` on the supplied eventTarget (window by default).
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

export const CASTLE_CHAPTERS = Object.freeze([
  { id: 'arrival', index: 0, number: '00', label: 'Arrival', project: null, start: 0 },
  { id: 'cultivate', index: 1, number: '01', label: 'Cultivate', project: 'Vibe Farming', start: 0.38 },
  { id: 'perceive', index: 2, number: '02', label: 'Perceive', project: 'Vision Voice', start: 0.54 },
  { id: 'act', index: 3, number: '03', label: 'Act', project: 'Embodied Agent', start: 0.65 },
  { id: 'navigate', index: 4, number: '04', label: 'Navigate', project: 'Hunyuan VLN', start: 0.73 },
  { id: 'overview', index: 5, number: '05', label: 'Overview', project: null, start: 0.92 }
]);

// World-space defaults are deliberately easy to override at construction time.
export const CASTLE_CAMERA_KEYFRAMES = Object.freeze([
  { t: 0, position: [-1.8, 2.0, 18.5], target: [0, 3.2, 0], fov: 42 },
  { t: 0.18, position: [-8.0, 4.8, 9.4], target: [-5.1, 3.4, 0.2], fov: 39 },
  { t: 0.36, position: [5.8, 10.8, 7.1], target: [4.3, 8.4, -1.4], fov: 37 },
  { t: 0.54, position: [2.1, 5.0, 2.7], target: [0, 4.1, -3.7], fov: 43 },
  { t: 0.72, position: [9.7, 5.8, -3.8], target: [5.4, 3.8, -7.2], fov: 40 },
  { t: 0.9, position: [11.6, 10.5, 14.8], target: [0, 4.0, -1.2], fov: 44 },
  { t: 1, position: [0.4, 13.2, 22.5], target: [0, 3.3, -1.0], fov: 46 }
]);

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((i) => 0.5 * (
    (2 * p1[i]) + (-p0[i] + p2[i]) * t +
    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3
  ));
}

function sampleKeyframes(keyframes, progress, property) {
  let right = keyframes.findIndex((frame) => frame.t >= progress);
  if (right < 0) right = keyframes.length - 1;
  if (right === 0) return [...keyframes[0][property]];
  const left = right - 1;
  const a = keyframes[left];
  const b = keyframes[right];
  const local = (progress - a.t) / Math.max(0.0001, b.t - a.t);
  const p0 = keyframes[Math.max(0, left - 1)][property];
  const p3 = keyframes[Math.min(keyframes.length - 1, right + 1)][property];
  return catmullRom(p0, a[property], b[property], p3, local);
}

function sampleNumber(keyframes, progress, property) {
  let right = keyframes.findIndex((frame) => frame.t >= progress);
  if (right < 0) right = keyframes.length - 1;
  if (right === 0) return keyframes[0][property];
  const left = right - 1;
  const t = (progress - keyframes[left].t) /
    Math.max(0.0001, keyframes[right].t - keyframes[left].t);
  return mix(keyframes[left][property], keyframes[right][property], t);
}

function chapterAt(progress, chapters) {
  let active = chapters[0];
  for (const chapter of chapters) {
    if (progress >= chapter.start) active = chapter;
    else break;
  }
  return active;
}

export function createCastleScroll(controller, options = {}) {
  if (!controller || typeof controller.setCameraPose !== 'function') {
    throw new TypeError('createCastleScroll requires controller.setCameraPose(pose)');
  }

  const win = options.window || window;
  const doc = options.document || document;
  const eventTarget = options.eventTarget || win;
  const scrollElement = options.scrollElement || doc.documentElement;
  const chapters = options.chapters || CASTLE_CHAPTERS;
  const keyframes = options.keyframes || CASTLE_CAMERA_KEYFRAMES;
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  // Per-60fps-frame interpolation. Production brief requires 0.04–0.08.
  const damping = Math.min(0.08, Math.max(0.04, options.damping ?? 0.06));
  const backgroundMotionRatio = Math.min(0.35, Math.max(0.2, options.backgroundMotionRatio ?? 0.28));
  const pointerViewportLimit = Math.min(0.02, Math.max(0.01, options.pointerViewportLimit ?? 0.015));
  const pointerRotationLimit = Math.min(2, Math.max(1, options.pointerRotationLimit ?? 1.5));
  let reducedMotion = media.matches;
  const touchPrimary = win.matchMedia?.('(hover: none), (pointer: coarse)').matches ||
    (win.navigator?.maxTouchPoints ?? 0) > 0;
  let targetProgress = 0;
  let currentProgress = 0;
  let activeChapter = null;
  let pointerTarget = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0 };
  let raf = 0;
  let lastTime = 0;
  let destroyed = false;

  const readProgress = () => {
    const max = Math.max(1, scrollElement.scrollHeight - win.innerHeight);
    return clamp01(win.scrollY / max);
  };

  const notifyChapter = (next) => {
    if (next === activeChapter) return;
    const previous = activeChapter;
    activeChapter = next;
    controller.setActiveChapter?.(next, previous);
    eventTarget.dispatchEvent(new win.CustomEvent('castlechapterchange', {
      detail: { chapter: next, previousChapter: previous }
    }));
    options.onChapterChange?.(next, previous);
  };

  const render = (progress) => {
    // Reduced motion keeps one stable establishing composition; document content
    // and active anchors still follow normal scroll progress.
    const frameProgress = reducedMotion ? 0 : progress;
    const positionArray = sampleKeyframes(keyframes, frameProgress, 'position');
    const targetArray = sampleKeyframes(keyframes, frameProgress, 'target');
    const chapter = chapterAt(progress, chapters);
    notifyChapter(chapter);

    const px = reducedMotion || touchPrimary ? 0 : pointer.x;
    const py = reducedMotion || touchPrimary ? 0 : pointer.y;
    controller.setPointerParallax?.({
      x: px,
      y: py,
      translationViewport: { x: px * pointerViewportLimit, y: py * pointerViewportLimit },
      rotationDeg: { x: -py * pointerRotationLimit, y: px * pointerRotationLimit }
    });
    controller.setMotionLayers?.({
      modelProgress: frameProgress,
      backgroundProgress: frameProgress * backgroundMotionRatio,
      // Text follows chapter state directly and should animate in CSS, never lag
      // enough to announce the wrong project after a rapid scroll.
      textProgress: progress
    });
    controller.setCameraPose({
      position: { x: positionArray[0], y: positionArray[1], z: positionArray[2] },
      target: { x: targetArray[0], y: targetArray[1], z: targetArray[2] },
      fov: sampleNumber(keyframes, frameProgress, 'fov'),
      chapter,
      progress,
      reducedMotion
    });
  };

  const tick = (time) => {
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000 || 0));
    lastTime = time;
    // Time-corrected damping preserves the authored 0.04–0.08 weight at 60fps,
    // while directly retargeting on every scroll makes rapid input interruptible.
    const alpha = reducedMotion ? 1 : 1 - Math.pow(1 - damping, dt * 60);
    currentProgress += (targetProgress - currentProgress) * alpha;
    pointer.x += (pointerTarget.x - pointer.x) * alpha;
    pointer.y += (pointerTarget.y - pointer.y) * alpha;
    render(currentProgress);
    raf = win.requestAnimationFrame(tick);
  };

  const onScroll = () => { targetProgress = readProgress(); };
  const onPointer = (event) => {
    if (reducedMotion || touchPrimary || event.pointerType === 'touch') return;
    pointerTarget = {
      x: clamp01(event.clientX / win.innerWidth) * 2 - 1,
      y: clamp01(event.clientY / win.innerHeight) * 2 - 1
    };
  };
  const onPointerLeave = () => { pointerTarget = { x: 0, y: 0 }; };
  const onMotionChange = (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) pointerTarget = pointer = { x: 0, y: 0 };
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onScroll, { passive: true });
  win.addEventListener('pointermove', onPointer, { passive: true });
  win.addEventListener('pointerleave', onPointerLeave, { passive: true });
  media.addEventListener?.('change', onMotionChange);
  onScroll();
  currentProgress = targetProgress;
  render(currentProgress);
  raf = win.requestAnimationFrame(tick);

  return {
    get progress() { return currentProgress; },
    get activeChapter() { return activeChapter; },
    refresh() { onScroll(); },
    destroy() {
      destroyed = true;
      win.cancelAnimationFrame(raf);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onScroll);
      win.removeEventListener('pointermove', onPointer);
      win.removeEventListener('pointerleave', onPointerLeave);
      media.removeEventListener?.('change', onMotionChange);
    }
  };
}

export default createCastleScroll;
