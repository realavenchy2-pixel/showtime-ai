// An upscaler may hand back the picture without the sound. This puts the song back from the file
// rendered on this device by copying its encoded audio, so nothing is re-encoded and nothing drifts.

/** Returns `upscaled` with the song from `original` when it came back without sound. */
export async function keepAudio(upscaled: Blob, original: Blob): Promise<Blob> {
  const mb = await import('mediabunny');
  const up = new mb.Input({ source: new mb.BlobSource(upscaled), formats: mb.ALL_FORMATS });
  const src = new mb.Input({ source: new mb.BlobSource(original), formats: mb.ALL_FORMATS });
  try {
    if (await up.getPrimaryAudioTrack()) return upscaled;
    const audio = await src.getPrimaryAudioTrack();
    if (!audio) return upscaled;
    const video = await up.getPrimaryVideoTrack();
    if (!video) throw new Error('the upscaled file came back without a picture');
    const videoCodec = video.codec;
    const audioCodec = audio.codec;
    const format = new mb.Mp4OutputFormat();
    if (!videoCodec || !format.getSupportedVideoCodecs().includes(videoCodec)) throw new Error('the upscaled picture is in a format this browser cannot repackage');
    if (!audioCodec || !format.getSupportedAudioCodecs().includes(audioCodec)) throw new Error("the song's sound cannot go back into the upscaled file");
    const videoConfig = await video.getDecoderConfig();
    const audioConfig = await audio.getDecoderConfig();
    if (!videoConfig || !audioConfig) throw new Error('the upscaled file could not be read');

    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    const picture = new mb.EncodedVideoPacketSource(videoCodec);
    const sound = new mb.EncodedAudioPacketSource(audioCodec);
    output.addVideoTrack(picture, { rotation: video.rotation });
    output.addAudioTrack(sound);
    await output.start();

    let end = 0;
    let first = true;
    for await (const packet of new mb.EncodedPacketSink(video).packets()) {
      await picture.add(packet, first ? { decoderConfig: videoConfig } : undefined);
      first = false;
      end = Math.max(end, packet.timestamp + packet.duration);
    }
    first = true;
    for await (const packet of new mb.EncodedPacketSink(audio).packets()) {
      // The sound never runs past the picture.
      if (packet.timestamp >= end) break;
      await sound.add(packet, first ? { decoderConfig: audioConfig } : undefined);
      first = false;
    }
    picture.close();
    sound.close();
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('the upscaled file came out empty');
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    up.dispose();
    src.dispose();
  }
}
