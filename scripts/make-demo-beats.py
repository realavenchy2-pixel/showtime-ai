"""Synthesizes the three original demo beats that ship with Showtime AI.

Everything here is generated from scratch (oscillators and noise), so the beats are ours to ship.
Run:  python3 scripts/make-demo-beats.py   (needs numpy, scipy and ffmpeg)
Writes assets/audio/<id>.mp3 and prints the bar layout that src/engine/samples.ts mirrors.
"""
import os
import subprocess
import sys

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(7)


def env(n, attack, decay, curve=1.0):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    d = np.exp(-np.maximum(t - attack, 0) / decay)
    return (a * d) ** curve


def lp(x, hz, order=2):
    b, a = butter(order, min(hz, SR / 2 - 100) / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), 'high')
    return lfilter(b, a, x)


def kick(length=0.45, punch=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16)
    click = hp(rng.standard_normal(n), 2500) * env(n, 0.0005, 0.004) * 0.35
    return np.tanh((body + click) * 1.8 * punch)


def bass808(freq, length, glide_to=None, drive=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = np.full(n, float(freq))
    if glide_to:
        k = int(n * 0.55)
        f[k:] = np.linspace(freq, glide_to, n - k)
    start = f + 60 * np.exp(-t / 0.02)
    ph = 2 * np.pi * np.cumsum(start) / SR
    x = np.sin(ph) + 0.25 * np.sin(2 * ph)
    return np.tanh(x * drive) * env(n, 0.003, length * 0.75) * 0.9


def snare(length=0.28, tone=185):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n), 1400) * env(n, 0.001, 0.085)
    body = np.sin(2 * np.pi * tone * t) * env(n, 0.001, 0.05) * 0.6
    return np.tanh((noise * 0.9 + body) * 1.4)


def clap(length=0.3):
    n = int(length * SR)
    x = np.zeros(n)
    for off in (0.0, 0.011, 0.023):
        k = int(off * SR)
        burst = hp(rng.standard_normal(n - k), 900) * env(n - k, 0.0005, 0.012)
        x[k:] += burst * 0.7
    tail = lp(hp(rng.standard_normal(n), 800), 6000) * env(n, 0.02, 0.09)
    return np.tanh((x + tail * 0.8) * 1.2)


def hat(length=0.06, open_=False):
    n = int((0.32 if open_ else length) * SR)
    x = hp(rng.standard_normal(n), 7000, 3)
    return x * env(n, 0.0005, 0.11 if open_ else 0.018) * 0.5


def pluck(freq, length, bright=3200, kind='bell'):
    n = int(length * SR)
    t = np.arange(n) / SR
    if kind == 'bell':
        mod = np.sin(2 * np.pi * freq * 3.01 * t) * 2.2 * np.exp(-t / 0.18)
        x = np.sin(2 * np.pi * freq * t + mod)
    elif kind == 'keys':
        x = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2 * t + np.sin(2 * np.pi * freq * t) * 0.8)
    else:  # saw lead
        x = 2 * ((freq * t) % 1) - 1 + 0.6 * (2 * ((freq * 1.007 * t) % 1) - 1)
    return lp(x, bright) * env(n, 0.004, length * 0.4)


def pad(freqs, length, cutoff=900):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (0.996, 1.0, 1.005):
            x += 2 * ((f * det * t) % 1) - 1
    x = lp(x / (3 * len(freqs)), cutoff, 2)
    fade = np.minimum(1, np.minimum(t / 0.4, (length - t) / 0.5))
    return x * np.clip(fade, 0, 1)


def place(buf, sound, at_sec, gain=1.0, pan=0.0):
    k = int(round(at_sec * SR))
    if k >= buf.shape[1]:
        return
    n = min(len(sound), buf.shape[1] - k)
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, k:k + n] += sound[:n] * gain * left
    buf[1, k:k + n] += sound[:n] * gain * right


def echo(x, delay_sec, feedback=0.35, mix=0.3, cutoff=2600):
    d = int(delay_sec * SR)
    out = x.copy()
    wet = np.zeros_like(x)
    tap = x.copy()
    for _ in range(5):
        tap = np.concatenate([np.zeros((2, d)), tap[:, :-d]], axis=1) * feedback
        tap = np.stack([lp(tap[1], cutoff), lp(tap[0], cutoff)])  # ping-pong
        wet += tap
    return out + wet * mix / feedback


