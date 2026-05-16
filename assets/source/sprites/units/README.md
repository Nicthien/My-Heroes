# Unit Sprite Production

Use this flow for AI-generated unit sprites so the final assets stay fast to process and consistent in-game.

## Generation Prompt

Prefer a plain white source. It has been the fastest and cleanest background to remove.

```text
Create a high-detail fantasy game unit sprite on a plain white background.

Use case: stylized-concept
Asset type: 512x512 game unit sprite source for background removal
Subject: <unit description>, polished fantasy anime game sprite style, detailed anatomy, faction colors, armor/material details, dynamic side-facing pose.
Weapon/role: <melee/ranged/caster details>. Avoid conflicting role cues.
Composition/framing: full body centered with generous padding, readable game-sprite silhouette, no crop.
Background: perfectly flat pure white (#ffffff) background only. No checkerboard, no panels, no rectangles, no gradients, no shadows, no floor, no props, no backdrop elements.
Constraints: high detail, clean sharp polished fantasy illustration, no cartoon simplification, no flat icon style, no chibi style, no text, no watermark.
```

For upgraded units, keep the base silhouette close and add only controlled upgrades: richer trim, stronger armor, crest, insignia, aura, or a more ornate weapon.

## Processing

Save generated sources anywhere convenient, then run:

```bash
npm run process:unit-sprites -- centaur=tmp/imagegen/centaur-source.png centaur_captain=tmp/imagegen/centaur_captain-source.png
```

The script will:

- remove white or magenta backgrounds by flood-fill from the image edges;
- normalize the visible sprite to a 512x512 WebP with alpha;
- write the final asset into `public/assets/sprites/units`;
- create black/grid previews and `tmp/unit-sprite-previews/contact-sheet.png`;
- print size, bounds, coverage, and warnings.

Useful options:

```bash
npm run process:unit-sprites -- --key=white centaur=tmp/imagegen/centaur-source.png
npm run process:unit-sprites -- --out-dir=tmp/unit-output --preview-dir=tmp/unit-previews centaur=tmp/imagegen/centaur-source.png
npm run process:unit-sprites -- --no-preview centaur=tmp/imagegen/centaur-source.png
```

## Acceptance Check

Before replacing a sprite, inspect the black preview or contact sheet. Reject the source if it has:

- background panels, checkerboards, shadows, or floor remnants;
- wrong role cues, such as bows/quivers on melee units;
- cropped weapons, hooves, wings, tails, or heads;
- large style drift from adjacent units in the same faction.
