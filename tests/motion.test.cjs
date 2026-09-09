const { test } = require('node:test');
const assert = require('node:assert/strict');
const { step, wanderTarget } = require('../motion.js');

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