NOTE = {n: 440 * 2 ** ((i - 9) / 12) for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def hz(name, octave):
    return NOTE[name] * 2 ** (octave - 4)


def build(track):
    bpm, layout = track['bpm'], track['layout']
    beat = 60 / bpm
    bar = beat * 4
    total_bars = sum(b for _, _, b in layout)
    n = int((total_bars * bar + 1.5) * SR)
    drums = np.zeros((2, n))
    low = np.zeros((2, n))
    music = np.zeros((2, n))
    style = track['style']
    roots = track['roots']  # one root note per bar, cycling
    scale = track['scale']
    k, s, c = kick(), snare(tone=track.get('snare', 185)), clap()
    h, oh = hat(), hat(open_=True)

    bar_i = 0
    for kind, _label, bars in layout:
        for b in range(bars):
            t0 = bar_i * bar
            root = roots[bar_i % len(roots)]
            full = kind in ('hook', 'verse')
            hot = kind == 'hook'
            last_of_section = b == bars - 1
            # ----- drums
            if style == 'drill':
                kicks = [0, 0.75, 2.5] if b % 2 == 0 else [0, 1.5, 2.75, 3.5]
                snares = [2.0] if not hot else [2.0, 3.75 if b % 4 == 3 else 2.0]
                hats = [i * (1 / 3) for i in range(12)] if hot else [i * 0.5 for i in range(8)]
            elif style == 'trap':
                kicks = [0, 1.75, 2.5] if b % 2 == 0 else [0, 0.75, 2.5, 3.25]
                snares = [2.0]
                hats = [i * 0.25 for i in range(16)] if full else [i * 0.5 for i in range(8)]
            else:  # boom bap
                kicks = [0, 1.5, 2.25] if b % 2 == 0 else [0, 2.5]
                snares = [1.0, 3.0]
                hats = [i * 0.5 + (0.08 if i % 2 else 0) for i in range(8)]
            if kind == 'intro':
                kicks, snares = ([0] if b >= bars - 2 else []), []
                hats = hats[::2] if b >= bars // 2 else []
            if kind == 'outro':
                kicks, snares = kicks[:1], snares[:1] if b < bars - 1 else []
            for pos in kicks:
                place(drums, k, t0 + pos * beat, 0.95)
            for pos in snares:
                place(drums, s, t0 + pos * beat, 0.6)
                if style != 'boom':
                    place(drums, c, t0 + pos * beat, 0.4)
            for i, pos in enumerate(hats):
                place(drums, h, t0 + pos * beat, 0.3 + 0.12 * (i % 2 == 0), pan=0.25 if i % 2 else -0.15)
            if style == 'trap' and full and b % 2 == 1:  # hat roll into the next bar
                for i in range(8):
                    place(drums, h, t0 + (3 + i / 8) * beat, 0.16 + i * 0.03, pan=0.3)
            if hot and b % 4 == 3:
                place(drums, oh, t0 + 3.5 * beat, 0.35, pan=-0.3)
            if last_of_section and kind != 'outro':  # fill into the next section
                for i, pos in enumerate([3.0, 3.25, 3.5, 3.75]):
                    place(drums, s, t0 + pos * beat, 0.25 + i * 0.1)
            # ----- 808 / bass
            if kind not in ('intro',):
                f = hz(root, 1)
                if style == 'drill':
                    place(low, bass808(f, beat * 1.4, glide_to=f * (1.5 if b % 2 else 0.75)), t0, 0.9)
                    place(low, bass808(f, beat * 0.9), t0 + 2.5 * beat, 0.8)
                elif style == 'trap':
                    place(low, bass808(f, beat * 1.6), t0, 0.9)
                    place(low, bass808(f * (1.189 if b % 2 else 1), beat * 1.3, glide_to=f), t0 + 2.5 * beat, 0.8)
                else:
                    for pos in ([0, 1.5, 2.25] if b % 2 == 0 else [0, 2.5]):
                        place(low, bass808(f * 2, beat * 0.7, drive=1.3), t0 + pos * beat, 0.6)
            # ----- music
            chord = [hz(root, 3), hz(root, 3) * scale[2], hz(root, 3) * scale[4]]
            place(music, pad(chord, bar * 1.02, cutoff=1100 if hot else 700), t0, 0.5 if hot else 0.36)
            motif = track['motif']
            if kind != 'outro' or b < bars - 1:
                for step, deg in motif[(bar_i if hot else bar_i // 2) % len(motif)]:
                    if deg is None:
                        continue
                    f = hz(root, 5 if style != 'boom' else 4) * scale[deg % len(scale)] * (2 if deg >= len(scale) else 1)
                    snd = pluck(f, beat * (1.2 if style == 'boom' else 0.9), kind=track['voice'], bright=3600 if hot else 2400)
                    place(music, snd, t0 + step * beat, 0.34 if hot else 0.26, pan=0.35 * np.sin(step * 2.1))
            bar_i += 1

    music = echo(music, beat * 0.75, feedback=0.4, mix=0.22)
    # Sidechain: the kick ducks the music and the 808 a little.
    duck = np.ones(n)
    kick_env = np.abs(drums[0]) + np.abs(drums[1])
    kick_env = lp(kick_env, 12)
    duck -= np.clip(kick_env * 0.5, 0, 0.45)
    mix = drums * 0.9 + low * 0.85 * duck + music * duck
    mix = np.tanh(mix * 1.15)
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= 0.92
    end = int(total_bars * bar * SR)
    fade = int(0.9 * SR)
    mix[:, end:end + fade] *= np.linspace(1, 0, fade)
    mix = mix[:, :end + fade]
    return mix, total_bars * bar


MINOR = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5]
SONG = [('intro', 'Intro', 4), ('verse', 'Verse 1', 12), ('hook', 'Hook', 8), ('verse', 'Verse 2', 12), ('hook', 'Hook', 8), ('outro', 'Outro', 4)]
SHORT = [('intro', 'Intro', 2), ('verse', 'Verse 1', 8), ('hook', 'Hook', 4), ('verse', 'Verse 2', 8), ('hook', 'Hook', 4), ('outro', 'Outro', 2)]

TRACKS = [
    dict(id='out-the-mud', bpm=142, style='drill', layout=SONG, roots=['F', 'F', 'C#', 'D#'], scale=MINOR, voice='bell', snare=200,
         motif=[[(0, 4), (1, 2), (1.5, 0), (3, 2)], [(0, 4), (1, 5), (2, 4), (3.5, 2)], [(0.5, 0), (1.5, 2), (2.5, 4), (3, 6)], [(0, 7), (1, 4), (2, 2), (3, 0)]]),
    dict(id='late-night', bpm=92, style='boom', layout=SHORT, roots=['A', 'F', 'D', 'E'], scale=MINOR, voice='keys', snare=170,
         motif=[[(0, 0), (1, 2), (2.5, 4)], [(0, 2), (1.5, 4), (3, 6)], [(0, 4), (1, 2), (2, 0)], [(0.5, 3), (2, 4), (3, 2)]]),
    dict(id='windy-city', bpm=140, style='trap', layout=SONG, roots=['G', 'G', 'D#', 'F'], scale=MINOR, voice='saw', snare=190,
         motif=[[(0, 0), (0.75, 2), (1.5, 4), (3, 2)], [(0, 4), (1, 6), (2.5, 4), (3.25, 2)], [(0, 7), (1.5, 4), (2.25, 2), (3, 0)], [(0.5, 2), (1.5, 4), (2.5, 6), (3.5, 7)]]),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    wav_dir = sys.argv[1] if len(sys.argv) > 1 else None
    for track in TRACKS:
        mix, duration = build(track)
        pcm = (mix.T * 32767).astype('<i2').tobytes()
        mp3 = os.path.join(OUT, f"{track['id']}.mp3")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], input=pcm, check=True)
        if wav_dir:
            os.makedirs(wav_dir, exist_ok=True)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', os.path.join(wav_dir, f"{track['id']}.wav")], input=pcm, check=True)
        bars = ', '.join(f"{label} {b}" for _, label, b in track['layout'])
        print(f"{track['id']}: {track['bpm']} BPM, {duration:.2f}s, {os.path.getsize(mp3) // 1024} KB  [{bars}]")


if __name__ == '__main__':
    main()
