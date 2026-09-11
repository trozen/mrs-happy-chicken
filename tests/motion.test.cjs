const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpatialGrid, step, separate, wanderTarget, chickWanderTarget, crowdEscapeTarget } = require('../motion.js');

function bird(x, y, target, adult = false) {
  return { x, y, target, radius: adult ? 40 : 19, mass: adult ? 24 : 1,
    speed: adult ? 145 : 65, direction: 1, walkTime: 0,
    bounds: { left: 65, right: 935, top: 120, bottom: 530 } };
}

function checkSpace(birds, tolerance = .1) {
  birds.forEach((a, i) => {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    assert.ok(a.x >= a.bounds.left && a.x <= a.bounds.right);
    assert.ok(a.y >= a.bounds.top && a.y <= a.bounds.bottom);
    birds.slice(i + 1).forEach(b => {
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= (a.radius + b.radius) * .85 - tolerance,
        'Bird cores must not cross');
    });
  });
}

test('wandering distributes headings evenly instead of favouring the wide axis', () => {
  let seed = 42;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const bins = Array(8).fill(0);
  const hen = bird(500, 325, null, true);
  for (let i = 0; i < 16000; i++) {
    const target = wanderTarget(hen, 70, 140, random);
    const dx = target.x - hen.x, dy = target.y - hen.y;
    const angle = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
    bins[Math.floor(angle / (Math.PI / 4))]++;
    assert.ok(Math.hypot(dx, dy) >= 70 && Math.hypot(dx, dy) <= 140);
  }
  bins.forEach(count => assert.ok(count > 1800 && count < 2200));
});

test('near edges headings turn inward without clipping travel to the boundary', () => {
  for (const x of [65, 70, 930, 935]) {
    for (const y of [120, 125, 525, 530]) {
      const hen = bird(x, y, null, true);
      for (let i = 0; i < 32; i++) {
        const target = wanderTarget(hen, 70, 140, () => i / 32);
        assert.ok(target.x >= 65 && target.x <= 935 && target.y >= 120 && target.y <= 530);
        assert.ok(Math.hypot(target.x - x, target.y - y) >= 69.99);
      }
    }
  }
});

test('head-on adult and chick steer past each other without crossing bodies', () => {
  const birds = [bird(250, 320, { x: 750, y: 320 }, true), bird(750, 320, { x: 250, y: 320 })];
  for (let frame = 0; frame < 900; frame++) { step(birds, 1 / 60); checkSpace(birds); }
  assert.ok(birds[0].x > 700 && birds[1].x < 300, 'Both birds should get past each other');
});

test('the mother pushes a chick forward while holding her course', () => {
  const mother = bird(300, 320, { x: 800, y: 320 }, true);
  const chick = bird(355, 320, null);
  // Isolate contact response from voluntary chick movement.
  chick.speed = 0;
  for (let frame = 0; frame < 120; frame++) step([mother, chick], 1 / 60);
  checkSpace([mother, chick]);
  assert.ok(mother.x > 550, 'Mother should keep making forward progress');
  assert.ok(chick.x > 450, 'Mother should physically push the chick forward and aside');
  assert.ok(Math.abs(mother.y - 320) < 15, 'Mother should mostly hold her course');
});

test('chicks can stand close and share a gentle nudge', () => {
  const a = bird(400, 320, null), b = bird(432, 320, null);
  a.speed = b.speed = 0;
  step([a, b], 1 / 60);
  checkSpace([a, b]);
  assert.ok(b.x - a.x < 34, 'Close chicks should not be forced far apart');
  assert.ok(a.x < 400 && b.x > 432, 'Both chicks should share contact displacement');
});

test('distant chicks drift toward their mother while keeping their own heading', () => {
  const chick = bird(150, 250, { x: 150, y: 500 });
  chick.follow = { x: 750, y: 250 };
  for (let i = 0; i < 60; i++) step([chick], 1 / 60);
  assert.ok(chick.x > 170, 'Distant chick should drift toward mother');
  assert.ok(chick.y > 290, 'Chick should still explore along its chosen heading');
  assert.ok(Math.hypot(chick.vx, chick.vy) <= chick.speed + .001, 'Following must not increase chick speed');
});

test('chicks near their mother explore without being pulled into a pile', () => {
  const chick = bird(400, 250, { x: 400, y: 400 });
  chick.follow = { x: 460, y: 250 };
  for (let i = 0; i < 30; i++) step([chick], 1 / 60);
  assert.equal(chick.x, 400);
  assert.ok(chick.y > 260);
});

