import { CASTLE_CHAPTERS } from './castle-scroll.js';

const world = document.querySelector('.castle-world');
const stage = document.querySelector('.castle-world__stage');
const video = document.querySelector('#castle-video');
const uiRoot = document.querySelector('#castle-ui-root');
const backdrop = document.querySelector('.castle-world__backdrop');

if (world && stage && video && uiRoot) boot();

async function boot() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const response = await fetch('./castle-portfolio-fragment.html');
  uiRoot.innerHTML = await response.text();

  const ui = uiRoot.querySelector('[data-castle-ui]');
  const loading = uiRoot.querySelector('[data-castle-loading]');
  const error = uiRoot.querySelector('[data-castle-error]');
  const current = uiRoot.querySelector('[data-castle-current]');
  const chapters = [...uiRoot.querySelectorAll('[data-castle-chapter]')];
  const links = [...uiRoot.querySelectorAll('[data-castle-jump]')];
  let duration = 19.625;
  let targetTime = 0;
  let active = -1;
  let ready = false;
  let scrollRaf = 0;

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
  const source = video.dataset.src;
  if (source) {
    video.src = source;
    video.load();
  } else {
    markError();
  }

  function syncVideo() {
    if (!ready) return;
    const next = Math.max(0, Math.min(duration - 0.01, targetTime));
    if (Math.abs(video.currentTime - next) > 1 / 24) video.currentTime = next;
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
    const max = Math.max(1, world.offsetHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, (scrollY - world.offsetTop) / max));
    targetTime = progress * duration;
    syncVideo();
    ui.style.setProperty('--castle-progress', `${progress * 100}%`);
    if (backdrop) backdrop.style.setProperty('--castle-bg-y', `${progress * -4}vh`);
    setChapter(chapterAt(progress));
    const past = scrollY > world.offsetTop + world.offsetHeight;
    stage.classList.toggle('is-past', past);
    ui.classList.toggle('is-past', past);
  }

  function jump(index) {
    const max = Math.max(1, world.offsetHeight - innerHeight);
    const chapter = CASTLE_CHAPTERS[index];
    scrollTo({
      top: world.offsetTop + chapter.start * max + 2,
      behavior: reduced ? 'auto' : 'smooth'
    });
  }

  uiRoot.addEventListener('click', (event) => {
    const direct = event.target.closest('[data-castle-jump]');
    if (direct) {
      event.preventDefault();
      jump(Number(direct.dataset.castleJump));
      return;
    }
    const anchor = event.target.closest('a[href^="#castle-"]');
    if (!anchor) return;
    const index = CASTLE_CHAPTERS.findIndex((item) => anchor.getAttribute('href') === `#castle-${item.id}`);
    if (index < 0) return;
    event.preventDefault();
    if (anchor.classList.contains('castle-ui__skip')) scrollTo({ top: world.offsetHeight, behavior: 'smooth' });
    else jump(index);
  });

  addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      read();
    });
  }, { passive: true });
  read();
  setChapter(CASTLE_CHAPTERS[0]);
  addEventListener('pagehide', () => {
    cancelAnimationFrame(scrollRaf);
  }, { once: true });
}
