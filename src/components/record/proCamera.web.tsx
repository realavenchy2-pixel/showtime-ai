import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useCamPrefs } from '@/lib/camPrefs';
import { haptic } from '@/lib/haptics';
import { audioContext } from '@/media/audio.web';
import { clippedShare, dbfs, fitRect, formatGuides, formatMinutes, holdPeak, lumaHistogram, meterFill, minutesLeft, resolutionName, rollDegrees, timecode, type Rect, type Size } from '@/media/procam';
import { color, radius, space } from '@/theme/tokens';

import { T } from '../T';
import { showToast } from '../Toast';
import { FrameLines, GuideBoxes, HudBar, LensSlider, LevelLine, ToolRail, type ProCameraInput, type ProCameraParts, type RailItem } from './Viewfinder';

// The pro camera on the web app: everything a cinema camera's monitor gives you that a browser can
// really do. Zebras and focus peaking run on the GPU over the live picture; the histogram and mic
// meter read the actual signal; zoom, exposure, white balance and the light appear only when this
// phone's camera supports them, and they really change the camera.

interface LensCaps {
  zoom?: { min: number; max: number; step: number };
  ev?: { min: number; max: number; step: number };
  kelvin?: { min: number; max: number; step: number };
  torch?: boolean;
}

type Range = { min?: number; max?: number; step?: number };
type Caps = MediaTrackCapabilities & { zoom?: Range; exposureCompensation?: Range; colorTemperature?: Range; whiteBalanceMode?: string[]; torch?: boolean };

function range(r: Range | undefined): { min: number; max: number; step: number } | undefined {
  if (!r || r.min === undefined || r.max === undefined || r.max <= r.min) return undefined;
  return { min: r.min, max: r.max, step: r.step && r.step > 0 ? r.step : (r.max - r.min) / 100 };
}

