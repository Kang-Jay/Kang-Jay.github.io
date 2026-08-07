const demo = document.querySelector('[data-agent-demo]');

if (demo) {
  const tasks = {
    book: { title: 'Find the blue book', instruction: 'REAL RUN REPLAY / LIVING ROOM', image: 'final_pdf/imdt_assets/agent-demo-1.jpg', video: 'assets/embodied-agent/guided-replay.mp4', steps: ['RGB-D observation indexed', 'Shelf → desk → side table', 'Frontier search · 7 actions', 'Blue book visible · passed'], views: ['overview', 'overview', 'robot', 'target'] },
    plant: { title: 'Locate the green plant', instruction: 'SPATIAL MEMORY / KITCHEN', image: 'final_pdf/imdt_assets/agent-demo-2.jpg', steps: ['Room graph restored', 'Unseen corner prioritized', 'Memory-guided navigation', 'Plant localized · passed'], views: ['overview', 'target', 'robot', 'target'] },
    cup: { title: 'Interact with the red cup', instruction: 'ACTION CHAIN / POSTCONDITIONS', image: 'final_pdf/imdt_assets/agent-demo-3.jpg', steps: ['Cup and receptacle bound', 'Open → pick → put', '3 actions committed', 'State changed · passed'], views: ['overview', 'target', 'robot', 'target'] },
  };
  console.assert(Object.values(tasks).every(task => task.steps.length === 4 && task.views.length === 4), 'Each guided replay needs four auditable stages.');

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

  function select(name) {
    selected = name;
    stop();
    const task = tasks[name];
    taskButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoTask === name)));
    image.src = task.image;
    image.alt = `${task.title} guided replay frame`;
    video.hidden = !task.video;
    image.hidden = Boolean(task.video);
    run.textContent = task.video ? 'PLAY REAL REPLAY' : 'RUN GUIDED DEMO';
    status.textContent = task.video ? 'READY / 90 SEC REAL RUN' : 'READY / SELECT A TASK';
    title.textContent = task.title;
    instruction.textContent = task.instruction;
  }

  function play() {
    stop();
    const task = tasks[selected];
    const delay = reduced ? 80 : 900;
    demo.dataset.status = 'running';
    run.disabled = true;
    run.textContent = 'RUNNING…';
    if (task.video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    stepNodes.forEach((node, index) => timers.push(setTimeout(() => {
      stepNodes.forEach((item, itemIndex) => item.className = itemIndex < index ? 'is-done' : itemIndex === index ? 'is-active' : '');
      status.textContent = `${String(index + 1).padStart(2, '0')} / 04 · ${node.querySelector('span').textContent}`;
      demo.style.setProperty('--demo-progress', (index + 1) / 4);
      document.querySelector(`.scene-controls [data-view="${task.views[index]}"]`)?.click();
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
  run.addEventListener('click', play);
  select(selected);
  if (location.hash === '#demo') requestAnimationFrame(() => demo.scrollIntoView());
}
