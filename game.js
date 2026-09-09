(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.game-shell');
  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layDuration = .32;
  const hopRange = { min: 80, max: 160 };
  let eggs = [], count = 0, sound = true, audio;
  const henBounds = { left: 100, right: 900, top: 150, bottom: 500 };
  const chickBounds = { left: 65, right: 935, top: 120, bottom: 530 };
  const newHen = () => ({ radius: 40, mass: 24, speed: 145, bounds: henBounds, x: 500, y: 365, laidAt: -Infinity, hop: null, target: null, direction: -1, walkTime: 0 });
  let hen = newHen();
  let lastFrame = 0, activeTime = 0;

  function cluck() {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const oscillator = audio.createOscillator(), volume = audio.createGain();
      const now = audio.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(430 + Math.random() * 80, now);
      oscillator.frequency.exponentialRampToValueAtTime(145, now + .12);
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(.16, now + .012);
      volume.gain.exponentialRampToValueAtTime(.001, now + .15);
      oscillator.connect(volume).connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + .17);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    } catch { /* Play remains available if browser audio is unavailable. */ }
  }

  // Short, uniformly chosen headings give all directions a fair turn.
  function nextSpot() {
    return ChickenMotion.wanderTarget(hen, 70, 140);
  }

  function use(href, parent) {
    const node = document.createElementNS(ns, 'use');
    node.setAttribute('href', href); parent.append(node); return node;
  }

  const chickSpot = bird => ChickenMotion.wanderTarget(bird, 55, 110);

  function hopDestination() {
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = hopRange.min + Math.random() * (hopRange.max - hopRange.min);
      const x = hen.x + Math.cos(angle) * distance;
      const y = hen.y + Math.sin(angle) * distance;
      if (x >= 100 && x <= 900 && y >= 150 && y <= 500 &&
          eggs.every(egg => activeTime - egg.born < 3.4 || Math.hypot(x - egg.walker.x, y - egg.walker.y) >= hen.radius + egg.walker.radius)) return { x, y };
    }
    // An inward hop is always safe if random attempts all point out of bounds.
    const angle = Math.atan2(325 - hen.y, 500 - hen.x);
    return { x: hen.x + Math.cos(angle) * hopRange.min, y: hen.y + Math.sin(angle) * hopRange.min };
  }

  function onwardTarget(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const toXEdge = dx > 0 ? (900 - to.x) / dx : dx < 0 ? (100 - to.x) / dx : Infinity;
    const toYEdge = dy > 0 ? (500 - to.y) / dy : dy < 0 ? (150 - to.y) / dy : Infinity;
    const distance = Math.max(0, Math.min(toXEdge, toYEdge));
    return { x: to.x + dx * distance, y: to.y + dy * distance };
  }

  function lay() {
    if (activeTime - hen.laidAt < layDuration) return;
    hen.laidAt = activeTime;
    shell.classList.add('playing');
    $('count').textContent = String(++count).padStart(3, '0');
    const node = document.createElementNS(ns, 'g');
    node.setAttribute('transform', `translate(${hen.x} ${hen.y + 32})`);
    $('flock').append(node);
    const egg = { node, x: hen.x, y: hen.y + 32, born: activeTime,
      walker: { radius: 19, mass: 1, speed: 65, bounds: chickBounds, x: hen.x, y: hen.y + 14, target: null, direction: -1, walkTime: Math.random() },
      whole: use('#egg', node), chick: use('#chick', node),
      bottom: use('#shell-bottom', node), top: use('#shell-top', node) };
    egg.chick.style.display = egg.bottom.style.display = egg.top.style.display = 'none';
    eggs.push(egg);
    if (eggs.length > 100) eggs.shift().node.remove();
    hen.hop = { from: { x: hen.x, y: hen.y }, to: hopDestination() };
    hen.direction = hen.hop.to.x >= hen.x ? 1 : -1;
    hen.target = onwardTarget(hen.hop.from, hen.hop.to);
    hen.vx = hen.vy = 0;
    cluck();
  }

  $('playfield').addEventListener('click', lay);
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('button, a, input, textarea, select') && event.target !== $('playfield')) return;
    event.preventDefault();
    if (!event.repeat) lay();
  });
  $('sound').addEventListener('click', () => {
    sound = !sound;
    $('sound').textContent = sound ? 'Sound on ♪' : 'Sound off ♪';
    $('sound').setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on');
    $('sound').setAttribute('aria-pressed', String(sound));
  });
  $('reset').addEventListener('click', () => {
    eggs.forEach(egg => egg.node.remove()); eggs = []; count = 0;
    $('count').textContent = '000'; shell.classList.remove('playing');
    hen = newHen();
  });

  function frame(time) {
    const dt = lastFrame ? Math.min((time - lastFrame) / 1000, .05) : 0;
    lastFrame = time;
    if (!document.hidden) {
      activeTime += dt;
      const layAge = activeTime - hen.laidAt;
      const hopProgress = Math.min(layAge / layDuration, 1);
      const wasHopping = !!hen.hop;
      if (hen.hop) {
        const { from, to } = hen.hop;
        hen.x = from.x + (to.x - from.x) * hopProgress;
        hen.y = from.y + (to.y - from.y) * hopProgress;
        if (hopProgress === 1) {
          hen.hop = null;
          const distance = Math.hypot(to.x - from.x, to.y - from.y);
          hen.vx = (to.x - from.x) / distance * hen.speed;
          hen.vy = (to.y - from.y) / distance * hen.speed;
        }
      }
      const walking = !wasHopping && layAge >= layDuration;
      const birds = eggs.filter(egg => activeTime - egg.born >= 3.4).map(egg => egg.walker);
      birds.forEach(bird => { bird.target ||= chickSpot(bird); });
      if (!hen.hop) {
        hen.target ||= nextSpot();
        birds.unshift(hen);
      }
      ChickenMotion.step(birds, dt);
      const alternateStep = walking && !reducedMotion && Math.floor(hen.walkTime / .14) % 2 === 1;
      $('hen-sprite').setAttribute('href', alternateStep ? '#bird-step' : '#bird');
      // Follow an arc to a nearby landing spot, leaving the egg at takeoff.
      const lift = reducedMotion ? 0 : -42 * 4 * hopProgress * (1 - hopProgress);
      $('hen').setAttribute('transform', `translate(${hen.x} ${hen.y + lift}) scale(${hen.direction} 1)`);
      eggs.forEach(egg => {
        const age = activeTime - egg.born;
        const hatching = age >= 2;
        const opening = age >= 2.16;
        const emerging = age >= 2.4;
        const hatched = age >= 3.4;
        egg.whole.style.display = opening ? 'none' : '';
        egg.whole.setAttribute('href', hatching ? '#cracked-egg' : '#egg');
        // The egg first appears under the hen, then stays fixed in place.
        const shake = !reducedMotion && age >= 1.3 && !opening ? Math.sin((age - 1.3) * 36) * 11 : 0;
        egg.whole.setAttribute('transform', `rotate(${shake} 0 30) scale(${age < .04 && !reducedMotion ? .4 : 1})`);
        egg.top.style.display = opening && !hatched ? '' : 'none';
        egg.bottom.style.display = opening && !hatched ? '' : 'none';
        egg.chick.style.display = emerging ? '' : 'none';
        if (opening) {
          const tossed = age >= 2.4;
          egg.top.setAttribute('transform', reducedMotion ? 'translate(43 15) rotate(110)' :
            tossed ? 'translate(43 15) rotate(110)' : 'translate(12 -35) rotate(25)');
        }
        if (emerging) {
          const stepping = hatched && !reducedMotion && Math.floor(egg.walker.walkTime / .16) % 2 === 1;
          egg.chick.setAttribute('href', stepping ? '#chick-step' : '#chick');
          const size = .85;
          const x = egg.walker.x - egg.x;
          const y = hatched ? egg.walker.y - egg.y : -8;
          egg.chick.setAttribute('transform', `translate(${x} ${y}) scale(${egg.walker.direction * size} ${size})`);
        }
      });
      // SVG paints in document order. Sort by feet on the ground, not hop height.
      const layers = [{ node: $('hen'), depth: hen.y + 56 }, ...eggs.map(egg => ({
        node: egg.node,
        depth: activeTime - egg.born >= 3.4 ? egg.walker.y + 27 : egg.y + 30
      }))].sort((a, b) => a.depth - b.depth);
      const flock = $('flock');
      layers.forEach(({ node }, index) => {
        if (flock.children[index] !== node) flock.insertBefore(node, flock.children[index] || null);
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
