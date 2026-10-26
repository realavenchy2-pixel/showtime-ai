import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { LocationKind } from '@/engine/types';
import { Platform } from 'react-native';

// Stand-in footage for the prototype: each location as a small illustrated plate, with the
// artist as a silhouette. "room" is the raw phone take before the switch.

export type SceneKind = LocationKind | 'room';

interface Props {
  kind: SceneKind;
  /** Light the artist to match the location, as the switch does. */
  relit?: boolean;
  /** Big text placed behind the artist (the "text behind you" effect). */
  behindText?: string;
  /** Hide the artist, e.g. for b-roll. */
  noArtist?: boolean;
}

const displayFont = Platform.select({ web: 'BigShouldersDisplay_900Black, "Arial Narrow", sans-serif', default: 'BigShouldersDisplay_900Black' });

export function SceneArt({ kind, relit = kind !== 'room', behindText, noArtist }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${name}${uid}`;
  const rim = rimColor(kind);

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1B2236" />
          <Stop offset="0.55" stopColor="#6B4A5E" />
          <Stop offset="0.62" stopColor="#E8945A" />
        </LinearGradient>
        <LinearGradient id={id('sea')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A3F5C" />
          <Stop offset="1" stopColor="#141A2B" />
        </LinearGradient>
        <LinearGradient id={id('alley')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0C0B0E" />
          <Stop offset="1" stopColor="#1E1716" />
        </LinearGradient>
        <LinearGradient id={id('wet')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A1414" />
          <Stop offset="1" stopColor="#070606" />
        </LinearGradient>
        <LinearGradient id={id('cone')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF4DE" stopOpacity="0.42" />
          <Stop offset="1" stopColor="#FFF4DE" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id={id('rim')} cx="50" cy="56" r="42" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#4A433B" stopOpacity="1" />
          <Stop offset="1" stopColor="#050505" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={id('cyc')} cx="50" cy="40" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F4F2EE" />
          <Stop offset="1" stopColor="#CFCBC3" />
        </RadialGradient>
        <LinearGradient id={id('wall')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4D4842" />
          <Stop offset="1" stopColor="#3A3631" />
        </LinearGradient>
        <RadialGradient id={id('neon')} cx="78" cy="30" r="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#4FD1C5" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#4FD1C5" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {kind === 'room' && (
        <G>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id('wall')})`} />
          <Rect x="8" y="16" width="24" height="32" fill="#77828B" opacity="0.45" />
          <Line x1="20" y1="16" x2="20" y2="48" stroke="#3A3631" strokeWidth="1" />
          <Line x1="8" y1="32" x2="32" y2="32" stroke="#3A3631" strokeWidth="1" />
          <Rect x="72" y="22" width="18" height="58" fill="none" stroke="#2E2A26" strokeWidth="1.4" />
          <Circle cx="82" cy="12" r="5" fill="#E9D9B4" opacity="0.35" />
          <Rect x="0" y="80" width="100" height="20" fill="#2A2622" />
        </G>
      )}

      {kind === 'alley' && (
        <G>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id('alley')})`} />
          <Rect x="30" y="14" width="40" height="66" fill="#140F0E" />
          <Polygon points="0,0 30,14 30,80 0,100" fill="#2A1D18" />
          <Polygon points="100,0 70,14 70,80 100,100" fill="#231815" />
          {[22, 34, 46, 58, 70].map((y) => (
            <Line key={`l${y}`} x1="0" y1={y + 4} x2="30" y2={y * 0.75 + 12} stroke="#3A2A22" strokeWidth="0.6" />
          ))}
          {[22, 34, 46, 58, 70].map((y) => (
            <Line key={`r${y}`} x1="100" y1={y + 4} x2="70" y2={y * 0.75 + 12} stroke="#33251F" strokeWidth="0.6" />
          ))}
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id('neon')})`} />
          <Rect x="74" y="24" width="10" height="16" rx="1.5" fill="none" stroke="#4FD1C5" strokeWidth="1" opacity="0.9" />
          <Polygon points="30,80 70,80 100,100 0,100" fill={`url(#${id('wet')})`} />
          <Line x1="58" y1="84" x2="62" y2="96" stroke="#4FD1C5" strokeWidth="0.8" opacity="0.4" />
          <Ellipse cx="38" cy="78" rx="10" ry="3" fill="#C9C4BC" opacity="0.06" />
        </G>
      )}

      {kind === 'hangingMic' && (
        <G>
          <Rect x="0" y="0" width="100" height="100" fill="#030303" />
          <Polygon points="44,0 56,0 84,100 16,100" fill={`url(#${id('cone')})`} />
          <Ellipse cx="50" cy="96" rx="30" ry="4" fill="#FFF4DE" opacity="0.08" />
          {noArtist && (
            <G>
              <Line x1="50" y1="0" x2="50" y2="34" stroke="#8A857E" strokeWidth="0.5" />
              <Rect x="47.6" y="40" width="4.8" height="11" rx="1.4" fill="#BDB7AE" />
              <Ellipse cx="50" cy="38" rx="4.2" ry="5" fill="#D8D2C8" />
            </G>
          )}
        </G>
      )}

      {kind === 'beach' && (
        <G>
          <Rect x="0" y="0" width="100" height="62" fill={`url(#${id('sky')})`} />
          <Circle cx="50" cy="62" r="9" fill="#F6C37A" opacity="0.92" />
          <Rect x="0" y="62" width="100" height="20" fill={`url(#${id('sea')})`} />
          {[66, 70, 74, 78].map((y, i) => (
            <Line key={y} x1={44 - i * 3} y1={y} x2={56 + i * 3} y2={y} stroke="#F6C37A" strokeWidth="0.7" opacity={0.55 - i * 0.1} />
          ))}
          <Rect x="0" y="82" width="100" height="18" fill="#3A2C27" />
        </G>
      )}

      {kind === 'whiteVoid' && (
        <G>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id('cyc')})`} />
          <Ellipse cx="50" cy="96" rx="22" ry="3.5" fill="#000000" opacity="0.16" />
        </G>
      )}

      {kind === 'darkVoid' && (
        <G>
          <Rect x="0" y="0" width="100" height="100" fill="#050505" />
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${id('rim')})`} />
          <Ellipse cx="50" cy="97" rx="24" ry="3" fill="#F2F0EC" opacity="0.05" />
        </G>
      )}

      {behindText ? (
        <SvgText
          x="50"
          y="50"
          fill={kind === 'whiteVoid' ? '#111111' : '#F2F0EC'}
          opacity={0.92}
          fontSize="19"
          fontWeight="900"
          fontFamily={displayFont}
          textAnchor="middle">
          {behindText}
        </SvgText>
      ) : null}

      {!noArtist && <Artist kind={kind} relit={relit} rim={rim} />}
    </Svg>
  );
}

