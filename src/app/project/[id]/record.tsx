import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { CameraView } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { useCameraAccess } from '@/components/record/CameraLayer';
import { useProCamera } from '@/components/record/proCamera';
import { RecorderChrome, type RecorderPhase } from '@/components/record/RecorderChrome';
import { goBack } from '@/components/Screen';
import { T } from '@/components/T';
import { showToast } from '@/components/Toast';
import { RECORD_FPS } from '@/engine/switchx';
import { useApp, useProject } from '@/engine/store';
import { addRecorded } from '@/lib/footage';
import { haptic } from '@/lib/haptics';
import { useTakeRange } from '@/lib/takeRange';
import { songUrl } from '@/media/audio';
import { saveMedia } from '@/media/library';
import { color } from '@/theme/tokens';

const DENIED = {
  title: 'Camera access is off',
  body: 'Turn on the camera and microphone for Showtime AI in Settings, then open the recorder again. The mic is only used to line your take up with the song.',
};

/**
 * The recorder on a phone: the song plays, the camera rolls.
 * Takes are lined up by the recorder clock here; lining up by ear runs in the web app today.
 */
export default function RecordScreen() {
  useKeepAwake();
  const { id, scene: sceneParam } = useLocalSearchParams<{ id: string; scene?: string }>();
  const sceneIndex = sceneParam !== undefined && sceneParam !== '' ? Number(sceneParam) : undefined;
  const project = useProject(id);
  const apply = useApp((s) => s.apply);
  const access = useCameraAccess();
  const camera = useRef<CameraView | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const take = useRef<{ rolledAt: number; playedAt: number; from: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>('opening');
  const [beat, setBeat] = useState(4);
  const [songTime, setSongTime] = useState(0);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [listening, setListening] = useState(false);
  const player = useAudioPlayer(url, { updateInterval: 100 });

  const song = project?.song;
  const range = useTakeRange(project, sceneIndex);
  const { from, to } = range;
  const listenUntil = range.bounds.end;
  const n = project?.takes.length ?? 0;
  const pro = useProCamera({
    mirrored: facing === 'front',
    formats: project?.formats ?? [],
    recording: phase === 'recording',
    elapsedSec: Math.max(0, songTime - from),
    hidden: phase === 'opening' || phase === 'blocked',
  });

  useEffect(() => {
    // Lets the song keep playing through the speaker while the camera records.
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).catch(() => {});
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    let live = true;
    if (song) void songUrl(song).then((u) => live && setUrl(u ?? null));
    return () => {
      live = false;
    };
  }, [song]);

  const granted = access.granted;
  const loading = access.loading;
  const canAsk = access.canAsk;
  const request = access.request;
  const asked = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!granted && canAsk && !asked.current) {
      // Ask the first time the recorder opens, the way a camera app does.
      asked.current = true;
      void request();
      return;
    }
    setPhase((p) => (p === 'opening' || p === 'blocked' ? (granted ? 'idle' : 'blocked') : p));
  }, [granted, loading, canAsk, request]);

  const stop = () => {
    if (phase !== 'recording') return;
    setPhase('saving');
    player.pause();
    camera.current?.stopRecording();
  };
  const onTick = useEffectEvent(() => {
    const t = player.currentTime;
    setSongTime(t);
    if (t >= to - 0.05) stop();
  });
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(onTick, 100);
    return () => clearInterval(timer);
  }, [phase]);

  const onListenTick = useEffectEvent(() => {
    const t = player.currentTime;
    setSongTime(t);
    if (!player.playing || t >= listenUntil - 0.05) {
      player.pause();
      setListening(false);
    }
  });
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(onListenTick, 100);
    return () => clearInterval(timer);
  }, [listening]);
  const stopListening = () => {
    if (!listening) return;
    player.pause();
    setListening(false);
  };
  // Sliding along the song: it plays from under the finger and keeps playing after.
  const lastSeek = useRef(0);
  const scrub = (t: number) => {
    if (phase !== 'idle') return;
    const at = Math.max(range.bounds.start, Math.min(listenUntil - 0.5, t));
    setSongTime(at);
    const now = Date.now();
    if (now - lastSeek.current > 80) {
      lastSeek.current = now;
      void player.seekTo(at).catch(() => {});
    }
    if (!listening) {
      player.play();
      setListening(true);
    }
  };

  const listen = async () => {
    if (phase !== 'idle') return;
    if (listening) return stopListening();
    await player.seekTo(from).catch(() => {});
    setSongTime(from);
    player.play();
    setListening(true);
  };

  if (!project || !song) {
    return (
      <View style={styles.center}>
        <T v="body" c="smoke">
          Pick a song first.
        </T>
        <Button label="Back" variant="quiet" onPress={() => goBack()} />
      </View>
    );
  }

  const save = async (uri: string | undefined) => {
    const current = take.current;
    take.current = null;
    if (!uri || !current) {
      showToast('That take could not be saved. Try again.');
      setPhase('idle');
      return;
    }
    try {
      const mediaId = await saveMedia(uri, 'take');
      const wide = !project.formats.length || project.formats.includes('16:9');
      const durationSec = (Date.now() - current.rolledAt) / 1000;
      apply(project.id, (p) =>
        addRecorded(
          p,
          {
            mediaId,
            durationSec,
            width: wide ? 1920 : 1080,
            height: wide ? 1080 : 1920,
            fps: RECORD_FPS,
            songStartSec: current.from - (current.playedAt - current.rolledAt) / 1000,
            lagMs: 0,
            sync: 'clock',
          },
          current.from,
          false,
          sceneIndex,
        ),
      );
      haptic.success();
      showToast(`Take ${n + 1} saved and lined up with the song`);
    } catch {
      showToast('That take could not be saved. Try again.');
    }
    setPhase('idle');
  };

  const record = async () => {
    if (phase !== 'idle' || !camera.current) return;
    player.pause();
    setListening(false);
    const beatMs = 60000 / song.bpm;
    await player.seekTo(from).catch(() => {});
    setSongTime(from);
    setBeat(4);
    setPhase('countin');
    haptic.beat();
    for (let k = 1; k < 4; k++) {
      timers.current.push(
        setTimeout(() => {
          setBeat(4 - k);
          haptic.beat();
        }, k * beatMs),
      );
    }
    // The camera rolls a moment before the downbeat so the first frame is never late.
    timers.current.push(
      setTimeout(() => {
        const cam = camera.current;
        if (!cam) return;
        take.current = { rolledAt: Date.now(), playedAt: Date.now(), from };
        cam.recordAsync().then(
          (video) => void save(video?.uri),
          () => void save(undefined),
        );
      }, 4 * beatMs - 300),
    );
    timers.current.push(
      setTimeout(() => {
        if (take.current) take.current.playedAt = Date.now();
        player.play();
        haptic.confirm();
        setPhase('recording');
      }, 4 * beatMs),
    );
  };

  return (
    <RecorderChrome
      phase={phase}
      beat={beat}
      song={song}
      songTime={songTime}
      from={from}
      to={to}
      takes={project.takes}
      planned={project.takePlan[n]}
      placing={range.placing}
      custom={range.custom}
      video={range.placing ? undefined : range.bounds}
      peaks={song.peaks}
      blocked={phase === 'blocked' ? DENIED : undefined}
      listening={listening}
      onListen={() => void listen()}
      onFromTop={() => {
        stopListening();
        range.fromTop();
      }}
      onScrub={scrub}
      onStartAt={(t) => {
        // Let go: that's the start. The song keeps playing from there so you hear it.
        if (listening) void player.seekTo(Math.max(range.bounds.start, Math.min(listenUntil - 0.5, t))).catch(() => {});
        range.startFrom(t);
        haptic.select();
      }}
      onStartHere={() => {
        const t = player.currentTime;
        stopListening();
        range.startHere(t);
        haptic.select();
      }}
      onRecord={() => void record()}
      onStop={stop}
      onFlip={granted ? () => setFacing((f) => (f === 'front' ? 'back' : 'front')) : undefined}
      onClose={() => goBack(`/project/${project.id}`)}
      viewfinder={pro.viewfinder}
      status={pro.status}
      tools={pro.tools}
      readout={pro.readout}>
      {granted ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} mode="video" mirror={facing === 'front'} videoQuality="1080p" zoom={pro.zoom} enableTorch={pro.torch} />
      ) : null}
    </RecorderChrome>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: color.stage,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
