// Writes a .cube LUT for every camera look into assets/luts, from the same grade the app uses.
// Run: node scripts/make-luts.ts   (Node 22.6+ runs TypeScript directly)
// The studio server can apply them with ffmpeg:  -vf lut3d=assets/luts/fx3.cube
// They also load in DaVinci Resolve, Premiere and Final Cut.
import { mkdirSync, writeFileSync } from 'node:fs';

import { CAMERA_LOOKS, cubeLut } from '../src/engine/cameraLooks.ts';

mkdirSync('assets/luts', { recursive: true });
for (const look of CAMERA_LOOKS) {
  if (look.id === 'natural') continue;
  writeFileSync(`assets/luts/${look.id}.cube`, cubeLut(look.id));
  console.log(`assets/luts/${look.id}.cube  ${look.name} (inspired by ${look.inspiredBy})`);
}
