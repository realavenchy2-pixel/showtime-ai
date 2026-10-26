import { Modal, StyleSheet, View } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

import { Button } from './Button';
import { T } from './T';

interface Props {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirmation for choices that undo work, like going back to an earlier stage. */
export function Dialog({ visible, title, body, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          <T v="title">{title}</T>
          <T v="body" c="smoke">
            {body}
          </T>
          <View style={styles.actions}>
            <Button label={confirmLabel} onPress={onConfirm} />
            <Button label="Cancel" variant="quiet" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: color.curtain,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    padding: space.xl,
    gap: space.m,
  },
  actions: {
    marginTop: space.s,
    gap: space.xs,
  },
});
