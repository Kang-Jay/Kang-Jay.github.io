import './visitor-log.js?v=relay-1';
import { CASTLE_CHAPTERS } from './castle-scroll.js?v=aligned-1';

const world = document.querySelector('.castle-world');
const stage = document.querySelector('.castle-world__stage');
const video = document.querySelector('#castle-video');
const uiRoot = document.querySelector('#castle-ui-root');
const backdrop = document.querySelector('.castle-world__backdrop');

if (world && stage && video && uiRoot) boot();

async function boot() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const response = await fetch('./castle-portfolio-fragment.html?v=video-smooth-3');
  if (!response.ok) throw new Error(`UI request failed: ${response.status}`);
  uiRoot.innerHTML = await response.text();

  const ui = uiRoot.querySelector('[data-castle-ui]');
  const loading = uiRoot.querySelector('[data-castle-loading]');
  const error = uiRoot.querySelector('[data-castle-error]');
  const current = uiRoot.querySelector('[data-castle-current]');
  const chapters = [...uiRoot.querySelectorAll('[data-castle-chapter]')];
  const links = [...uiRoot.querySelectorAll('[data-castle-jump]')];
  let duration = 10.97;
  let targetTime = 0;
  let active = -1;
  let ready = false;
  let pendingSeek = false;
  let scrollRaf = 0;
  let journeyRaf = 0;

  video.pause();
  const markReady = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    duration = video.duration;
    ready = true;
    syncVideo();
    if (loading) loading.hidden = true;
  };
  const markError = () => {
    if (error) error.hidden = false;
    loading?.classList.add('is-hidden');
    console.error('Castle video failed to load', video.error);
  };
  video.addEventListener('loadedmetadata', markReady, { once: true });
  video.addEventListener('error', markError, { once: true });
  video.addEventListener('seeked', () => {
    if (pendingSeek) syncVideo();
  });
  if (video.readyState >= video.HAVE_METADATA) markReady();

  function syncVideo() {
    if (!ready || journeyRaf) return;
    const next = Math.max(0, Math.min(duration - 0.01, targetTime));
    if (Math.abs(video.currentTime - next) <= 1 / 30) return;
    if (video.seeking) {
      pendingSeek = true;
      return;
    }
    pendingSeek = false;
    video.currentTime = next;
  }

  function chapterAt(progress) {
    let chapter = CASTLE_CHAPTERS[0];
    for (const item of CASTLE_CHAPTERS) {
      if (progress >= item.start) chapter = item;
      else break;
    }
    return chapter;
  }

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

  function read() {
    const top = world.offsetTop;
    const height = world.offsetHeight;
    const max = Math.max(1, height - innerHeight);
    const progress = Math.min(1, Math.max(0, (scrollY - top) / max));
    targetTime = progress * duration;
    syncVideo();
    ui.style.setProperty('--castle-progress', `${progress * 100}%`);
    backdrop?.style.setProperty('--castle-bg-y', `${progress * -4}vh`);
    setChapter(chapterAt(progress));
    const past = scrollY > top + height;
    stage.classList.toggle('is-past', past);
    ui.classList.toggle('is-past', past);
  }

  function jump(index) {
    const max = Math.max(1, world.offsetHeight - innerHeight);
    scrollTo({
      top: world.offsetTop + CASTLE_CHAPTERS[index].start * max + 2,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  function stopJourney() {
    cancelAnimationFrame(journeyRaf);
    journeyRaf = 0;
    video.pause();
  }

  function playJourney() {
    if (!ready) {
      video.addEventListener('loadedmetadata', playJourney, { once: true });
      return;
    }
    if (reduced) return jump(CASTLE_CHAPTERS.length - 1);
    stopJourney();
    const top = world.offsetTop;
    const distance = Math.max(1, world.offsetHeight - innerHeight);
    scrollTo({ top, behavior: 'auto' });
    video.currentTime = 0;
    video.play().catch(() => {});
    const frame = () => {
      const progress = Math.min(1, video.currentTime / duration);
      scrollTo(0, top + progress * distance);
      if (!video.paused && !video.ended) journeyRaf = requestAnimationFrame(frame);
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
      scrollTo({ top: world.offsetHeight, behavior: 'smooth' });
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
  }, { once: true });
  read();
}
