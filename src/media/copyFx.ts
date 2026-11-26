import type { CopiedFx } from '@/engine/types';

/** Reading another video's effects runs on the web app for now. */
export async function copyFxFromVideo(): Promise<CopiedFx | null> {
  throw new Error('Copying effects from a video works on the web app for now.');
}