function rimColor(kind: SceneKind): string {
  switch (kind) {
    case 'alley':
      return '#4FD1C5';
    case 'beach':
      return '#F6C37A';
    case 'hangingMic':
      return '#FFF4DE';
    case 'darkVoid':
      return '#D9D2C7';
    case 'whiteVoid':
      return '#FFFFFF';
    default:
      return '#000000';
  }
}

/** The artist mid-verse: hood up, mic in the right hand. */
function Artist({ kind, relit, rim }: { kind: SceneKind; relit: boolean; rim: string }) {
  const body = kind === 'room' ? '#24201C' : kind === 'whiteVoid' ? '#1A1A1A' : '#0B0B0B';
  const edge = relit && kind !== 'room' ? rim : 'none';
  return (
    <G>
      <Path
        d="M30 100 C31 82 35 70 44 66 L56 66 C65 70 69 82 70 100 Z"
        fill={body}
        stroke={edge}
        strokeWidth="0.7"
        strokeOpacity="0.85"
      />
      <Path d="M41 60 C41 48 59 48 59 60 C59 68 54 71 50 71 C46 71 41 68 41 60 Z" fill={body} stroke={edge} strokeWidth="0.7" strokeOpacity="0.85" />
      <Path d="M58 72 C64 70 67 64 64 57" fill="none" stroke={body} strokeWidth="5" strokeLinecap="round" />
      <Ellipse cx="63" cy="54" rx="2.6" ry="3.4" fill={relit ? '#BDB7AE' : '#4A453F'} />
    </G>
  );
}
