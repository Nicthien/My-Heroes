# Terrain Texture Catalog

This catalog is the source of truth for the rich terrain texture set. Each terrain variant generates three transparent WebP assets: a top diamond plus left/right side faces. Top textures are generated at 256x128 source scale, exported to 128x64, and displayed by Phaser at 64x32. Side textures are generated at 256x192 source scale, exported to 128x96, and scaled to each cube elevation.

## Selection Rules

- `water` keeps the current animated renderer for v1.
- Road tiles use the `clean` texture set for their terrain so road strokes stay readable.
- Non-blocking scenic decor biases texture selection by tags: flowers choose flower variants, grass tufts choose grass variants, small rocks choose rock variants, trees/bushes choose leaf, moss, root, or needle variants.
- Blocking decor remains separate sprites/graphics: groves, boulder clusters, natural walls, and similar large obstacles.
- Side files use the same base name as the top file plus `-side-left.webp` and `-side-right.webp`.

## Catalog

| Terrain | File | Tags | Density intent | Imagegen prompt seed |
| --- | --- | --- | --- | --- |
| grass | `grass-clean.webp` | clean | common base | Isometric transparent diamond terrain top, lush green grass, subtle painted grain, Heroes-like fantasy strategy map, no objects, no border, no shadow. |
| grass | `grass-dense-herb.webp` | grass, dense | common scenic | Isometric transparent diamond terrain top, dense short grass blades, rich green fantasy map texture, painted detail, no tall plants, no border. |
| grass | `grass-flowers.webp` | flower | scenic decor | Isometric transparent diamond terrain top, green grass with tiny yellow and pink wildflowers, Heroes-like painted style, clean readable tile. |
| grass | `grass-small-rocks.webp` | rock | scenic decor | Isometric transparent diamond terrain top, green grass with a few small gray stones, fantasy strategy map, no large obstacle. |
| grass | `grass-herb-flowers.webp` | grass, flower | scenic mixed | Isometric transparent diamond terrain top, dense grass with scattered tiny flowers, colorful but readable, Heroes-like fantasy map. |
| grass | `grass-herb-rocks.webp` | grass, rock | scenic mixed | Isometric transparent diamond terrain top, grass tufts and small stones, painted fantasy strategy map texture, no tall objects. |
| grass | `grass-clover-moss.webp` | moss, clover | rare scenic | Isometric transparent diamond terrain top, soft clover and moss patches over green grass, lush fantasy map style. |
| grass | `grass-dirt-transition.webp` | dirt, transition | rare transition | Isometric transparent diamond terrain top, green grass blending into light dirt patches, subtle natural transition. |
| forest | `forest-leafy-floor.webp` | clean, leaf | common base | Isometric transparent diamond terrain top, forest floor with green-brown leafy ground, painted Heroes-like strategy map texture. |
| forest | `forest-dead-leaves.webp` | leaf | scenic | Isometric transparent diamond terrain top, forest floor covered with dead leaves, warm brown accents, no tall trees. |
| forest | `forest-low-roots.webp` | root | scenic | Isometric transparent diamond terrain top, low tree roots crossing mossy forest ground, no vertical trunks, readable tile. |
| forest | `forest-moss.webp` | moss | scenic | Isometric transparent diamond terrain top, mossy forest ground, rich green shadows, painted fantasy map style. |
| forest | `forest-ferns.webp` | grass, fern | scenic | Isometric transparent diamond terrain top, low ferns and leafy ground, no tall objects, Heroes-like fantasy texture. |
| forest | `forest-pine-needles.webp` | needle | scenic | Isometric transparent diamond terrain top, dark forest ground with pine needles and tiny twigs, painted fantasy map. |
| forest | `forest-rare-flowers.webp` | flower | rare scenic | Isometric transparent diamond terrain top, forest leaf floor with rare tiny flowers, subtle color accents. |
| forest | `forest-shaded-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, shaded forest ground with small stones, moss and leaves, no obstacle. |
| dirt | `dirt-bare.webp` | clean | common base | Isometric transparent diamond terrain top, bare brown dirt, subtle painted grain, fantasy strategy map. |
| dirt | `dirt-dry.webp` | dry | common | Isometric transparent diamond terrain top, dry cracked dirt, warm brown tones, readable game tile. |
| dirt | `dirt-small-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, dirt with small gray stones, no large rocks, painted Heroes-like style. |
| dirt | `dirt-rare-grass.webp` | grass | scenic | Isometric transparent diamond terrain top, brown dirt with rare short grass, subtle fantasy map texture. |
| dirt | `dirt-light-mud.webp` | mud | scenic | Isometric transparent diamond terrain top, light muddy dirt patches, damp painted surface, no puddle object. |
| dirt | `dirt-ruts.webp` | rut | rare | Isometric transparent diamond terrain top, dirt with shallow ruts and irregular tracks, readable under roads. |
| dirt | `dirt-dark.webp` | dark | rare | Isometric transparent diamond terrain top, dark earthy soil, subtle grain and shadows, fantasy strategy map. |
| sand | `sand-clean.webp` | clean | common base | Isometric transparent diamond terrain top, clean golden sand, painted grain, no objects. |
| sand | `sand-ripples.webp` | ripple | common | Isometric transparent diamond terrain top, golden sand with wind ripples, subtle Heroes-like fantasy texture. |
| sand | `sand-small-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, sand with a few small stones, no large obstacle. |
| sand | `sand-shells.webp` | shell | rare scenic | Isometric transparent diamond terrain top, sand with tiny pale shell details, subtle and readable. |
| sand | `sand-dry.webp` | dry | common | Isometric transparent diamond terrain top, dry sunlit sand, fine grain and soft ripples. |
| sand | `sand-packed.webp` | packed | common | Isometric transparent diamond terrain top, compact sand, slightly darker flattened patches, fantasy map. |
| sand | `sand-rare-grass.webp` | grass | rare transition | Isometric transparent diamond terrain top, sand with rare dry grass tufts, no tall plants. |
| snow | `snow-clean.webp` | clean | common base | Isometric transparent diamond terrain top, clean white snow, soft blue shadows, painted fantasy map. |
| snow | `snow-packed.webp` | packed | common | Isometric transparent diamond terrain top, packed snow, subtle compressed texture, readable strategy tile. |
| snow | `snow-small-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, snow with small gray rocks peeking through, no obstacle. |
| snow | `snow-blue.webp` | blue | rare | Isometric transparent diamond terrain top, blue-tinted snow and ice sheen, fantasy strategy map. |
| snow | `snow-frozen-grass.webp` | grass | scenic | Isometric transparent diamond terrain top, snow with tiny frozen grass blades, pale and readable. |
| snow | `snow-soft-tracks.webp` | track | rare | Isometric transparent diamond terrain top, snow with very soft shallow tracks, subtle detail. |
| snow | `snow-hard-ice.webp` | ice | rare | Isometric transparent diamond terrain top, hard snow and ice lines, cool blue highlights. |
| swamp | `swamp-green-mud.webp` | clean, mud | common base | Isometric transparent diamond terrain top, green-brown swamp mud, damp fantasy map texture. |
| swamp | `swamp-wet-moss.webp` | moss | scenic | Isometric transparent diamond terrain top, wet moss over swamp mud, dark green painted detail. |
| swamp | `swamp-low-reeds.webp` | grass, reed | scenic | Isometric transparent diamond terrain top, low reeds over muddy swamp ground, no tall plants. |
| swamp | `swamp-dark-puddles.webp` | puddle | scenic | Isometric transparent diamond terrain top, dark shallow puddles in swamp mud, subtle reflection, no animated water. |
| swamp | `swamp-roots.webp` | root | scenic | Isometric transparent diamond terrain top, muddy swamp ground with low roots, no vertical trunk. |
| swamp | `swamp-marsh-grass.webp` | grass | scenic | Isometric transparent diamond terrain top, marsh grass and muddy green ground, readable tile. |
| swamp | `swamp-wet-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, swamp mud with small wet stones, no obstacle. |
| mountain | `mountain-clean-rock.webp` | clean | common base | Isometric transparent diamond terrain top, gray mountain rock, painted grain, no tall objects. |
| mountain | `mountain-cracked-rock.webp` | crack | common | Isometric transparent diamond terrain top, cracked gray rock surface, Heroes-like fantasy map. |
| mountain | `mountain-small-rocks.webp` | rock | scenic | Isometric transparent diamond terrain top, rocky mountain surface with small loose stones. |
| mountain | `mountain-rare-moss.webp` | moss, grass | rare scenic | Isometric transparent diamond terrain top, gray rock with rare moss patches, subtle green accents. |
| mountain | `mountain-dark-rock.webp` | dark | common | Isometric transparent diamond terrain top, dark gray rock surface, painted shadows and grain. |
| mountain | `mountain-light-rock.webp` | light | common | Isometric transparent diamond terrain top, light gray rock surface, readable painted highlights. |
| mountain | `mountain-gravel.webp` | gravel | scenic | Isometric transparent diamond terrain top, gray gravel and small chips, no large obstacle. |
| lava | `lava-volcanic-rock.webp` | clean, rock | common base | Isometric transparent diamond terrain top, dark volcanic rock, fantasy strategy map, subtle heat tones. |
| lava | `lava-ash.webp` | ash | common | Isometric transparent diamond terrain top, volcanic ash over dark rock, painted gray-black texture. |
| lava | `lava-hot-cracks.webp` | crack | scenic | Isometric transparent diamond terrain top, dark volcanic rock with glowing orange cracks, no active flame. |
| lava | `lava-embers.webp` | ember | scenic | Isometric transparent diamond terrain top, black rock with tiny glowing embers, readable game tile. |
| lava | `lava-black-rock.webp` | dark | common | Isometric transparent diamond terrain top, nearly black volcanic rock, subtle painted highlights. |
| lava | `lava-dry-flow.webp` | flow | rare | Isometric transparent diamond terrain top, dried lava flow lines over black rock, orange-red undertones. |
| lava | `lava-burnt-edge.webp` | edge | rare | Isometric transparent diamond terrain top, burnt volcanic edge and charred ground, subtle ember details. |
| water | current renderer | animated | v1 unchanged | Keep current animated water renderer; revisit shoreline and water top textures in a later pass. |
