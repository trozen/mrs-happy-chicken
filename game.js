(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.game-shell');
  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layDuration = .32;
  const hopRange = { min: 80, max: 160 };
  let eggs = [], count = 0, sound = true, audio;
  const newHen = () => ({ x: 500, y: 365, laidAt: -Infinity, hop: null, target: null, direction: -1, walkTime: 0 });
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

  // Wander toward open space, keeping a little separation from existing eggs.
  function nextSpot() {
    let best, clearance = -1;
    for (let i = 0; i < 35; i++) {
      const spot = { x: 100 + Math.random() * 800, y: 150 + Math.random() * 350 };
      const nearest = Math.min(Math.hypot(spot.x - hen.x, spot.y - hen.y),
        ...eggs.map(egg => Math.hypot(spot.x - egg.x, spot.y - egg.y)));
      if (nearest > clearance) { best = spot; clearance = nearest; }
      if (nearest > 110) break;
    }
    return best;
  }

  function use(href, parent) {
    const node = document.createElementNS(ns, 'use');
    node.setAttribute('href', href); parent.append(node); return node;
  }

  function wander(bird, target, speed, dt) {
    bird.target ||= target();
    const dx = bird.target.x - bird.x, dy = bird.target.y - bird.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, dt * speed);
    if (distance > 0) {
      bird.x += dx / distance * step;
      bird.y += dy / distance * step;
      if (Math.abs(dx) > 1) bird.direction = dx > 0 ? 1 : -1;
      bird.walkTime += dt;
    }
    if (distance <= step) bird.target = null;
  }

  const chickSpot = () => ({ x: 65 + Math.random() * 870, y: 120 + Math.random() * 410 });

  function hopDestination() {
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = hopRange.min + Math.random() * (hopRange.max - hopRange.min);
      const x = hen.x + Math.cos(angle) * distance;
      const y = hen.y + Math.sin(angle) * distance;
      if (x >= 100 && x <= 900 && y >= 150 && y <= 500) return { x, y };
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
      walker: { x: hen.x, y: hen.y + 14, target: null, direction: -1, walkTime: Math.random() },
      whole: use('#egg', node), chick: use('#chick', node),
      bottom: use('#shell-bottom', node), top: use('#shell-top', node) };
    egg.chick.style.display = egg.bottom.style.display = egg.top.style.display = 'none';
    eggs.push(egg);
    if (eggs.length > 100) eggs.shift().node.remove();
    hen.hop = { from: { x: hen.x, y: hen.y }, to: hopDestination() };
    hen.direction = hen.hop.to.x >= hen.x ? 1 : -1;
    hen.target = onwardTarget(hen.hop.from, hen.hop.to);
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
        if (hopProgress === 1) hen.hop = null;
      }
      const walking = !wasHopping && layAge >= layDuration;
      if (walking) wander(hen, nextSpot, 145, dt);
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
          if (hatched) wander(egg.walker, chickSpot, 65, dt);
          const stepping = hatched && !reducedMotion && Math.floor(egg.walker.walkTime / .16) % 2 === 1;
          egg.chick.setAttribute('href', stepping ? '#chick-step' : '#chick');
          const size = .85;
          const x = egg.walker.x - egg.x;
          const y = hatched ? egg.walker.y - egg.y : -8;
          egg.chick.setAttribute('transform', `translate(${x} ${y}) scale(${egg.walker.direction * size} ${size})`);
        }
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
