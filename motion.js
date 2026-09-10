// Circular body bounds keep separation independent of the two walking poses.
(() => {
  function wanderTarget(bird, minDistance, maxDistance, random = Math.random) {
    // Pick a heading first: sampling positions in a wide rectangle biases travel.
    const angle = random() * Math.PI * 2;
    const distance = minDistance + random() * (maxDistance - minDistance);
    let dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance;
    const { left, right, top, bottom } = bird.bounds;
    if (bird.x + dx < left || bird.x + dx > right) dx = -dx;
    if (bird.y + dy < top || bird.y + dy > bottom) dy = -dy;
    return { x: bird.x + dx, y: bird.y + dy };
  }

  function chickWanderTarget(bird, neighbors, random = Math.random) {
    let best, bestScore = Infinity;
    for (let i = 0; i < 8; i++) {
      const point = wanderTarget(bird, 55, 110, random);
      const middle = { x: (bird.x + point.x) / 2, y: (bird.y + point.y) / 2 };
      let score = 0;
      for (const other of neighbors) {
        if (other === bird) continue;
        const nearEnd = Math.max(0, 1 - Math.hypot(point.x - other.x, point.y - other.y) / 85);
        const nearPath = Math.max(0, 1 - Math.hypot(middle.x - other.x, middle.y - other.y) / 60);
        score += nearEnd * nearEnd + .5 * nearPath * nearPath;
      }
      if (score < bestScore) { best = point; bestScore = score; }
    }
    return best;
  }

  function crowdEscapeTarget(bird, neighbors, random = Math.random) {
    if (neighbors.filter(other => Math.hypot(other.x - bird.x, other.y - bird.y) < 130).length < 3) return null;
    const pressure = point => neighbors.reduce((sum, other) => {
      const proximity = Math.max(0, 1 - Math.hypot(other.x - point.x, other.y - point.y) / 180);
      return sum + proximity * proximity;
    }, 0);
    const { left, right, top, bottom } = bird.bounds;
    const offset = random() * Math.PI * 2;
    let best = null, bestScore = pressure(bird) * 1.5 * .85;
    for (let i = 0; i < 24; i++) {
      const angle = offset + i * Math.PI * 2 / 24;
      const x = bird.x + Math.cos(angle) * 120;
      const y = bird.y + Math.sin(angle) * 120;
      if (x < left || x > right || y < top || y > bottom) continue;
      const point = { x, y };
      const middle = { x: (bird.x + x) / 2, y: (bird.y + y) / 2 };
      // Prefer both an empty destination and a clear route to it.
      const score = pressure(point) + .5 * pressure(middle);
      if (score < bestScore) { best = point; bestScore = score; }
    }
    return best;
  }

  function clamp(bird) {
    const { left, right, top, bottom } = bird.bounds;
    bird.x = Math.max(left, Math.min(right, bird.x));
    bird.y = Math.max(top, Math.min(bottom, bird.y));
  }

  function separate(birds) {
    // Several small constraint passes also handle groups pressed against edges.
    for (let pass = 0; pass < 8; pass++) {
      let overlap = false;
      for (let i = 0; i < birds.length; i++) {
        for (let j = i + 1; j < birds.length; j++) {
          const a = birds[i], b = birds[j];
          if (a.fixed && b.fixed) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          // Bodies can nestle together; only their smaller cores cannot cross.
          const minimum = (a.radius + b.radius) * .85;
          if (distance >= minimum) continue;
          overlap = true;
          // Deterministic escape direction for chicks hatching at the same spot.
          const angle = (i + j * 2.4) * 2.4;
          const nx = distance > .001 ? dx / distance : Math.cos(angle);
          const ny = distance > .001 ? dy / distance : Math.sin(angle);
          const push = minimum - distance + .01;
          const inverseA = a.fixed ? 0 : 1 / a.mass;
          const inverseB = b.fixed ? 0 : 1 / b.mass;
          const share = inverseA / (inverseA + inverseB);
          // Transfer closing momentum, so a bump travels through nearby chicks.
          // Only approaching bodies receive an impulse; resting contact stays quiet.
          const closing = ((b.vx || 0) - (a.vx || 0)) * nx + ((b.vy || 0) - (a.vy || 0)) * ny;
          if (closing < -1) {
            const bounce = a.fixed || b.fixed ? 0 : .08;
            const impulse = -(1 + bounce) * closing / (inverseA + inverseB);
            if (!a.fixed) { a.vx = (a.vx || 0) - impulse * inverseA * nx; a.vy = (a.vy || 0) - impulse * inverseA * ny; }
            if (!b.fixed) { b.vx = (b.vx || 0) + impulse * inverseB * nx; b.vy = (b.vy || 0) + impulse * inverseB * ny; }
          }
          a.x -= nx * push * share; a.y -= ny * push * share;
          b.x += nx * push * (1 - share); b.y += ny * push * (1 - share);
          if (!a.fixed) clamp(a);
          if (!b.fixed) clamp(b);
        }
      }
      if (!overlap) break;
    }
  }

  function step(birds, dt) {
    if (dt <= 0) return;
    // Substeps prevent fast birds from crossing between collision checks.
    const steps = Math.ceil(dt / (1 / 120));
    const tick = dt / steps;
    for (let s = 0; s < steps; s++) {
      const velocities = birds.map((bird, index) => {
        if (bird.fixed) return { x: 0, y: 0 };
        const dx = bird.target ? bird.target.x - bird.x : 0;
        const dy = bird.target ? bird.target.y - bird.y : 0;
        const distance = Math.hypot(dx, dy);
        let vx = distance > 2 ? dx / distance * bird.speed : 0;
        let vy = distance > 2 ? dy / distance * bird.speed : 0;
        let nearbyChicks = 0;
        birds.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const ox = bird.x - other.x, oy = bird.y - other.y;
          const gap = Math.hypot(ox, oy);
          const contact = bird.radius + other.radius;
          const comfort = contact + 10;
          const peer = !other.fixed && bird.mass === other.mass;
          if (peer && gap < 80) {
            nearbyChicks++;
            // Anticipate crowding beyond direct contact, with a gentle outward drift.
            if (gap > .001) {
              const spread = .65 * (1 - gap / 80) ** 2 * bird.speed;
              vx += ox / gap * spread;
              vy += oy / gap * spread;
            }
          }
          if (gap >= comfort || gap < .001) return;
          const nx = ox / gap, ny = oy / gap;
          // The mother holds her course; chicks yield and take most of a push.
          const influence = other.fixed ? 2 : 2 * other.mass / (bird.mass + other.mass);
          // Chicks can make gentle physical contact instead of always sliding apart.
          const avoidance = peer ? .65 : 1;
          const strength = Math.min(.8, (comfort - gap) / 20) * influence * avoidance;
          vx += nx * strength * bird.speed;
          vy += ny * strength * bird.speed;
          // Pass to the right instead of deadlocking in a head-on encounter.
          if (distance > 2 && dx * nx + dy * ny < 0) {
            vx -= ny * strength * bird.speed * .65;
            vy += nx * strength * bird.speed * .65;
          }
        });
        if (bird.follow) {
          const fx = bird.follow.x - bird.x, fy = bird.follow.y - bird.y;
          const away = Math.hypot(fx, fy);
          // Large flocks need a wider family area; crowded chicks stop pulling inward.
          const familyRadius = bird.followRadius || 120;
          const room = Math.max(0, 1 - nearbyChicks / 5);
          const pull = Math.min(.5, Math.max(0, (away - familyRadius) / 500)) * room;
          if (pull > 0 && distance > 2) {
            vx += fx / away * bird.speed * pull;
            vy += fy / away * bird.speed * pull;
          }
        }
        const speed = Math.hypot(vx, vy);
        if (speed > bird.speed) { vx *= bird.speed / speed; vy *= bird.speed / speed; }
        const blend = 1 - Math.exp(-12 * tick);
        return { x: (bird.vx || 0) + (vx - (bird.vx || 0)) * blend,
          y: (bird.vy || 0) + (vy - (bird.vy || 0)) * blend };
      });
      birds.forEach((bird, i) => {
        if (bird.fixed) return;
        bird.vx = velocities[i].x; bird.vy = velocities[i].y;
        bird.x += bird.vx * tick; bird.y += bird.vy * tick;
        clamp(bird);
        if (Math.abs(bird.vx) > 8) bird.direction = bird.vx > 0 ? 1 : -1;
        if (Math.hypot(bird.vx, bird.vy) > 5) bird.walkTime += tick;
        if (bird.target && Math.hypot(bird.target.x - bird.x, bird.target.y - bird.y) < 8) bird.target = null;
        if (bird.follow && bird.target) {
          bird.blockedTime = Math.hypot(bird.vx, bird.vy) < bird.speed * .3 ? (bird.blockedTime || 0) + tick : 0;
          if (bird.blockedTime > .7) { bird.target = null; bird.blockedTime = 0; }
        }
      });
      separate(birds);
    }
  }

  const api = { step, separate, wanderTarget, chickWanderTarget, crowdEscapeTarget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.ChickenMotion = api;
})();
