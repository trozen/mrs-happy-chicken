(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.game-shell');
  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layDuration = .32;
  const hopRange = { min: 80, max: 160 };
  const hatchJumpStart = 2.8;
  const hatchJumpEnd = 3.4;
  const shellFlightStart = 3.7;
  const shellFlightDuration = .65;
  let eggs = [], count = 0, sound = true, audio;
  const henBounds = { left: 100, right: 900, top: 150, bottom: 500 };
  const chickBounds = { left: 65, right: 935, top: 120, bottom: 530 };
  const newHen = () => ({ radius: 40, mass: 24, speed: 145, bounds: henBounds, x: (henBounds.left + henBounds.right) / 2, y: henBounds.top + (henBounds.bottom - henBounds.top) * .6, laidAt: -Infinity, hop: null, target: null, direction: -1, walkTime: 0 });
  let hen = newHen();
  let lastFrame = 0, activeTime = 0;

  let world = { left: 0, width: 1000, height: 640 };
  function resizeWorld() {
    const rect = shell.getBoundingClientRect();
    const mobile = matchMedia('(max-width: 600px)').matches;
    const width = mobile ? 400 : 1000;
    const next = { left: (1000 - width) / 2, width, height: mobile ? width * rect.height / rect.width : 640 };
    if (next.width === world.width && next.height === world.height) return;
    const previous = world;
    world = next;
    $('scene').setAttribute('viewBox', `${world.left} 0 ${world.width} ${world.height}`);
    Object.assign(henBounds, { left: world.left + 100, right: world.left + world.width - 100, bottom: world.height - 140 });
    Object.assign(chickBounds, { left: world.left + 65, right: world.left + world.width - 65, bottom: world.height - 110 });
    // Keep the flock and any active hops in the same relative area on resize.
    const mapped = new Set();
    const move = point => {
      if (!point || mapped.has(point)) return;
      mapped.add(point);
      point.x = world.left + (point.x - previous.left) * world.width / previous.width;
      point.y *= world.height / previous.height;
    };
    const moveBird = bird => {
      move(bird); move(bird.target);
      bird.x = Math.max(bird.bounds.left, Math.min(bird.bounds.right, bird.x));
      bird.y = Math.max(bird.bounds.top, Math.min(bird.bounds.bottom, bird.y));
    };
    moveBird(hen);
    if (hen.hop) { move(hen.hop.from); move(hen.hop.to); }
    eggs.forEach(egg => {
      move(egg); move(egg.collider); moveBird(egg.walker);
      if (egg.exitHop) { move(egg.exitHop.from); move(egg.exitHop.to); }
    });
  }
  resizeWorld();
  new ResizeObserver(resizeWorld).observe(shell);


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

  function group(kind) {
    const node = document.createElementNS(ns, 'g');
    node.classList.add(kind);
    $('flock').append(node);
    return node;
  }

  function removeEgg(egg) {
    egg.node.remove(); egg.chickNode.remove(); egg.capNode.remove();
  }

  const chickSpot = bird => ChickenMotion.wanderTarget(bird, 55, 110);

  function chickLanding(egg) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const to = ChickenMotion.wanderTarget(egg.walker, 60, 85);
      if (Math.abs(to.x - egg.x) < 50) continue;
      const neighbors = [hen, ...eggs.filter(other => other !== egg).map(other =>
        activeTime - other.born >= hatchJumpEnd ? other.walker : other.collider)];
      if (neighbors.every(body => Math.hypot(to.x - body.x, to.y - body.y) >= egg.walker.radius + body.radius)) return to;
    }
    return { x: egg.x + (egg.x > 500 ? -70 : 70), y: egg.walker.y };
  }

  function hopDestination() {
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = hopRange.min + Math.random() * (hopRange.max - hopRange.min);
      const x = hen.x + Math.cos(angle) * distance;
      const y = hen.y + Math.sin(angle) * distance;
      if (x >= henBounds.left && x <= henBounds.right && y >= henBounds.top && y <= henBounds.bottom &&
          eggs.every(egg => {
            const body = activeTime - egg.born >= 3.4 ? egg.walker : egg.collider;
            return Math.hypot(x - body.x, y - body.y) >= hen.radius + body.radius;
          })) return { x, y };
    }
    // An inward hop is always safe if random attempts all point out of bounds.
    const angle = Math.atan2((henBounds.top + henBounds.bottom) / 2 - hen.y, 500 - hen.x);
    return { x: hen.x + Math.cos(angle) * hopRange.min, y: hen.y + Math.sin(angle) * hopRange.min };
  }

  function onwardTarget(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const toXEdge = dx > 0 ? (henBounds.right - to.x) / dx : dx < 0 ? (henBounds.left - to.x) / dx : Infinity;
    const toYEdge = dy > 0 ? (henBounds.bottom - to.y) / dy : dy < 0 ? (henBounds.top - to.y) / dy : Infinity;
    const distance = Math.max(0, Math.min(toXEdge, toYEdge));
    return { x: to.x + dx * distance, y: to.y + dy * distance };
  }

  function lay() {
    if (activeTime - hen.laidAt < layDuration) return;
    hen.laidAt = activeTime;
    shell.classList.add('playing');
    // All stages share the mother's ground line: hen + 56, egg + 30, chick + 27.
    const x = hen.x, y = hen.y + 26;
    const node = group('egg'), chickNode = group('chick'), capNode = group('shell-cap');
    node.setAttribute('transform', `translate(${x} ${y})`);
    capNode.setAttribute('transform', `translate(${x} ${y})`);
    const egg = { node, chickNode, capNode, x, y, born: activeTime,
      collider: { x, y, radius: 20, fixed: true },
      walker: { radius: 19, mass: 1, speed: 65, bounds: chickBounds, x, y: y + 3, target: null, direction: -1, walkTime: Math.random() },
      whole: use('#egg', node), chick: use('#chick', chickNode),
      bottom: use('#shell-bottom', node), top: use('#shell-top', capNode) };
    chickNode.style.display = capNode.style.display = egg.bottom.style.display = 'none';
    eggs.push(egg);
    if (eggs.length > 100) removeEgg(eggs.shift());
    hen.hop = { from: { x: hen.x, y: hen.y }, to: hopDestination() };
    hen.direction = hen.hop.to.x >= hen.x ? 1 : -1;
    hen.target = onwardTarget(hen.hop.from, hen.hop.to);
    hen.vx = hen.vy = 0;
    cluck();
  }

  $('playfield').addEventListener('click', lay);
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    // Space belongs to the game, including when a control retains focus.
    // Cancelling its default action prevents a second mute/restart click.
    event.preventDefault();
    if (!event.repeat) lay();
  });
  $('sound').addEventListener('click', () => {
    sound = !sound;
    $('sound').setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on');
    $('sound').setAttribute('aria-pressed', String(sound));
  });
  const fullscreenButton = $('fullscreen');
  fullscreenButton.hidden = !document.fullscreenEnabled || !document.documentElement.requestFullscreen;
  const syncFullscreen = () => {
    const active = document.fullscreenElement === document.documentElement;
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  };
  document.addEventListener('fullscreenchange', syncFullscreen);
  fullscreenButton.addEventListener('click', async () => {
    fullscreenButton.disabled = true;
    try {
      if (document.fullscreenElement === document.documentElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // A browser or embedding page may deny fullscreen; keep the game playable.
    } finally {
      syncFullscreen();
      fullscreenButton.disabled = false;
    }
  });
  $('reset').addEventListener('click', () => {
    eggs.forEach(removeEgg); eggs = []; count = 0;
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
      eggs.forEach(egg => {
        const age = activeTime - egg.born;
        if (age < hatchJumpStart || egg.exitLanded) return;
        if (!egg.exitHop) {
          egg.exitHop = { from: { x: egg.walker.x, y: egg.walker.y }, to: chickLanding(egg) };
          egg.walker.direction = egg.exitHop.to.x > egg.x ? 1 : -1;
        }
        const progress = Math.min(1, (age - hatchJumpStart) / (hatchJumpEnd - hatchJumpStart));
        // Rise above the rim before travelling sideways.
        const travel = reducedMotion ? (progress >= .2 ? 1 : 0) : Math.max(0, (progress - .2) / .8);
        const { from, to } = egg.exitHop;
        egg.walker.x = from.x + (to.x - from.x) * travel;
        egg.walker.y = from.y + (to.y - from.y) * travel;
        if (progress === 1) egg.exitLanded = true;
      });
      const birds = eggs.filter(egg => activeTime - egg.born >= 3.4).map(egg => egg.walker);
      birds.forEach(bird => {
        bird.target ||= chickSpot(bird);
        bird.follow = hen;
      });
      if (!hen.hop) {
        hen.target ||= nextSpot();
        birds.unshift(hen);
      }
      birds.push(...eggs.filter(egg => activeTime - egg.born < 3.4).map(egg => egg.collider));
      ChickenMotion.step(birds, dt);
      const alternateStep = walking && !reducedMotion && Math.floor(hen.walkTime / .14) % 2 === 1;
      $('hen-sprite').setAttribute('href', alternateStep ? '#bird-step' : '#bird');
      // Switch between open and closed poses, on a slower cycle than the feet.
      const beakClosure = walking && !reducedMotion
        ? Math.floor(hen.walkTime / .35) % 2 : 0;
      // Build the halves closed and open them around a hinge inside the head.
      // Their back corners stay behind the body throughout the rotation.
      const beakAngle = 28 * (1 - beakClosure);
      $('beak-upper').setAttribute('transform', `rotate(${-beakAngle} 30 -8)`);
      $('beak-lower').setAttribute('transform', `rotate(${beakAngle} 30 -8)`);
      // Follow an arc to a nearby landing spot, leaving the egg at takeoff.
      const lift = reducedMotion ? 0 : -42 * 4 * hopProgress * (1 - hopProgress);
      $('hen').setAttribute('transform', `translate(${hen.x} ${hen.y + lift}) scale(${hen.direction} 1)`);
      // Convert the HTML counter position into SVG coordinates, including letterboxing.
      let counterTarget;
      if (eggs.some(egg => !egg.collected && activeTime - egg.born >= shellFlightStart)) {
        const rect = document.querySelector('.score').getBoundingClientRect();
        counterTarget = new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          .matrixTransform($('scene').getScreenCTM().inverse());
      }
      eggs.forEach(egg => {
        const age = activeTime - egg.born;
        const hatching = age >= 2;
        const opening = age >= 2.16;
        const emerging = age >= 2.4;
        const hatched = age >= 3.4;
        const flight = Math.max(0, Math.min(1, (age - shellFlightStart) / shellFlightDuration));
        const shellGone = flight >= 1;
        if (shellGone && !egg.collected) {
          egg.collected = true;
          $('count').textContent = String(++count).padStart(3, '0');
        }
        if (flight === 0) {
          egg.node.setAttribute('transform', `translate(${egg.x} ${egg.y})`);
          egg.capNode.setAttribute('transform', `translate(${egg.x} ${egg.y})`);
        }
        if (flight > 0 && !shellGone) {
          // Fly above the flock; both pieces shrink into the counter together.
          const progress = flight * flight * (3 - 2 * flight);
          const x = egg.x + (counterTarget.x - egg.x) * progress;
          const y = egg.y + (counterTarget.y - egg.y) * progress;
          const scale = 1 - .5 * progress;
          const transform = `translate(${x} ${y}) scale(${scale})`;
          egg.node.setAttribute('transform', transform);
          egg.capNode.setAttribute('transform', transform);
          if (reducedMotion) {
            // Keep the same arrival timing without a sweeping animation.
            egg.node.setAttribute('transform', `translate(${egg.x} ${egg.y})`);
            egg.capNode.setAttribute('transform', `translate(${egg.x} ${egg.y})`);
            egg.node.style.opacity = egg.capNode.style.opacity = String(1 - flight);
          }
        }
        egg.node.style.display = shellGone ? 'none' : '';
        egg.whole.style.display = opening ? 'none' : '';
        egg.whole.setAttribute('href', hatching ? '#cracked-egg' : '#egg');
        // The egg first appears under the hen, then stays fixed in place.
        const shake = !reducedMotion && age >= 1.3 && !opening ? Math.sin((age - 1.3) * 36) * 11 : 0;
        const eggScale = age < .04 && !reducedMotion ? .4 : 1;
        egg.whole.setAttribute('transform', `rotate(${shake} 0 30) translate(0 30) scale(${eggScale}) translate(0 -30)`);
        egg.capNode.style.display = opening && !shellGone ? '' : 'none';
        egg.bottom.style.display = opening && !shellGone ? '' : 'none';
        egg.chickNode.style.display = emerging ? '' : 'none';
        if (opening) {
          const tossed = age >= 2.4;
          egg.top.setAttribute('transform', reducedMotion ? 'translate(43 15) rotate(110)' :
            tossed ? 'translate(43 15) rotate(110)' : 'translate(12 -35) rotate(25)');
        }
        if (emerging) {
          const jump = Math.max(0, Math.min(1, (age - hatchJumpStart) / (hatchJumpEnd - hatchJumpStart)));
          const clearOfRim = jump >= .2;
          const stepping = hatched && !reducedMotion && Math.floor(egg.walker.walkTime / .16) % 2 === 1;
          egg.chick.setAttribute('href', !clearOfRim ? '#chick-body' : stepping ? '#chick-step' : '#chick');
          // While inside the shell, only the head above the rim is visible.
          // Hide feet and clip the body so neither can leak beneath the shell.
          if (clearOfRim) egg.chick.removeAttribute('clip-path');
          else egg.chick.setAttribute('clip-path', 'url(#chick-in-shell)');
          const size = .85;
          const peek = age < hatchJumpStart ? -8 * Math.sin(Math.PI * (age - 2.4) / .4) : 0;
          const lift = reducedMotion ? 0 : peek - 70 * Math.sin(Math.PI * jump);
          egg.chickNode.setAttribute('transform', `translate(${egg.walker.x} ${egg.walker.y + lift})`);
          egg.chick.setAttribute('transform', `scale(${egg.walker.direction * size} ${size})`);
        }
      });
      // SVG paints in document order. Sort by feet on the ground, not hop height.
      const layers = [...eggs.flatMap(egg => [
        { node: egg.chickNode, depth: egg.walker.y + 27 },
        // At equal depth the shell lip sits in front of its emerging chick.
        { node: egg.node, depth: activeTime - egg.born >= shellFlightStart ? Infinity : egg.y + 30 },
        { node: egg.capNode, depth: activeTime - egg.born >= shellFlightStart ? Infinity : egg.y + (activeTime - egg.born >= 2.4 ? 40 : 30) }
      ]), { node: $('hen'), depth: hen.y + 56 }].sort((a, b) => a.depth - b.depth);
      const flock = $('flock');
      layers.forEach(({ node }, index) => {
        if (flock.children[index] !== node) flock.insertBefore(node, flock.children[index] || null);
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
