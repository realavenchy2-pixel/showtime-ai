import { Check } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { goBack, Header, Screen, SectionTitle } from '@/components/Screen';
import { T } from '@/components/T';
import { showToast } from '@/components/Toast';
import { useApp, type PlanId } from '@/engine/store';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

// Sample prices for the prototype. Real prices get set against the AI cost per video.

const PLANS: { id: Exclude<PlanId, 'Free trial'>; price: string; credits: number; perks: string[] }[] = [
  {
    id: 'Standard',
    price: '$149 a month',
    credits: 2,
    perks: ['2 videos a month', 'Generated at 720p, upscaled to 1080p', 'All VFX packs'],
  },
  {
    id: 'Premium',
    price: '$299 a month',
    credits: 2,
    perks: ['2 videos a month at native 1080p', '4K export included', 'Priority rendering'],
  },
];

const PACKS = [
  { credits: 1, price: '$79', note: 'One video' },
  { credits: 3, price: '$199', note: 'Three videos, save $38' },
];

export default function PaywallScreen() {
  const plan = useApp((s) => s.plan);
  const addCredits = useApp((s) => s.addCredits);
  const setPlan = useApp((s) => s.setPlan);

  const buyPack = (n: number) => {
    addCredits(n);
    haptic.success();
    showToast(`${n} ${n === 1 ? 'credit' : 'credits'} added`);
    goBack();
  };

  return (
    <Screen header={<Header title="Credits and plans" close />}>
      <T v="caption" c="ash">
        Sample prices. Purchases are simulated in this prototype, nothing is charged.
      </T>

      <View style={styles.block}>
        <SectionTitle detail="Credits refill every month. Cancel any time, at least a day before renewal.">Plans</SectionTitle>
        {PLANS.map((p) => {
          const active = plan === p.id;
          return (
            <Press
              key={p.id}
              onPress={() => {
                setPlan(p.id);
                addCredits(p.credits);
                haptic.success();
                showToast(`${p.id} plan started, ${p.credits} credits added`);
                goBack();
              }}
              disabled={active}
              scaleTo={0.99}
              style={[styles.card, active && styles.cardActive]}
              accessibilityLabel={`${p.id} plan, ${p.price}${active ? ', current plan' : ''}`}>
              <View style={styles.cardHead}>
                <T v="label">{p.id}</T>
                <T v="callout" c="smoke">
                  {active ? 'Your plan' : p.price}
                </T>
              </View>
              {p.perks.map((perk) => (
                <View key={perk} style={styles.perk}>
                  <Check size={16} color={color.chalk} />
                  <T v="caption" c="smoke">
                    {perk}
                  </T>
                </View>
              ))}
            </Press>
          );
        })}
      </View>

      <View style={styles.block}>
        <SectionTitle detail="Credits never expire.">One-off credits</SectionTitle>
        {PACKS.map((pack) => (
          <View key={pack.credits} style={styles.pack}>
            <View style={styles.packText}>
              <T v="callout">{`${pack.credits} ${pack.credits === 1 ? 'credit' : 'credits'}`}</T>
              <T v="caption" c="smoke">
                {pack.note}
              </T>
            </View>
            <Button label={`Buy for ${pack.price}`} variant="secondary" onPress={() => buyPack(pack.credits)} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.m,
  },
  card: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
    gap: space.s,
  },
  cardActive: {
    borderColor: color.chalk,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  packText: {
    flex: 1,
    gap: 2,
  },
});
