import type { StageId } from './types';

// The director files ideas the artist drops in chat to the stage where they get used.
// In the real app Claude does this; the prototype uses keyword rules with the same contract.

const RULES: { stage: StageId; words: string[] }[] = [
  {
    stage: 'genjutsu',
    words: ['mic', 'microphone', 'chain', 'chains', 'outfit', 'fit', 'jacket', 'hoodie', 'shoes', 'sneakers', 'grill', 'grills', 'glasses', 'shades', 'hat', 'watch', 'rings'],
  },
  {
    stage: 'vfx',
    words: ['fire', 'flames', 'smoke', 'glitch', 'flash', 'flashes', 'shake', 'zoom', 'effect', 'effects', 'vfx', 'lightning', 'sparks', 'slow-mo', 'slowmo', 'slow', 'rgb', 'strobe', 'glow', 'vhs', 'clone', 'clones'],
  },
  {
    stage: 'broll',
    words: ['b-roll', 'broll', 'cutaway', 'cutaways', 'car', 'cars', 'lambo', 'benz', 'whip', 'money', 'cash', 'crowd', 'skyline', 'city', 'rain', 'jet', 'mansion', 'club', 'drone', 'train', 'block', 'shot of'],
  },
  {
    stage: 'location',
    words: ['beach', 'alley', 'rooftop', 'roof', 'location', 'background', 'desert', 'street', 'warehouse', 'void', 'white room', 'dark room', 'hanging mic', 'studio', 'stage'],
  },
  {
    stage: 'record',
    words: ['angle', 'take', 'takes', 'close-up', 'closeup', 'wide shot', 'low angle'],
  },
];

function tokens(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ')} `;
}

/** Returns the stage an idea belongs to, or null when the text isn't an idea for any stage. */
export function routeIdea(text: string): StageId | null {
  const t = tokens(text);
  let best: { stage: StageId; score: number } | null = null;
  for (const rule of RULES) {
    const score = rule.words.filter((w) => t.includes(` ${w} `)).length;
    if (score > 0 && (!best || score > best.score)) best = { stage: rule.stage, score };
  }
  return best ? best.stage : null;
}