test('adult and chick steer around a stationary egg without moving it', () => {
  for (const adult of [false, true]) {
    const walker = bird(250, 320, { x: 750, y: 320 }, adult);
    const egg = { x: 460, y: 320, radius: 20, fixed: true };
    for (let frame = 0; frame < 720; frame++) {
      step([walker, egg], 1 / 60);
      assert.equal(egg.x, 460);
      assert.equal(egg.y, 320);
      assert.ok(Math.hypot(walker.x - egg.x, walker.y - egg.y) >= (walker.radius + egg.radius) * .85 - .1);
    }
    assert.ok(walker.x > 700, 'Bird should get past the egg');
  }
});

test('overlapping fixed eggs stay put and stop blocking once removed', () => {
  const eggs = [{ x: 400, y: 320, radius: 20, fixed: true }, { x: 400, y: 320, radius: 20, fixed: true }];
  step(eggs, .05);
  assert.ok(eggs.every(egg => egg.x === 400 && egg.y === 320));
  const chick = bird(350, 320, { x: 450, y: 320 });
  // Once hatching finishes the fixed obstacle is no longer passed to physics.
  for (let i = 0; i < 120; i++) step([chick], 1 / 60);
  assert.ok(chick.x > 430);
});

test('coincident hatchlings separate and remain inside the boundary', () => {
  const birds = Array.from({ length: 8 }, (_, i) => bird(65, 120, { x: 300 + i * 70, y: 400 }));
  for (let frame = 0; frame < 300; frame++) step(birds, 1 / 60);
  checkSpace(birds);
});

test('a larger frame interval does not let opposing birds tunnel through each other', () => {
  const birds = [bird(450, 320, { x: 900, y: 320 }, true), bird(550, 320, { x: 100, y: 320 })];
  for (let frame = 0; frame < 100; frame++) { step(birds, .05); checkSpace(birds); }
});

test('separation produces similar results at 30 and 120 frames per second', () => {
  function simulate(fps) {
    const birds = [bird(300, 300, { x: 800, y: 300 }), bird(650, 300, { x: 150, y: 300 })];
    for (let i = 0; i < fps * 5; i++) step(birds, 1 / fps);
    checkSpace(birds);
    return birds;
  }
  const slow = simulate(30), fast = simulate(120);
  slow.forEach((b, i) => assert.ok(Math.hypot(b.x - fast[i].x, b.y - fast[i].y) < 1));
});


test('a bump passes momentum through a line of touching chicks without adding energy', () => {
  const chicks = [bird(400, 320, null), bird(432, 320, null), bird(464, 320, null)];
  chicks[0].vx = 90;
  separate(chicks);
  assert.ok(chicks[2].vx > 10, 'The third chick should receive the push');
  assert.ok(chicks[0].vx < 90, 'The first chick should lose momentum');
  assert.ok(Math.abs(chicks.reduce((sum, b) => sum + b.vx, 0) - 90) < .001);
  assert.ok(chicks.reduce((sum, b) => sum + b.vx ** 2 + (b.vy || 0) ** 2, 0) <= 90 ** 2);
  checkSpace(chicks);
});

test('resting chicks do not gain bouncing velocity from overlap alone', () => {
  const chicks = [bird(400, 320, null), bird(432, 320, null)];
  separate(chicks);
  assert.ok(chicks.every(b => !b.vx && !b.vy));
  checkSpace(chicks);
});

test('a crowded mother chooses space away from a nearby cluster', () => {
  const mother = bird(500, 320, null, true);
  const neighbors = [bird(545, 290, null), bird(545, 350, null), bird(575, 320, null)];
  for (let i = 0; i < 24; i++) {
    const target = crowdEscapeTarget(mother, neighbors, () => i / 24);
    assert.ok(target && target.x < 430, 'Mother should move into the empty left side');
  }
  assert.equal(crowdEscapeTarget(mother, neighbors.slice(0, 2)), null, 'A couple of chicks should not interrupt wandering');
});

test('crowd escape stays inside the board when the mother is near an edge', () => {
  const mother = bird(70, 320, null, true);
  const neighbors = [bird(100, 290, null), bird(100, 350, null), bird(120, 320, null)];
  for (let i = 0; i < 24; i++) {
    const target = crowdEscapeTarget(mother, neighbors, () => i / 24);
    assert.ok(target);
    assert.ok(target.x >= 65 && target.x <= 935 && target.y >= 120 && target.y <= 530);
  }
});


