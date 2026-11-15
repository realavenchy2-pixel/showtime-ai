import { useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { RecorderChrome, type RecorderPhase } from '@/components/record/RecorderChrome';
import { goBack } from '@/components/Screen';
import { T } from '@/components/T';
import { showToast } from '@/components/Toast';
import { useApp, useProject } from '@/engine/store';
import { addRecorded } from '@/lib/footage';
import { haptic } from '@/lib/haptics';
import { useTakeRange } from '@/lib/takeRange';
import { audioContext, playPrimed, primeElement, scheduleClick, songPeaks, songUrl } from '@/media/audio.web';
import { cameraSupported, CameraSession, grabStill, type Facing } from '@/media/recorder.web';
import { saveRecording } from '@/media/takes.web';
import { color } from '@/theme/tokens';

const NO_CAMERA = {
  title: "The camera can't open here",
  body: 'Open the app in Chrome or Safari and allow the camera. You can also upload clips you already shot from the Shoot stage.',
};
const DENIED = {
  title: 'Camera access is off',
  body: 'Allow the camera and microphone for this site in your browser, then open the recorder again. The mic is only used to line your take up with the song.',
};

function waitUntil(ac: AudioContext, at: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => (cancelled() || ac.currentTime >= at ? resolve() : setTimeout(tick, 6));
    tick();
  });
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The recorder: the song plays, the camera rolls, and every take lands lined up with the track. */
export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const apply = useApp((s) => s.apply);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Bumped to cancel a count-in or a take that is still starting. */
  const runRef = useRef(0);
  const takeRef = useRef<{ startedPerf: number; samples: number[]; from: number; hookOnly: boolean } | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>(() => (cameraSupported() ? 'opening' : 'blocked'));
  const [blocked, setBlocked] = useState<{ title: string; body: string } | undefined>(() => (cameraSupported() ? undefined : NO_CAMERA));
  const [beat, setBeat] = useState(4);
  const [songTime, setSongTime] = useState(0);
  const [facing, setFacing] = useState<Facing>('user');
  const [peaks, setPeaks] = useState<number[] | undefined>(project?.song?.peaks);
  const [listening, setListening] = useState(false);

  const song = project?.song;
  const take = useTakeRange(project);
  const { from, to, hookOnly } = take;
  const n = project?.takes.length ?? 0;

  // Camera: open once, close on the way out.
  useEffect(() => {
    let live = true;
    if (!cameraSupported()) return;
    const attach = (stream: MediaStream) => {
      const el = videoRef.current;
      if (!el) return;
      el.srcObject = stream;
      void el.play().catch(() => {});
    };
    CameraSession.open('user').then(
      (session) => {
        if (!live) return session.close();
        sessionRef.current = session;
        session.onStream = attach;
        attach(session.stream);
        setPhase('idle');
      },
      (err: DOMException) => {
        if (!live) return;
        setBlocked(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? DENIED : NO_CAMERA);
        setPhase('blocked');
      },
    );
    return () => {
      live = false;
      runRef.current += 1;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  // The song, loaded and ready before the first take.
  useEffect(() => {
    if (!song) return;
    let live = true;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    void songUrl(song).then((url) => {
      if (live && url) audio.src = url;
    });
    void songPeaks(song)
      .then((p) => live && setPeaks(p))
      .catch(() => {});
    return () => {
      live = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [song]);

  const stop = async () => {
    const session = sessionRef.current;
    const audio = audioRef.current;
    const take = takeRef.current;
    if (!session || !audio || !take || !project || !song || !session.recording) return;
    takeRef.current = null;
    setPhase('saving');
    const still = videoRef.current ? grabStill(videoRef.current) : {};
    audio.pause();
    try {
      const raw = await session.stop();
      // Where the song was when the first frame was written, by the recorder's clock.
      const clockStart = median(take.samples) ?? take.from;
      const rec = await saveRecording(raw, song, clockStart, still);
      apply(project.id, (p) => addRecorded(p, rec, take.from, take.hookOnly));
      haptic.success();
      showToast(`Take ${n + 1} saved and lined up with the song`);
    } catch {
      showToast('That take could not be saved. Try again.');
    }
    setPhase('idle');
  };
  const onTick = useEffectEvent(() => {
    const audio = audioRef.current;
    const take = takeRef.current;
    if (!audio || !take) return;
    const t = audio.currentTime;
    setSongTime(t);
    if (take.samples.length < 12 && !audio.paused && t > take.from) take.samples.push(t - (performance.now() - take.startedPerf) / 1000);
    if (t >= to - 0.03 || audio.ended) void stop();
  });

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(onTick, 80);
    return () => clearInterval(timer);
  }, [phase]);

  // Listening: the song plays from where the take starts, so the artist hears the spot.
  const onListenTick = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setSongTime(audio.currentTime);
    if (audio.paused || audio.currentTime >= to - 0.03) {
      audio.pause();
      setListening(false);
    }
  });
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(onListenTick, 80);
    return () => clearInterval(timer);
  }, [listening]);
  const stopListening = () => {
    if (!listening) return;
    audioRef.current?.pause();
    setListening(false);
  };
  const listen = () => {
    const audio = audioRef.current;
    if (!audio || phase !== 'idle') return;
    if (listening) return stopListening();
    audio.currentTime = from;
    setSongTime(from);
    void audio.play().then(
      () => setListening(true),
      () => showToast('The song could not play. Check that this tab is allowed to play sound.'),
    );
  };

  if (!project || !song) {
    return (
      <View style={{ flex: 1, backgroundColor: color.stage, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <T v="body" c="smoke">
          Pick a song first.
        </T>
        <Button label="Back" variant="quiet" onPress={() => goBack()} />
      </View>
    );
  }

  const record = async () => {
    const session = sessionRef.current;
    const audio = audioRef.current;
    if (!session || !audio || phase !== 'idle') return;
    setListening(false);
    const run = (runRef.current += 1);
    const cancelled = () => runRef.current !== run;
    const ac = audioContext();
    const beatSec = 60 / song.bpm;
    audio.pause();
    audio.currentTime = from;
    // Inside the tap, so the phone lets the song start on its own after the count-in.
    primeElement(audio);
    setSongTime(from);
    setBeat(4);
    setPhase('countin');
    haptic.beat();

    // Four clicks on the audio clock, then the song lands on the next beat.
    const first = ac.currentTime + 0.15;
    for (let k = 0; k < 4; k++) scheduleClick(first + k * beatSec, k === 0);
    const downbeat = first + 4 * beatSec;
    for (let k = 1; k < 4; k++) {
      void waitUntil(ac, first + k * beatSec, cancelled).then(() => {
        if (cancelled()) return;
        setBeat(4 - k);
        haptic.beat();
      });
    }

    // The camera rolls just before the downbeat so the first frame is never late.
    await waitUntil(ac, downbeat - 0.3, cancelled);
    if (cancelled()) return;
    try {
      await session.start();
    } catch {
      showToast('The camera could not start recording.');
      setPhase('idle');
      return;
    }
    takeRef.current = { startedPerf: performance.now(), samples: [], from, hookOnly };
    audio.pause();
    audio.currentTime = from;
    await waitUntil(ac, downbeat - 0.02, cancelled);
    if (cancelled()) return;
    try {
      await playPrimed(audio);
    } catch {
      showToast('The song could not start. Check that this tab is allowed to play sound.');
    }
    haptic.confirm();
    setPhase('recording');
  };

  const flip = async () => {
    const session = sessionRef.current;
    if (!session || phase !== 'idle') return;
    try {
      await session.flip();
      setFacing(session.facing);
    } catch {
      showToast('This device has one camera.');
    }
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
      parts={take.parts}
      partId={take.partId}
      peaks={peaks}
      blocked={blocked}
      listening={listening}
      onListen={phase === 'blocked' ? undefined : listen}
      onPart={(id) => {
        stopListening();
        take.pick(id);
      }}
      onStartAt={(t) => {
        stopListening();
        take.startFrom(t);
      }}
      onRecord={() => void record()}
      onStop={() => void stop()}
      onFlip={phase === 'blocked' ? undefined : () => void flip()}
      onClose={() => goBack(`/project/${project.id}`)}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#000',
          // A selfie preview reads like a mirror; the saved take is not flipped.
          transform: facing === 'user' ? 'scaleX(-1)' : undefined,
        }}
      />
    </RecorderChrome>
  );
}
