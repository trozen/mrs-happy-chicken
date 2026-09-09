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
        if (bird.follow) {
          const fx = bird.follow.x - bird.x, fy = bird.follow.y - bird.y;
          const away = Math.hypot(fx, fy);
          // Leave room around the mother; gently bias distant chicks toward her.
          const pull = Math.min(.5, Math.max(0, (away - 120) / 500));
          if (pull > 0) {
            vx += fx / away * bird.speed * pull;
            vy += fy / away * bird.speed * pull;
          }
        }
        birds.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const ox = bird.x - other.x, oy = bird.y - other.y;
          const gap = Math.hypot(ox, oy);
          const contact = bird.radius + other.radius;
          const comfort = contact + 10;
          if (gap >= comfort || gap < .001) return;
          const nx = ox / gap, ny = oy / gap;
          // The mother holds her course; chicks yield and take most of a push.
          const influence = other.fixed ? 2 : 2 * other.mass / (bird.mass + other.mass);
          const strength = Math.min(.8, (comfort - gap) / 20) * influence;
          vx += nx * strength * bird.speed;
          vy += ny * strength * bird.speed;
          // Pass to the right instead of deadlocking in a head-on encounter.
          if (distance > 2 && dx * nx + dy * ny < 0) {
            vx -= ny * strength * bird.speed * .65;
            vy += nx * strength * bird.speed * .65;
          }
        });
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
      });
      separate(birds);
    }
  }

  const api = { step, separate, wanderTarget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.ChickenMotion = api;
})();
