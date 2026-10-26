import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { CircleUserRound, Clapperboard, MonitorPlay, type LucideIcon } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, maxWidth, space } from '@/theme/tokens';

import { T } from './T';

/** The web version of the tab bar, styled to match the native one. */
export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <TabBar bottomInset={insets.bottom}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={Clapperboard} label="Videos" />
          </TabTrigger>
          <TabTrigger name="tutorials" href="/tutorials" asChild>
            <TabButton icon={MonitorPlay} label="Tutorials" />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton icon={CircleUserRound} label="Account" />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

/** Receives TabList's props but sets its own style; TabList's merged style object isn't valid on the web. */
function TabBar({ children, bottomInset }: TabListProps & { bottomInset?: number }) {
  return (
    <View style={[styles.bar, { paddingBottom: (bottomInset ?? 0) + space.xs }]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

function TabButton({ icon: Icon, label, isFocused, onPress }: TabTriggerSlotProps & { icon: LucideIcon; label: string }) {
  const tint = isFocused ? color.chalk : color.ash;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
      style={styles.tab}>
      <Icon size={22} color={tint} strokeWidth={isFocused ? 2.4 : 2} />
      <T v="micro" style={{ color: tint }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.stage,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