test('a chick chooses a clear walking route instead of entering a nearby cluster', () => {
  const chick = bird(400, 320, null);
  const neighbors = [bird(450, 290, null), bird(450, 320, null), bird(450, 350, null)];
  let call = 0;
  const random = () => call++ % 2 ? .5 : Math.floor((call - 1) / 2) / 8;
  const target = chickWanderTarget(chick, neighbors, random);
  assert.ok(target.x < chick.x, 'Choose open space away from the cluster');
});

test('a crowded chick stops pulling inward toward the mother', () => {
  function velocity(follow) {
    const chick = bird(400, 320, { x: 400, y: 450 });
    if (follow) chick.follow = { x: 850, y: 320 };
    const neighbors = Array.from({ length: 5 }, (_, i) => {
      const angle = i * Math.PI * 2 / 5;
      const other = bird(400 + 65 * Math.cos(angle), 320 + 65 * Math.sin(angle), null);
      other.speed = 0;
      return other;
    });
    step([chick, ...neighbors], 1 / 120);
    return chick;
  }
  const withMother = velocity(true), withoutMother = velocity(false);
  assert.ok(Math.abs(withMother.vx - withoutMother.vx) < .001);
  assert.ok(Math.abs(withMother.vy - withoutMother.vy) < .001);
});


test('spatial queries match a full scan across cell boundaries and negative coordinates', () => {
  let seed = 19;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const birds = Array.from({ length: 500 }, () => bird(random() * 1600 - 800, random() * 1200 - 600, null));
  birds.push(bird(64, -64, null));
  const grid = new SpatialGrid(birds);
  const verify = () => {
    for (const radius of [0, 40, 80, 195, 300]) {
      for (const [x, y] of [[64, -64], [0, 0], [-65, 63], [799, 599]]) {
        assert.deepEqual(grid.query(x, y, radius), birds.filter(b => Math.abs(b.x - x) <= radius && Math.abs(b.y - y) <= radius));
      }
    }
  };
  verify();
  birds[0].x = 64; birds[0].y = -64; grid.update(0);
  birds[500].x = -700; birds[500].y = 500; grid.update(500);
  verify();
});

test('crowd routing using a spatial grid chooses the same targets as scanning the flock', () => {
  const chick = bird(400, 320, null);
  const neighbors = Array.from({ length: 100 }, (_, i) => bird(80 + i % 10 * 90, 120 + Math.floor(i / 10) * 50, null));
  const grid = new SpatialGrid(neighbors);
  const random = () => {
    let seed = 42;
    return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  };
  assert.deepEqual(chickWanderTarget(chick, grid, random()), chickWanderTarget(chick, neighbors, random()));
  assert.deepEqual(crowdEscapeTarget(chick, grid, random()), crowdEscapeTarget(chick, neighbors, random()));
});

test('contact pushes cross spatial cell boundaries without losing the next neighbor', () => {
  const chicks = [bird(63, 320, null), bird(95, 320, null), bird(127, 320, null)];
  chicks.forEach(chick => { chick.bounds.left = 0; });
  chicks[0].vx = 90;
  separate(chicks);
  assert.ok(chicks[2].vx > 10);
  checkSpace(chicks);
});


test('dense candidate queries preserve pair order across 32-bit boundaries', () => {
  const birds = Array.from({ length: 999 }, (_, i) => bird(63 + i % 3, 63 + i % 5, null));
  const grid = new SpatialGrid(birds);
  for (const after of [-1, 0, 30, 31, 32, 63, 990, 998]) {
    assert.deepEqual(grid.indices(64, 64, 40, false, after),
      birds.map((_, i) => i).filter(i => i > after));
  }
});

test('wandering stays reachable when neither full-length direction fits', () => {
  for (const bounds of [
    { left: 374, right: 626, top: 80, bottom: 750 },
    { left: 74, right: 926, top: 80, bottom: 170 }
  ]) {
    const mother = bird((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2, null, true);
    mother.bounds = bounds;
    for (let heading = 0; heading < 64; heading++) {
      let call = 0;
      const target = wanderTarget(mother, 70, 140, () => call++ ? .999 : heading / 64);
      assert.ok(target.x >= bounds.left && target.x <= bounds.right);
      assert.ok(target.y >= bounds.top && target.y <= bounds.bottom);
    }
  }
  const mother = bird(500, 320, null, true);
  mother.bounds = { left: 374, right: 626, top: 80, bottom: 750 };
  let call = 0;
  mother.target = wanderTarget(mother, 70, 140, () => call++ ? .999 : 0);
  for (let frame = 0; frame < 300; frame++) step([mother], 1 / 60);
  assert.equal(mother.target, null, 'The mother must reach her target instead of walking against the wall');
});