function readCaps(stream: MediaStream | null | undefined): LensCaps {
  const track = stream?.getVideoTracks()[0];
  if (!track?.getCapabilities) return {};
  try {
    const c = track.getCapabilities() as Caps;
    return {
      zoom: range(c.zoom),
      ev: range(c.exposureCompensation),
      kelvin: c.whiteBalanceMode?.includes('manual') ? range(c.colorTemperature) : undefined,
      torch: c.torch === true,
    };
  } catch {
    return {};
  }
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = `attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision mediump float;
uniform sampler2D tex; uniform vec2 texel; uniform float time; uniform float zebra; uniform float peak; uniform vec3 peakColor;
varying vec2 uv;
float luma(vec2 c) { return dot(texture2D(tex, c).rgb, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec4 outc = vec4(0.0);
  if (peak > 0.5) {
    float tl = luma(uv + texel * vec2(-1.0, -1.0)); float t = luma(uv + texel * vec2(0.0, -1.0)); float tr = luma(uv + texel * vec2(1.0, -1.0));
    float l = luma(uv + texel * vec2(-1.0, 0.0)); float r = luma(uv + texel * vec2(1.0, 0.0));
    float bl = luma(uv + texel * vec2(-1.0, 1.0)); float b = luma(uv + texel * vec2(0.0, 1.0)); float br = luma(uv + texel * vec2(1.0, 1.0));
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float g = sqrt(gx * gx + gy * gy);
    float a = smoothstep(0.32, 0.5, g);
    outc = vec4(peakColor * a, a);
  }
  if (zebra > 0.5 && luma(uv) >= 0.95) {
    float s = mod(gl_FragCoord.x + gl_FragCoord.y - time * 28.0, 12.0);
    outc = s < 6.0 ? vec4(0.9, 0.9, 0.9, 0.9) : max(outc, vec4(0.0, 0.0, 0.0, 0.35));
  }
  gl_FragColor = outc;
}`;

/** Zebras at 95% and focus peaking, drawn on the GPU straight from the camera picture. */
function ExposureCanvas({ videoRef, rect, mirrored, zebra, peak }: { videoRef: RefObject<HTMLVideoElement | null>; rect: Rect; mirrored: boolean; zebra: boolean; peak: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The switches change what the shader draws, not the GL setup: a canvas only ever gets one context.
  const flags = useRef({ zebra, peak });
  useEffect(() => {
    flags.current = { zebra, peak };
  }, [zebra, peak]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return;
    const shader = (kind: number, src: string) => {
      const s = gl.createShader(kind)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform3fv(u('peakColor'), hexRgb(color.success));
    const texel = u('texel');
    const time = u('time');
    const zebraOn = u('zebra');
    const peakOn = u('peak');
    let raf = 0;
    let alive = true;
    const draw = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      if (video.readyState < 2 || !video.videoWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch {
        return;
      }
      // Edges are measured one screen pixel apart, so peaking reads the same at any camera resolution.
      gl.uniform2f(texel, 1 / w, 1 / h);
      gl.uniform1f(time, now / 1000);
      gl.uniform1f(zebraOn, flags.current.zebra ? 1 : 0);
      gl.uniform1f(peakOn, flags.current.peak ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, [videoRef]);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, transform: mirrored ? 'scaleX(-1)' : undefined, pointerEvents: 'none' }}
    />
  );
}

/** The brightness histogram, from a small copy of the live picture a few times a second. */
function Histogram({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [over, setOver] = useState(0);
  useEffect(() => {
    const out = canvasRef.current;
    const video = videoRef.current;
    if (!out || !video) return;
    const sample = document.createElement('canvas');
    sample.width = 80;
    sample.height = 45;
    const sg = sample.getContext('2d', { willReadFrequently: true });
    const g = out.getContext('2d');
    if (!sg || !g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    out.width = 92 * dpr;
    out.height = 34 * dpr;
    const timer = setInterval(() => {
      if (video.readyState < 2 || !video.videoWidth) return;
      try {
        sg.drawImage(video, 0, 0, sample.width, sample.height);
        const data = sg.getImageData(0, 0, sample.width, sample.height).data;
        const bins = lumaHistogram(data, 46);
        g.clearRect(0, 0, out.width, out.height);
        const bw = out.width / bins.length;
        g.fillStyle = 'rgba(255,255,255,0.78)';
        bins.forEach((v, i) => {
          const h = Math.max(v > 0 ? 1 : 0, v * out.height);
          g.fillRect(i * bw, out.height - h, Math.max(1, bw - 0.5), h);
        });
        setOver(clippedShare(data));
      } catch {
        // A frame that can't be read yet.
      }
    }, 140);
    return () => clearInterval(timer);
  }, [videoRef]);
  const blown = Math.round(over * 100);
  return (
    <View style={styles.scope} accessibilityLabel={`Exposure histogram${blown >= 2 ? `, ${blown} percent blown out` : ''}`}>
      <canvas ref={canvasRef} style={{ width: 92, height: 34, display: 'block' }} />
      <T v="micro" c={blown >= 2 ? 'chalk' : 'smoke'} style={styles.scopeLabel}>
        {blown >= 2 ? `Luma, ${blown}% over` : 'Luma'}
      </T>
    </View>
  );
}

/** The mic meter in dBFS, with a peak that holds and falls back. */
function MicMeter({ stream }: { stream?: MediaStream | null }) {
  const [level, setLevel] = useState({ rms: -96, peak: -96 });
  const hasMic = !!stream?.getAudioTracks().length;
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    let ac: AudioContext;
    try {
      ac = audioContext();
    } catch {
      return;
    }
    const source = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    const sink = ac.createGain();
    sink.gain.value = 0;
    source.connect(analyser);
    analyser.connect(sink);
    sink.connect(ac.destination);
    const buf = new Float32Array(analyser.fftSize);
    let held = -96;
    let last = performance.now();
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      let sum = 0;
      for (const v of buf) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      const now = performance.now();
      held = holdPeak(held, dbfs(peak), (now - last) / 1000);
      last = now;
      setLevel({ rms: dbfs(Math.sqrt(sum / buf.length)), peak: held });
    }, 66);
    return () => {
      clearInterval(timer);
      try {
        source.disconnect();
        analyser.disconnect();
        sink.disconnect();
      } catch {
        // Already gone.
      }
    };
  }, [stream]);
  const clip = level.peak > -1;
  return (
    <View style={styles.scope} accessibilityLabel={hasMic ? `Mic level ${Math.round(level.rms)} decibels` : 'No mic'}>
      <View style={styles.meter}>
        {/* Green is a healthy level, white is hot. */}
        <View style={[styles.meterFill, { width: `${meterFill(level.rms) * 100}%`, backgroundColor: level.rms > -12 ? color.chalk : color.success }]} />
        <View style={[styles.meterPeak, { left: `${meterFill(level.peak) * 100}%` }]} />
        {[-40, -20, -12, -6].map((db) => (
          <View key={db} style={[styles.meterTick, { left: `${meterFill(db) * 100}%` }]} />
        ))}
      </View>
      <T v="micro" c={clip ? 'chalk' : 'smoke'} style={[styles.scopeLabel, styles.tabular]}>
        {!hasMic ? 'No mic' : clip ? 'Mic, clipping' : `Mic ${level.rms <= -60 ? '-∞' : Math.round(level.rms)} dB`}
      </T>
    </View>
  );
}

/** Sends lens changes to the camera at most once a frame while a finger slides, so it isn't flooded. */
class LensDriver {
  private pending: MediaTrackConstraintSet = {};
  private frame = 0;

