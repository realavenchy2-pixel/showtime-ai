import { router } from 'expo-router';
import { Bell, ChevronRight, FileText, LifeBuoy, type LucideIcon } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { showToast } from '@/components/Toast';
import { useApp } from '@/engine/store';
import { color, radius, space } from '@/theme/tokens';

export default function AccountScreen() {
  const credits = useApp((s) => s.credits);
  const plan = useApp((s) => s.plan);

  return (
    <Screen>
      <View style={styles.head}>
        <T v="title" accessibilityRole="header">
          Account
        </T>
      </View>

      <View style={styles.balance}>
        <View style={styles.balanceRow}>
          <T v="display">{String(credits)}</T>
          <T v="callout" c="smoke">
            {credits === 1 ? 'video credit left' : 'video credits left'}
          </T>
        </View>
        <T v="caption" c="smoke">
          One credit covers a full song up to 3:30 at Standard quality. Exporting in 4K uses one more.
        </T>
        <Button label="Get credits" variant="secondary" onPress={() => router.push('/paywall')} />
      </View>

      <View>
        <Row icon={FileText} label="Plan" detail={plan} onPress={() => router.push('/paywall')} />
        <Row icon={Bell} label="Notifications" detail="When a stage is done" onPress={() => showToast('Notification settings come in the app build.')} />
        <Row icon={LifeBuoy} label="Help" detail="Tutorials and support" onPress={() => router.push('/tutorials')} />
      </View>

      <T v="caption" c="ash">
        Prototype build. Videos, payments and AI jobs are simulated with sample data.
      </T>
    </Screen>
  );
}

function Row({ icon: Icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} scaleTo={0.99} style={styles.row} accessibilityLabel={`${label}, ${detail}`}>
      <Icon size={20} color={color.smoke} strokeWidth={2} />
      <View style={styles.rowText}>
        <T v="callout">{label}</T>
        <T v="caption" c="smoke">
          {detail}
        </T>
      </View>
      <ChevronRight size={20} color={color.ash} />
    </Press>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: space.l,
  },
  balance: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
    gap: space.m,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.s,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
