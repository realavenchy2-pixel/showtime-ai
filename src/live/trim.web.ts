// Cuts one shot out of a take, in the browser, as an H.264 MP4 with no sound: exactly what SwitchX takes.
// Frames come out at a constant rate so the frame count matches what the engine planned.

export interface ShotFile {
  blob: Blob;
  filename: string;
  contentType: string;
}

type Codec = 'avc' | 'hevc' | 'vp9' | 'av1' | 'vp8';

export async function trimShot(source: Blob, startSec: number, endSec: number, fps: number, name: string): Promise<ShotFile> {
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS, QUALITY_HIGH, getFirstEncodableVideoCodec } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This take has no picture in it.');
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    // SwitchX reads H.264 and HEVC. Browser tests can widen this list.
    const wanted = ((globalThis as { __SHOWTIME_SHOT_CODECS__?: Codec[] }).__SHOWTIME_SHOT_CODECS__ ?? ['avc', 'hevc']) as Codec[];
    const codec = await getFirstEncodableVideoCodec(wanted, { width, height });
    if (!codec) throw new Error('This browser cannot prepare shots for the switch. Open the app in Chrome or Safari.');

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: Math.max(0, startSec), end: endSec },
      video: { codec, frameRate: fps, bitrate: QUALITY_HIGH, forceTranscode: true },
      audio: { discard: true },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('This take could not be cut into a shot.');
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The shot came out empty.');
    return { blob: new Blob([buffer], { type: 'video/mp4' }), filename: `${name}.mp4`, contentType: 'video/mp4' };
  } finally {
    input.dispose();
  }
}
