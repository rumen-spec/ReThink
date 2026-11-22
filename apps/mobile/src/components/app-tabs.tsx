import { NativeTabs } from 'expo-router/native-tabs';

import { T } from '@/constants/theme';

/** SPEC §1.3: exactly three tabs. The Edit page (plan + budgets) is a modal on the root stack, never a tab. */
export default function AppTabs() {
  return (
    <NativeTabs backgroundColor={T.canvas} indicatorColor={T.hairline} labelStyle={{ selected: { color: T.ink }, default: { color: T.muted } }} iconColor={{ selected: T.accent, default: T.muted }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hotspots">
        <NativeTabs.Trigger.Label>Hotspots</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'mappin.and.ellipse', selected: 'mappin.and.ellipse' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
