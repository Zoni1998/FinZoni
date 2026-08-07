import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Panel, ScreenHeader } from '../components/UI';
import { useFinance } from '../contexts/FinanceContext';
import { colors, radii, spacing } from '../theme';
import { formatCurrency, reserveBalance } from '../utils/finance';

export function GoalsScreen() {
  const { data } = useFinance();
  const reserve = reserveBalance(data);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenHeader title="Metas" subtitle="PatrimÃ´nio e objetivos" />
      <Panel style={styles.reserve}>
        <View style={styles.reserveIcon}><MaterialCommunityIcons name="shield-check-outline" size={27} color={colors.green} /></View>
        <View style={styles.reserveText}><Text style={styles.label}>Reserva de emergÃªncia</Text><Text style={styles.reserveValue}>{formatCurrency(reserve)}</Text><Text style={styles.hint}>DisponÃ­vel para imprevistos</Text></View>
      </Panel>

      <Text style={styles.sectionTitle}>Seus objetivos</Text>
      {data.metas.length ? data.metas.map((goal) => {
        const current = Number(goal.valorAtual ?? goal.atual ?? 0);
        const target = Number(goal.valorAlvo ?? goal.meta ?? 0);
        const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        return (
          <Panel key={String(goal.id)} style={styles.goal}>
            <View style={styles.goalHead}><View style={[styles.goalIcon, { backgroundColor: `${goal.cor || colors.purple}22` }]}><MaterialCommunityIcons name="target" size={23} color={goal.cor || colors.purple} /></View><View style={styles.goalTitle}><Text style={styles.goalName}>{goal.nome}</Text><Text style={styles.goalPercent}>{percent.toFixed(1)}% concluÃ­do</Text></View></View>
            <View style={styles.values}><Text style={styles.current}>{formatCurrency(current)}</Text><Text style={styles.target}>de {formatCurrency(target)}</Text></View>
            <View style={styles.progress}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: goal.cor || colors.purple }]} /></View>
            <Text style={styles.remaining}>{target > current ? `Faltam ${formatCurrency(target - current)}` : 'Meta alcanÃ§ada'}</Text>
          </Panel>
        );
      }) : <Panel style={styles.empty}><EmptyState icon="target" title="Nenhuma meta cadastrada" detail="Suas metas criadas no FinZoni Web aparecerÃ£o aqui automaticamente." /></Panel>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: spacing.xxl, gap: spacing.md },
  reserve: { marginHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', backgroundColor: '#09261E', borderColor: '#185B43' },
  reserveIcon: { width: 54, height: 54, borderRadius: radii.md, backgroundColor: '#0B3628', alignItems: 'center', justifyContent: 'center' }, reserveText: { flex: 1, marginLeft: spacing.lg },
  label: { color: colors.textSecondary, fontSize: 12 }, reserveValue: { color: colors.green, fontSize: 25, fontWeight: '900', marginTop: 2 }, hint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginHorizontal: spacing.lg, marginTop: spacing.lg },
  goal: { marginHorizontal: spacing.lg }, goalHead: { flexDirection: 'row', alignItems: 'center' }, goalIcon: { width: 46, height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' }, goalTitle: { flex: 1, marginLeft: spacing.md }, goalName: { color: colors.text, fontSize: 17, fontWeight: '900' }, goalPercent: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  values: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.lg }, current: { color: colors.green, fontSize: 20, fontWeight: '900' }, target: { color: colors.textSecondary, fontSize: 12 },
  progress: { height: 8, borderRadius: radii.pill, backgroundColor: colors.background, overflow: 'hidden', marginTop: spacing.md }, progressFill: { height: '100%', borderRadius: radii.pill }, remaining: { color: colors.textSecondary, fontSize: 12, textAlign: 'right', marginTop: spacing.sm }, empty: { marginHorizontal: spacing.lg },
});

