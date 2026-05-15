# Boat Source Asset Brief

The animated boat pipeline must start from real complete source art.

Do not use procedural fragments for the final boat. Each source image must already look like a finished boat before the generator touches it.

## Required Files

Place one transparent PNG per direction in:

```text
assets/source/sprites/boats/master/
```

Required filenames:

```text
s.png
sw.png
w.png
nw.png
n.png
ne.png
e.png
se.png
```

Each file must contain the same complete galion from that direction.

## Art Direction

Create a complete 2.5D isometric galion:

- complete finished hull, not a cutaway and not separated pieces;
- closed bow and closed stern;
- readable wooden deck/plancher;
- two complete masts;
- clean sails attached to the masts;
- small flags are okay, but avoid noisy rigging;
- compact game-sprite silhouette;
- transparent background;
- no cast shadow baked into the image;
- no UI arrow, marker, badge, banner, or faction icon baked into the hull;
- no text or watermark.

The boat should read as a full object at about `58x54` pixels on the adventure map.

## Direction Order

These directions must match the renderer direction order:

```text
s, sw, w, nw, n, ne, e, se
```

Screen meaning:

- `s`: bow points down
- `sw`: bow points down-left
- `w`: bow points left
- `nw`: bow points up-left
- `n`: bow points up
- `ne`: bow points up-right
- `e`: bow points right
- `se`: bow points down-right

## Image Generation Prompt

Use this as the base prompt for each direction:

```text
Create one complete 2.5D isometric fantasy galion game sprite on a perfectly transparent background.
The boat must be a single finished object, not separated parts: complete closed hull, complete bow, complete stern, visible wooden deck, two complete masts, attached sails, compact readable silhouette.
Style: colorful stylized isometric strategy game asset, clean dark outline, polished hand-painted sprite, compatible with Heroes-like adventure map assets.
Camera: 2.5D isometric, bow points <DIRECTION>.
Composition: centered, generous padding, no crop, no cut-off parts.
Avoid: UI arrows, markers, banners, shields, text, watermark, dramatic scene lighting, ocean background, dock, waves, crew, cannons protruding too far, excessive rigging.
```

Replace `<DIRECTION>` with:

- down
- down-left
- left
- up-left
- up
- up-right
- right
- down-right

## Generator Behavior

`npm run generate:boat-sprites`:

- validates all 8 source PNGs exist;
- normalizes each complete source to `80x80`;
- creates 4 idle frames and 8 walk frames per direction;
- adds subtle shadow and walk wake;
- recolors hull-like pixels for each faction;
- writes final sheets to `public/assets/sprites/boats/<faction>/adventure.webp`.

