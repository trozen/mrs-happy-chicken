# Mrs Happy Chicken

**[Play in your browser — desktop or mobile](https://trozen.github.io/mrs-happy-chicken/)**

A small playable browser mockup inspired by the computer game pictured in Peppa Pig.

Open `index.html` directly in a browser, or run:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000. No dependencies or build step.

On phones up to 600px wide, the rounded play area fills the available viewport with a small margin. A narrower, taller SVG world makes the birds larger and lets them roam across the portrait area. Resizing preserves the flock and active hops; desktop keeps the original landscape layout.

The game has no visible words. SVG speaker and restart buttons retain accessible labels for screen readers. At startup (and after restart), pictures of a pressed spacebar, left mouse button, and tapping hand replace the counter. Laying the first egg hides the pictures and reveals the counter. After each chick hatches, its shell pieces fly into the counter and add one on arrival. Comic Neue Bold is bundled in `assets/fonts` for the counter, with its SIL Open Font License; the game makes no font requests to external services.

The chicken wanders continuously with a two-frame walk cycle, facing her direction of travel. Press space or tap the blue play area to lay an egg: she hops to a random nearby spot as the egg appears at takeoff, then lands and continues in the hop direction until reaching the play area edge. Eggs stay behind, shake from 1.3 seconds, and crack after about two seconds. The cap pops off, a small chick peeks out, then hops over the rim to a nearby landing spot before wandering independently with its own two-frame walk cycle: stick legs alternate vertically while the body stays level. Chicks emerge at their final small size and never grow and use a simple yellow circle with a short golden beak, bright black eye, dark outline, and short stick legs. Sound, fullscreen, and restart controls sit together at the top left of the play area. Fullscreen fills the screen without the frame on both desktop and mobile. The fullscreen button appears in supporting browsers; press it again or use Escape to leave fullscreen. The flock is limited to 999 chicks, counting each unhatched egg as a reserved chick. Further laying stops at that limit without removing existing chicks; the delayed visible counter is not used to enforce it.

## Reference and scope

- [Official cartoon clip: Peppa wants to play Happy Mrs Chicken](https://www.youtube.com/watch?v=YzWuRnymr0c)
- [Official cartoon clip: Peppa teaches Grandpa about computers](https://www.youtube.com/watch?v=BQ3Q9tbsKxE)
- [Description of the in-universe game](https://peppapig.fandom.com/wiki/Happy_Mrs._Chicken)

## Verified visual reference

[Mummy Pig at Work episode worksheet, pages 5–6](https://languageadvisor.net/wp-content/uploads/2022/04/Peppa.Pig_.S01E07.Mummy_.Pig_.at_.Work_.pdf) contains actual cartoon close-ups: a round yellow chicken with heavy dark outlines, red comb and stick feet; cream eggs with dark outlines; a bright blue playfield; and white three-digit scores (006, 030, 046) in a dark blue oval. The later frames show cracked shells and a screen full of similarly sized chickens.

The current SVG drawing, egg shapes, colours, score, cracked shells, and hatchling size follow those stills. Artwork is drawn in SVG and sound is generated in the browser. No cartoon images or audio are bundled.

## Motion reference

Inspected the actual frames of [this official compilation at 00:49–00:52](https://www.youtube.com/watch?v=YzWuRnymr0c&t=49s), in its opening **Mummy Pig's Book** episode. Despite the upload title, this is not Mummy Pig at Work.

- The hen jumps between positions in a single frame, always facing left; she does not glide along a path.
- Each lay lifts the hen briefly, exposing an egg directly underneath. Eggs stay where they were laid.
- The close-up shows roughly three eggs per second.
- Around 00:50.5, an egg cracks, its cap lifts and falls to the side, and a small chicken emerges from the lower shell.
- The later wide shot shows a flock of large chickens.

At the user's request, the implementation uses continuous wandering and two alternating leg poses instead of the clip's jumps between locations. Each 320 ms laying hop travels 80–160 game units (8–16% of the playfield width) to a random in-bounds destination, leaving the egg at takeoff. Walking pauses during the hop; the chicken then resumes her route. Reduced-motion mode omits the leg cycling, bob, and lift while retaining movement. Incubation lasts two seconds, with a shake during its final 0.7 seconds, followed by crack, cap, emergence, and independent chick walking stages. Reduced-motion mode also omits egg shaking and chick leg cycling. Exact incubation/emergence durations and spacing are approximations across edited shots. The synthesized sound is still a placeholder; audio has not been matched. Unlike the later episode's end sequence, this prototype continues playing rather than switching to a high-score screen.

Both adult and chick walk poses lift the feet vertically while keeping their bodies level. The adult uses a modest six-unit lift so both feet remain visible.

## Spacing and depth

Wandering chooses a uniform random angle and a short distance (70–140 units for the mother, 55–110 for chicks), with outward directions reflected inward near edges. This avoids the horizontal bias of choosing destinations across a wide rectangle. When at least three chicks are within 130 game units, the mother checks for a clearer route roughly every 0.9 seconds and prefers less crowded destinations. The first second after laying is left to her existing hop and onward movement. Post-hop travel still continues in the landing direction. Chicks do not attract one another. Chicks choose clearer routes and pause for 0.2–0.9 seconds between walks. They gently follow their mother when there is room, with a family area that grows with flock size (at least 120 game units). Nearby neighbors reduce that pull, disabling it when five chicks are within 80 units. A soft outward drift helps crowded groups spread, and blocked chicks abandon their destination instead of continually pushing toward it. Following does not increase their maximum walking speed.

Birds can bunch up, overlap slightly, and nudge each other. Chicks use lighter avoidance with one another so they can bump; approaching bodies exchange a damped, mass-weighted impulse that can push the next chick in a group. Resting overlaps are separated without adding bounce. A narrow soft avoidance zone surrounds smaller circular cores that cannot pass through each other. The mother has 24 times a chick’s weight and yields much less, so she pushes chicks forward and aside while mostly holding her course. Chicks share contact displacement evenly. Birds use almost the full visible board, with bounds based on their sprite size plus a small border. The SVG world also follows the desktop fullscreen aspect ratio, so letterboxed areas no longer act as invisible barriers. Airborne hops can pass over birds, prefer an open landing spot, and rejoin collision handling on landing. Eggs are stationary collision obstacles until hatching finishes; birds steer around them. Loose shell caps do not block movement.

Drawing order follows ground-level foot positions: birds lower on the screen appear in front. Hop height does not change depth. Eggs, emerging chicks, and loose shell caps sort independently; the shell lip sits in front of its own chick. The chick exits in a 0.6-second arc, rising clear of the rim before moving sideways. It stays the same size throughout. Collision handling and walking begin at landing; the empty shells disappear shortly afterward. Reduced-motion mode uses a direct move to the landing spot instead of the arc.

Run the movement checks with `node --test tests/motion.test.cjs`. They cover head-on passing, overlapping hatchlings at an edge, collision checks across longer frames, and frame-rate consistency.

## Crowd testing

Append **`?eggs=50`** to the game URL to start with 50 randomly placed eggs (for example, `http://localhost:8000/?eggs=50`). Choose a nonnegative whole number up to 999. For example, `?eggs=200` spawns 200 eggs, leaving room for 799 more. Larger values are capped at 999. Missing or invalid values start an empty game.

The eggs shake, hatch, and send their shells to the counter normally. Restart clears the flock; refreshing spawns the requested batch again. This works on desktop and mobile, with no extra controls or changes to flock movement.
