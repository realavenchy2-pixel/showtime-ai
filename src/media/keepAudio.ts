// On phones the finished video is rendered by the studio, so there is nothing to put back here.
// The web version is in keepAudio.web.ts.

/** Returns `upscaled` with the song from `original` when it came back without sound. */
export async function keepAudio(upscaled: Blob, _original: Blob): Promise<Blob> {
  return upscaled;
}
