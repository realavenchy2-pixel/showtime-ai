import { describe, expect, it } from 'vitest';

import { clippedShare, cropOf, dbfs, fitRect, formatGuides, formatMinutes, holdPeak, lumaHistogram, meterFill, minutesLeft, resolutionName, rollDegrees, timecode } from '../procam';

describe('pro viewfinder math', () => {
  it('counts timecode in frames', () => {
    expect(timecode(0, 30)).toBe('00:00:00:00');
    expect(timecode(12.27, 30)).toBe('00:00:12:08');
    expect(timecode(3725.5, 24)).toBe('01:02:05:12');
    expect(timecode(1 - 1 / 30, 30)).toBe('00:00:00:29');
  });

  it('shows the whole recorded frame, or fills the screen', () => {
    // A 9:16 take on a taller phone screen: bars above and below, nothing cut off.
    const contain = fitRect({ w: 390, h: 844 }, { w: 1080, h: 1920 }, 'contain');
    expect(contain.w).toBeCloseTo(390);
    expect(contain.h).toBeCloseTo(693.33, 1);
    expect(contain.y).toBeCloseTo(75.33, 1);
    const cover = fitRect({ w: 390, h: 844 }, { w: 1080, h: 1920 }, 'cover');
    expect(cover.h).toBeCloseTo(844);
    expect(cover.x).toBeLessThan(0);
  });

  it('marks what each post format keeps of the frame', () => {
    // Shooting vertical for YouTube: a band across the middle.
    const wide = cropOf({ w: 1080, h: 1920 }, 16 / 9);
    expect(wide.w).toBe(1);
    expect(wide.h).toBeCloseTo((9 / 16) * (9 / 16), 4);
    expect(wide.y).toBeCloseTo((1 - wide.h) / 2, 4);
    // Vertical for Reels from a 9:16 frame needs no box.
    const screen = { x: 0, y: 75, w: 390, h: 693 };
    const guides = formatGuides(['16:9', '9:16', '4:5'], { w: 1080, h: 1920 }, screen);
    expect(guides.map((g) => g.format)).toEqual(['16:9', '4:5']);
    expect(guides[0].label).toBe('YouTube 16:9');
    for (const g of guides) {
      expect(g.rect.x).toBeGreaterThanOrEqual(screen.x - 0.01);
      expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(screen.y + screen.h + 0.01);
    }
  });

  it('reads exposure from the picture', () => {
    // Half black, half white pixels.
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const h = lumaHistogram(px, 4);
    expect(Array.from(h)).toEqual([1, 0, 0, 1]);
    expect(clippedShare(px)).toBe(0.5);
  });

  it('meters the mic in dBFS with a peak that falls back', () => {
    expect(dbfs(1)).toBe(0);
    expect(dbfs(0.5)).toBeCloseTo(-6.02, 1);
    expect(dbfs(0)).toBe(-96);
    expect(meterFill(-60)).toBe(0);
    expect(meterFill(-30)).toBe(0.5);
    expect(meterFill(3)).toBe(1);
    expect(holdPeak(-10, -6, 0.1)).toBe(-6);
    expect(holdPeak(-6, -40, 0.5)).toBe(-16);
  });

  it('knows which way is level however the phone is held', () => {
    expect(rollDegrees(80, 3, 0)).toBe(3);
    expect(rollDegrees(4, 70, 90)).toBe(-4);
    expect(rollDegrees(4, 70, 270)).toBe(4);
  });

  it('turns free space into recording time', () => {
    // 8 Mbps is 1 MB a second: 3.6 GB is an hour.
    expect(minutesLeft(3.6e9, 8e6)).toBe(60);
    expect(formatMinutes(134)).toBe('2h 14m');
    expect(formatMinutes(38)).toBe('38m');
    expect(formatMinutes(900)).toBe('15h');
    expect(resolutionName(1920, 1080)).toBe('1080p');
    expect(resolutionName(1080, 1920)).toBe('1080p');
    expect(resolutionName(3840, 2160)).toBe('4K');
    expect(resolutionName(1280, 720)).toBe('720p');
  });
});
