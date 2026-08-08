const demo = document.querySelector('[data-agent-demo]');

if (demo) {
  const tasks = {
    book: { title: 'Find the blue book', instruction: 'REAL RUN REPLAY / LIVING ROOM', image: 'final_pdf/imdt_assets/agent-demo-1.jpg', video: 'assets/embodied-agent/guided-replay.mp4', frames: [3, 21, 37, 49], steps: ['RGB-D observation indexed', 'Shelf → desk → side table', 'Frontier search · 7 actions', 'Blue book visible · passed'], views: ['overview', 'overview', 'robot', 'target'] },
    plant: { title: 'Locate the green plant', instruction: 'SPATIAL MEMORY / KITCHEN', image: 'final_pdf/imdt_assets/agent-demo-2.jpg', video: 'assets/embodied-agent/guided-replay.mp4', frames: [9, 26, 44, 61], steps: ['Room graph restored', 'Unseen corner prioritized', 'Memory-guided navigation', 'Plant localized · passed'], views: ['overview', 'target', 'robot', 'target'] },
    cup: { title: 'Interact with the red cup', instruction: 'ACTION CHAIN / POSTCONDITIONS', image: 'final_pdf/imdt_assets/agent-demo-3.jpg', video: 'assets/embodied-agent/guided-replay.mp4', frames: [15, 32, 55, 79], steps: ['Cup and receptacle bound', 'Open → pick → put', '3 actions committed', 'State changed · passed'], views: ['overview', 'target', 'robot', 'target'] },
  };
  console.assert(Object.values(tasks).every(task => task.frames.length === 4 && task.steps.length === 4 && task.views.length === 4), 'Each guided replay needs four auditable stages.');

  const taskButtons = [...demo.querySelectorAll('[data-demo-task]')];
  const stepNodes = [...demo.querySelectorAll('[data-demo-step]')];
  const image = demo.querySelector('[data-demo-image]');
  const video = demo.querySelector('[data-demo-video]');
  const title = demo.querySelector('[data-demo-title]');
  const instruction = demo.querySelector('[data-demo-instruction]');
  const status = demo.querySelector('[data-demo-status]');
  const run = demo.querySelector('[data-demo-run]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = 'book';
  let timers = [];

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    video.pause();
    demo.dataset.status = 'ready';
    demo.style.setProperty('--demo-progress', 0);
    run.disabled = false;
    run.textContent = 'RUN GUIDED DEMO';
    status.textContent = 'READY / SELECT A TASK';
    stepNodes.forEach((node, index) => { node.className = ''; node.querySelector('b').textContent = tasks[selected].steps[index]; });
  }

  function showFrame(index) {
    const task = tasks[selected];
    const seek = () => { video.currentTime = Math.min(task.frames[index], video.duration || task.frames[index]); };
    video.pause();
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    stepNodes.forEach((node, itemIndex) => node.className = itemIndex < index ? 'is-done' : itemIndex === index ? 'is-active' : '');
    status.textContent = `${String(index + 1).padStart(2, '0')} / 04 · ${stepNodes[index].querySelector('span').textContent}`;
    demo.style.setProperty('--demo-progress', (index + 1) / 4);
    document.querySelector(`.scene-controls [data-view="${task.views[index]}"]`)?.click();
  }

  function select(name) {
    selected = name;
    stop();
    const task = tasks[name];
    taskButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoTask === name)));
    image.src = task.image;
    image.alt = `${task.title} guided replay frame`;
    video.hidden = !task.video;
    image.hidden = Boolean(task.video);
    video.poster = task.image;
    video.setAttribute('aria-label', `${task.title} real agent replay frames`);
    run.textContent = 'RUN GUIDED DEMO';
    title.textContent = task.title;
    instruction.textContent = task.instruction;
    showFrame(0);
  }

  function play() {
    stop();
    const task = tasks[selected];
    const delay = reduced ? 80 : 900;
    demo.dataset.status = 'running';
    run.disabled = true;
    run.textContent = 'RUNNING…';
    stepNodes.forEach((node, index) => timers.push(setTimeout(() => {
      showFrame(index);
      if (index === 3) {
        node.className = 'is-done';
        demo.dataset.status = 'verified';
        status.textContent = 'VERIFIED / GUIDED REPLAY COMPLETE';
        run.disabled = false;
        run.textContent = 'REPLAY TASK';
        timers = [];
      }
    }, index * delay)));
  }

  taskButtons.forEach(button => button.addEventListener('click', () => select(button.dataset.demoTask)));
  stepNodes.forEach((node, index) => {
    node.addEventListener('click', () => { stop(); showFrame(index); });
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stop(); showFrame(index); }
    });
  });
  run.addEventListener('click', play);
  select(selected);
  if (location.hash === '#demo') requestAnimationFrame(() => demo.scrollIntoView());
}
