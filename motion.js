// Circular body bounds keep separation independent of the two walking poses.
(() => {
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
          const share = b.mass / (a.mass + b.mass);
          a.x -= nx * push * share; a.y -= ny * push * share;
          b.x += nx * push * (1 - share); b.y += ny * push * (1 - share);
          clamp(a); clamp(b);
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
        const dx = bird.target ? bird.target.x - bird.x : 0;
        const dy = bird.target ? bird.target.y - bird.y : 0;
        const distance = Math.hypot(dx, dy);
        let vx = distance > 2 ? dx / distance * bird.speed : 0;
        let vy = distance > 2 ? dy / distance * bird.speed : 0;
        birds.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const ox = bird.x - other.x, oy = bird.y - other.y;
          const gap = Math.hypot(ox, oy);
          const contact = bird.radius + other.radius;
          const comfort = contact + 10;
          if (gap >= comfort || gap < .001) return;
          const nx = ox / gap, ny = oy / gap;
          // The mother holds her course; chicks yield and take most of a push.
          const influence = 2 * other.mass / (bird.mass + other.mass);
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

  const api = { step, separate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.ChickenMotion = api;
})();
