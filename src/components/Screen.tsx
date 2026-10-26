import { router } from 'expo-router';
import { ChevronLeft, X } from '@/components/icons';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gutter, maxWidth, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

export function goBack(fallback = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

interface HeaderProps {
  title?: string;
  /** Small line above the title. */
  kicker?: string;
  close?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  fallback?: string;
}

/** One header owner per screen: back or close, the title, and an optional action. */
export function Header({ title, kicker, close, onBack, right, fallback }: HeaderProps) {
  const Icon = close ? X : ChevronLeft;
  return (
    <View style={styles.header}>
      <Press
        onPress={onBack ?? (() => goBack(fallback))}
        accessibilityLabel={close ? 'Close' : 'Back'}
        hitSlop={8}
        style={styles.iconBtn}>
        <Icon size={24} color={color.chalk} strokeWidth={2.2} />
      </Press>
      <View style={styles.titleWrap}>
        {kicker ? (
          <T v="micro" c="ash" numberOfLines={1}>
            {kicker}
          </T>
        ) : null}
        {title ? (
          <T v="label" numberOfLines={1}>
            {title}
          </T>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

interface ScreenProps {
  children: ReactNode;
  header?: ReactNode;
  /** Pinned to the bottom: the screen's one action. */
  footer?: ReactNode;
  scroll?: boolean;
}

/** Safe-area aware page with a readable max width and an optional pinned action bar. */
export function Screen({ children, header, footer, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: footer ? space.xl : insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content]}>{children}</View>
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.column}>
        {header}
        {body}
        {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.m }]}>{footer}</View> : null}
      </View>
    </View>
  );
}

/** Section heading inside a screen. */
export function SectionTitle({ children, detail }: { children: string; detail?: string }) {
  return (
    <View style={styles.section}>
      <T v="heading">{children}</T>
      {detail ? (
        <T v="caption" c="smoke">
          {detail}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.stage,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
    gap: space.xl,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.s,
    gap: space.xs,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  right: {
    minWidth: 44,
    alignItems: 'flex-end',
    paddingRight: space.s,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.m,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.stage,
    gap: space.xs,
  },
  section: {
    gap: 2,
  },
});
