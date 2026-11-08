# CANONICAL VISUAL CAPTURE PROTOCOL

## For every P0 on-screen ship
1. Choose a specific scene/mission and game version. Use screenshots and legal references you can access; record game, mission, timestamp or scene, camera lens/FOV if known.
2. Collect **top, bottom, left/port, right/starboard, bow, stern** views, plus three-quarter front and rear. If unobtainable from cinematics, tag that view `NOT VERIFIED`; never invent a confident orthographic.
3. Extract silhouettes by tracing screenshot *outlines*, not AI-generating missing geometry. Maintain stable reference coordinates.
4. Align nose and stern to a common length datum. Lock reference frame `+Z forward, +Y up` and ensure cameras agree on axes.
5. Use a neutral roughness clay pass for initial mesh QA. Compare rendered reference camera to source with 50% alpha blend and edge overlay.
6. Only after matching silhouette, add armour panel placement, weapon arrays, engine exhausts, window textures, faction paint and damage layers.
7. Store a source list with each mesh. Separate `official_model_visual`, `concept`, `reconstructed_source`, and `apex_extension`.

## Lens / screenshot pitfalls
Perspective foreshortening changes ship width and wing angles. Do not infer a 3D top-view profile from a single oblique camera image. Photographed toy/collectible references can confirm structure but do not establish game-scale size. Models built for cinematics may use adjusted proportions.

## Six-view checklist
| View | Must verify |
| --- | --- |
| Top | Nose, spine, wing angles, silhouettes, hardpoints |
| Bottom | Hull underside, hangars, weapon mounts, keel |
| Port | Length ratio, dorsal/ventral thickness, side fin line |
| Starboard | Symmetry or real asymmetry, engine pod structure |
| Front | Width, wing arch, bow aperture, gun placement |
| Rear | Exhaust count/location, mechanical appendage geometry |
| 3/4 front | Immediately recognisable thumbnail at fleet camera zoom |
| 3/4 aft | Engine design and wake silhouette, model truth |

## Reference trust and capture rights
High priority: your own in-game reference captures, developer art, original official art books, licensed replicas.
Secondary: fan orthographic renders and mod recreations used as overlays only.
DO NOT automate redistribution of extracted copyrighted EA/BioWare meshes or unlicensed fan assets. Use sources for recreation and obtain permission when necessary.
