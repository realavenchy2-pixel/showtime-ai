import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/theme/tokens';

/** Native tab bar on iOS and Android: Videos, Tutorials, Account. */
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={color.stage}
      iconColor={{ default: color.ash, selected: color.chalk }}
      labelStyle={{ default: { color: color.ash }, selected: { color: color.chalk } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'film', selected: 'film.fill' }} md="movie" />
        <NativeTabs.Trigger.Label>Videos</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tutorials">
        <NativeTabs.Trigger.Icon sf={{ default: 'play.rectangle', selected: 'play.rectangle.fill' }} md="smart_display" />
        <NativeTabs.Trigger.Label>Tutorials</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
