import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { connectServer, disconnectServer, serverLine, useServer } from '@/live/session';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from './Button';
import { T } from './T';
import { showToast } from './Toast';

/**
 * Connects the app to the studio server that holds the provider keys.
 * Only the server's address and an access code live on this device.
 */
export function ServerCard() {
  const status = useServer((s) => s.status);
  const caps = useServer((s) => s.caps);
  const error = useServer((s) => s.error);
  const config = useServer((s) => s.config);
  const [url, setUrl] = useState(config?.url ?? '');
  const [key, setKey] = useState(config?.key ?? '');
  const on = status === 'on';
  const busy = status === 'checking';

  const connect = async () => {
    const result = await connectServer({ url, key });
    if (result === 'on') showToast('Studio server connected. New videos run live.');
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.lamp, on && styles.lampOn, (status === 'error' || status === 'locked') && styles.lampOff]} />
        <T v="heading">Studio server</T>
      </View>
      <T v="caption" c={status === 'error' || status === 'locked' ? 'chalk' : 'smoke'}>
        {serverLine({ status, caps, error })}
      </T>

      {on ? (
        <>
          <T v="caption" c="ash" numberOfLines={1}>
            {config?.url}
          </T>
          <Button label="Disconnect" variant="secondary" onPress={disconnectServer} />
        </>
      ) : (
        <>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="Server address"
            placeholderTextColor={color.ash}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            keyboardAppearance="dark"
            accessibilityLabel="Studio server address"
          />
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="Access code"
            placeholderTextColor={color.ash}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            keyboardAppearance="dark"
            accessibilityLabel="Studio access code"
          />
          <Button label={busy ? 'Connecting' : 'Connect'} variant="secondary" onPress={() => void connect()} disabled={!url.trim()} busy={busy} />
          <T v="caption" c="ash">
            The server holds your Beeble and Claude keys. This app never sees them.
          </T>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
    gap: space.m,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  lamp: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.ash,
  },
  lampOn: {
    backgroundColor: color.accent,
  },
  lampOff: {
    backgroundColor: color.rig,
    borderWidth: 1,
    borderColor: color.smoke,
  },
  input: {
    ...type.callout,
    color: color.chalk,
    height: 46,
    paddingHorizontal: space.m,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.flat,
  },
});
