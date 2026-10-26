import { Text, type TextProps } from 'react-native';

import { color, type ColorName, type, type TypeVariant } from '@/theme/tokens';

interface Props extends TextProps {
  v?: TypeVariant;
  c?: ColorName;
}

/** Text in the app's type scale. Display sizes cap their growth with Dynamic Type; body text doesn't. */
export function T({ v = 'body', c = 'chalk', style, maxFontSizeMultiplier, ...rest }: Props) {
  const capped = v === 'display' || v === 'title' || v === 'label' || v === 'micro';
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (capped ? 1.3 : undefined)}
      style={[type[v], { color: color[c] }, style]}
    />
  );
}
