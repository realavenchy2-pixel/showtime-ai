import { ArrowUp } from '@/components/icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { color, gutter, radius, space, type } from '@/theme/tokens';

import { Press } from '../Press';

interface Props {
  onSend: (text: string) => void;
  bottomInset: number;
}

/** Talk to the director. Ideas get filed to the stage where they're used. */
export function Composer({ onSend, bottomInset }: Props) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  const send = () => {
    if (!ready) return;
    onSend(text);
    setText('');
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, space.m) }]}>
      <TextInput
        nativeID="director-input"
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        placeholder="Talk to your director"
        placeholderTextColor={color.ash}
        style={styles.input}
        returnKeyType="send"
        submitBehavior="submit"
        accessibilityLabel="Message to the director"
        autoCapitalize="sentences"
        autoComplete="off"
        textContentType="none"
        keyboardAppearance="dark"
        maxLength={400}
      />
      <Press
        onPress={send}
        disabled={!ready}
        accessibilityLabel="Send"
        style={[styles.send, ready ? styles.sendReady : styles.sendIdle]}
        hitSlop={6}>
        <ArrowUp size={20} color={ready ? color.stage : color.ash} strokeWidth={2.6} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: gutter,
    paddingTop: space.m,
    backgroundColor: color.curtain,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  input: {
    ...type.body,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderRadius: radius.l,
    backgroundColor: color.flat,
    color: color.chalk,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendReady: {
    backgroundColor: color.chalk,
  },
  sendIdle: {
    backgroundColor: color.flat,
  },
});
