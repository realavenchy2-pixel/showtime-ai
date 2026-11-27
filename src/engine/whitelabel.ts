// White label: the artist never sees which companies or models make the video. The app's own words
// never name them, and anything a provider says (an error, a status) passes through `plainWords`
// before it reaches the screen.

const NAMES: [RegExp, string][] = [
  [/\bbeeble(?:\.ai)?(?:'s)?\b/gi, 'the switch'],
  [/\bswitch\s?x(?:[\s-]*\d+(?:\.\d+)?)?\b/gi, 'the switch'],
  [/\btopaz(?:\s+(?:proteus|starlight))?\b/gi, 'the upscaler'],
  [/\b(?:proteus|starlight)\b/gi, 'the upscaler'],
  [/\b(?:openai|chatgpt|gpt[\s-]?image[\w.-]*|sunburst)\b/gi, 'the image service'],
  [/\b(?:gemini(?:[\s-]+(?:omni|\d[\w.-]*))*|nano\s+banana(?:\s+(?:pro|\d+(?:\.\d+)?))?)\b/gi, 'the render service'],
  [/\bomni\b/gi, 'the render service'],
  [/\b(?:minimax(?:\s+h3)?|h3|hailuo|seedance|kling|veo|sora)\b/gi, 'the render service'],
  [/\bfal(?:\.ai|\.run|\.media)?\b/gi, 'the render service'],
  [/\b(?:anthropic|claude(?:-[\w.-]+)?)\b/gi, 'the director'],
];

/** The same sentence with every provider or model name swapped for what it does. */
export function plainWords(text: string): string {
  let out = text;
  for (const [re, word] of NAMES) out = out.replace(re, word);
  // "OpenAI gpt-image-2.6" becomes one "the image service", not two.
  for (const word of new Set(NAMES.map(([, w]) => w))) out = out.replace(new RegExp(`${word}(?:[\\s,/-]+${word})+`, 'gi'), word);
  // "the the switch" after a swap right behind the word "the".
  return out.replace(/\b(the)\s+the\b/gi, '$1');
}