  apply(track: MediaStreamTrack, patch: MediaTrackConstraintSet): void {
    this.pending = { ...this.pending, ...patch };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const next = this.pending;
      this.pending = {};
      void track.applyConstraints({ advanced: [next] }).catch(() => {});
    });
  }
}

export function useProCamera(input: ProCameraInput): ProCameraParts {
  const { videoRef, stream, mirrored, formats, recording, elapsedSec, hidden } = input;
  const prefs = useCamPrefs();
  const dims = useWindowDimensions();
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [media, setMedia] = useState<Size>({ w: 0, h: 0 });
  const [roll, setRoll] = useState<number | undefined>();
  const [free, setFree] = useState<number | undefined>();
  const [open, setOpen] = useState<'zoom' | 'ev' | 'wb' | undefined>();
  const caps = useMemo(() => readCaps(stream), [stream]);
  // Lens settings belong to one stream: flipping the camera starts fresh.
  const [lens, setLens] = useState<{ stream?: MediaStream | null; zoom?: number; ev?: number; kelvin?: number; torch: boolean }>({ torch: false });
  const current = lens.stream === stream ? lens : { stream, torch: false };
  const [driver] = useState(() => new LensDriver());

  // The recorded frame's real size, from the preview (it reports portrait on a phone held upright).
  useEffect(() => {
    const el = videoRef?.current;
    if (!el) return;
    const update = () => setMedia({ w: el.videoWidth, h: el.videoHeight });
    el.addEventListener('loadedmetadata', update);
    el.addEventListener('resize', update);
    const first = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(first);
      el.removeEventListener('loadedmetadata', update);
      el.removeEventListener('resize', update);
    };
  }, [videoRef, stream]);

  // Recording time left in this browser's storage, checked again after every take.
  useEffect(() => {
    if (recording) return;
    let live = true;
    void navigator.storage
      ?.estimate?.()
      .then((e) => live && setFree(e.quota !== undefined && e.usage !== undefined ? Math.max(0, e.quota - e.usage) : undefined))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [recording]);

  // The horizon, from the tilt sensor. No reading within a moment means there's no sensor.
  const { level, set } = prefs;
  useEffect(() => {
    if (!level) return;
    let heard = false;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      heard = true;
      const angle = screen.orientation?.angle ?? 0;
      setRoll(Math.round(rollDegrees(e.beta, e.gamma, angle) * 10) / 10);
    };
    window.addEventListener('deviceorientation', onTilt);
    const check = setTimeout(() => {
      if (heard) return;
      showToast('This device has no tilt sensor, so the level is off.');
      set('level', false);
    }, 1800);
    return () => {
      clearTimeout(check);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [level, set]);

  const fit: 'contain' | 'cover' = prefs.pro ? 'contain' : 'cover';
  const frame = fitRect(box, media.w ? media : box, fit);
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  const fps = Math.round(settings?.frameRate ?? 30) || 30;
  const bitrate = media.w * media.h > 1280 * 720 ? 8_128_000 : 5_128_000;
  const guides = prefs.pro && prefs.guides && media.w ? formatGuides(formats, media, frame) : [];

  const applyLens = (patch: MediaTrackConstraintSet) => {
    const track = stream?.getVideoTracks()[0];
    if (track) driver.apply(track, patch);
  };
  const setLensValue = (key: 'zoom' | 'ev' | 'kelvin', value: number, constraint: MediaTrackConstraintSet) => {
    setLens({ ...current, stream, [key]: value });
    applyLens(constraint);
  };

  const toggleLevel = async () => {
    if (!prefs.level) {
      // iPhone asks for the motion sensor, and only from a tap.
      const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (DOE?.requestPermission) {
        const answer = await DOE.requestPermission().catch(() => 'denied');
        if (answer !== 'granted') {
          showToast('Allow motion access to use the level.');
          return;
        }
      }
    }
    prefs.toggle('level');
  };

  const tool = (key: 'guides' | 'grid' | 'zebra' | 'peak' | 'scopes', label: string, hint: string): RailItem => ({
    key,
    label,
    on: prefs[key],
    hint,
    onPress: () => {
      haptic.select();
      prefs.toggle(key);
    },
  });
  const items: RailItem[] = [
    {
      key: 'pro',
      label: 'Pro',
      on: prefs.pro,
      hint: 'Pro camera: frame lines, the whole frame, readouts and tools',
      onPress: () => {
        haptic.select();
        prefs.toggle('pro');
      },
    },
  ];
  if (prefs.pro) {
    items.push(
      tool('zebra', 'Zebra', 'Zebras: stripes where the picture is about to blow out'),
      tool('peak', 'Peak', 'Focus peaking: sharp edges light up green'),
      tool('grid', 'Grid', 'Rule of thirds grid'),
      tool('guides', 'Guides', 'A box for what each post format keeps'),
      tool('scopes', 'Scopes', 'Histogram and mic meter'),
      { key: 'level', label: 'Level', on: prefs.level, hint: 'Level: a horizon that turns green when the phone is straight', onPress: () => void toggleLevel() },
    );
    const zoom = current.zoom ?? caps.zoom?.min;
    const ev = current.ev ?? 0;
    if (caps.zoom && zoom !== undefined) items.push({ key: 'zoom', label: `${zoom.toFixed(1)}×`, on: open === 'zoom', hint: `Zoom, ${zoom.toFixed(1)} times`, onPress: () => setOpen(open === 'zoom' ? undefined : 'zoom') });
    if (caps.ev) items.push({ key: 'ev', label: `EV ${ev > 0 ? '+' : ''}${ev.toFixed(1)}`, on: open === 'ev', hint: `Exposure, ${ev.toFixed(1)}`, onPress: () => setOpen(open === 'ev' ? undefined : 'ev') });
    if (caps.kelvin) items.push({ key: 'wb', label: current.kelvin ? `${Math.round(current.kelvin / 100) * 100}K` : 'WB', on: open === 'wb', hint: 'White balance', onPress: () => setOpen(open === 'wb' ? undefined : 'wb') });
    if (caps.torch)
      items.push({
        key: 'light',
        label: 'Light',
        on: current.torch,
        hint: 'Phone light',
        onPress: () => {
          const on = !current.torch;
          setLens({ ...current, stream, torch: on });
          applyLens({ torch: on } as MediaTrackConstraintSet);
        },
      });
  }

  const sliderTop = dims.height * 0.24;
  const slider =
    prefs.pro && open === 'zoom' && caps.zoom ? (
      <LensSlider label="Zoom" value={current.zoom ?? caps.zoom.min} min={caps.zoom.min} max={caps.zoom.max} top={sliderTop} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => setLensValue('zoom', v, { zoom: v } as MediaTrackConstraintSet)} />
    ) : prefs.pro && open === 'ev' && caps.ev ? (
      <LensSlider
        label="EV"
        value={current.ev ?? 0}
        min={caps.ev.min}
        max={caps.ev.max}
        top={sliderTop}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
        onChange={(v) => {
          const stepped = Math.round(v / caps.ev!.step) * caps.ev!.step;
          setLensValue('ev', stepped, { exposureCompensation: stepped } as MediaTrackConstraintSet);
        }}
      />
    ) : prefs.pro && open === 'wb' && caps.kelvin ? (
      <LensSlider
        label="WB"
        value={current.kelvin ?? (caps.kelvin.min + caps.kelvin.max) / 2}
        min={caps.kelvin.min}
        max={caps.kelvin.max}
        top={sliderTop}
        format={(v) => `${Math.round(v / 100) * 100}K`}
        onChange={(v) => setLensValue('kelvin', v, { whiteBalanceMode: 'manual', colorTemperature: v } as MediaTrackConstraintSet)}
      />
    ) : null;

  const viewfinder = hidden ? null : (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {prefs.pro && (prefs.zebra || prefs.peak) && videoRef && box.w ? <ExposureCanvas videoRef={videoRef} rect={frame} mirrored={mirrored} zebra={prefs.zebra} peak={prefs.peak} /> : null}
      {prefs.pro && box.w ? <GuideBoxes guides={guides} /> : null}
      {prefs.pro && box.w ? <FrameLines frame={frame} grid={prefs.grid} /> : null}
      {prefs.pro && prefs.level && box.w ? <LevelLine frame={frame} roll={roll} /> : null}
    </View>
  );

  const status = prefs.pro ? (
    <HudBar left={media.w ? `${resolutionName(media.w, media.h)}${fps}` : undefined} recording={recording} code={timecode(recording ? elapsedSec : 0, fps)} />
  ) : undefined;

  const tools = hidden ? null : (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {prefs.pro && prefs.scopes ? (
        <View style={[styles.scopes, { top: dims.height * 0.24 }]} pointerEvents="none">
          {videoRef ? <Histogram videoRef={videoRef} /> : null}
          <MicMeter stream={stream} />
        </View>
      ) : null}
      <ToolRail items={items} top={dims.height * 0.24} maxHeight={dims.height * 0.3} />
      {slider}
    </View>
  );

  const readout = prefs.pro && free !== undefined ? formatMinutes(minutesLeft(free, bitrate)) : undefined;
  return { fit, viewfinder, status, tools, readout, zoom: 0, torch: false };
}

const styles = StyleSheet.create({
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  scopes: {
    position: 'absolute',
    left: 8,
    gap: 6,
  },
  scope: {
    width: 108,
    padding: space.s,
    gap: 4,
    borderRadius: radius.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  scopeLabel: {
    fontSize: 9,
    lineHeight: 11,
  },
  meter: {
    height: 8,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  meterPeak: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.chalk,
  },
  meterTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});
