import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';

import { mediaUrl } from '@/media/library';

/** An image the artist added, loaded from the app's own storage. */
export function MediaImage({ mediaId, uri, style, label }: { mediaId?: string; uri?: string; style?: StyleProp<ImageStyle>; label?: string }) {
  const [url, setUrl] = useState<string | undefined>(mediaId ? undefined : uri);
  useEffect(() => {
    let live = true;
    if (mediaId) void mediaUrl(mediaId).then((u) => live && setUrl(u ?? uri));
    return () => {
      live = false;
    };
  }, [mediaId, uri]);
  return <Image source={url ? { uri: url } : undefined} style={style} contentFit="cover" accessibilityLabel={label} />;
}
