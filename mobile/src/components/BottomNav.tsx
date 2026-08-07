import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import type { TabKey } from '../types';

const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = [
  { key: 'home', label: 'InÃ­cio', icon: 'home-variant-outline' },
  { key: 'wallet', label: 'Carteira', icon: 'credit-card-outline' },
  { key: 'goals', label: 'Metas', icon: 'target' },
  { key: 'settings', label: 'Ajustes', icon: 'cog-outline' },
];

export function BottomNav({ active, onChange, onQuickAction }: { active: TabKey; onChange: (tab: TabKey) => void; onQuickAction: () => void }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.nav}>
        {tabs.map((tab, index) => (
          <React.Fragment key={tab.key}>
            {index === 2 ? <View style={styles.quickSpacer} /> : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active === tab.key }}
              onPress={() => onChange(tab.key)}
              style={styles.tab}
            >
              <MaterialCommunityIcons name={tab.icon} size={23} color={active === tab.key ? colors.blue : colors.muted} />
              <Text style={[styles.label, active === tab.key && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo lanÃ§amento"
        onPress={onQuickAction}
        style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="plus" size={35} color={colors.black} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', backgroundColor: colors.background },
  nav: { minHeight: 72, paddingBottom: spacing.sm, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundRaised, flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  labelActive: { color: colors.blue },
  quickSpacer: { width: 70 },
  quick: { position: 'absolute', width: 64, height: 64, borderRadius: radii.pill, backgroundColor: colors.blue, left: '50%', marginLeft: -32, top: -19, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: colors.background, shadowColor: colors.blue, shadowOpacity: 0.45, shadowRadius: 14, elevation: 12 },
  pressed: { transform: [{ scale: 0.96 }] },
});

