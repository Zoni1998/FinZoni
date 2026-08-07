import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorBanner, Panel, ScreenHeader } from '../components/UI';
import { useFinance } from '../contexts/FinanceContext';
import { colors, radii, spacing } from '../theme';
import { expenseSummary, formatCurrency, getMonth, totalIncome, totalWork } from '../utils/finance';

const months = ['Janeiro', 'Fevereiro', 'MarÃ§o', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function HomeScreen({ onOpenZoni }: { onOpenZoni: () => void }) {
  const { data, month, setMonth, loading, error, reload } = useFinance();
  const summary = useMemo(() => expenseSummary(data, month), [data, month]);
  const income = useMemo(() => totalIncome(data, month), [data, month]);
  const production = useMemo(() => totalWork(data, month), [data, month]);
  const balance = income - summary.total;
  const current = getMonth(data, month);
  const pending = current?.gastosFixos.filter((item) => !item.pago).sort((a, b) => Number(a.vencimento || 99) - Number(b.vencimento || 99)).slice(0, 4) ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.blue} colors={[colors.blue]} />}
    >
      <ScreenHeader
        title={`${months[month - 1]} ${data.year}`}
        subtitle={`OlÃ¡, ${data.perfil.nome?.split(' ')[0] || 'Victor'}`}
        onPrevious={() => setMonth(month - 1)}
        onNext={() => setMonth(month + 1)}
      />
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Panel style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <View>
            <Text style={styles.eyebrow}>SALDO PREVISTO</Text>
            <Text style={[styles.balance, balance < 0 && { color: colors.red }]}>{formatCurrency(balance)}</Text>
          </View>
          <View style={styles.balanceIcon}>
            <MaterialCommunityIcons name="wallet-outline" size={25} color={colors.blue} />
          </View>
        </View>
        <View style={styles.metricRow}>
          <Metric label="Receitas" value={formatCurrency(income)} color={colors.green} />
          <View style={styles.separator} />
          <Metric label="Pagas" value={formatCurrency(summary.paid)} color={colors.text} />
          <View style={styles.separator} />
          <Metric label="Falta pagar" value={formatCurrency(summary.pending)} color={colors.red} />
        </View>
      </Panel>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>VisÃ£o rÃ¡pida</Text>
      </View>
      <View style={styles.twoColumns}>
        <Panel style={styles.smallCard}>
          <MaterialCommunityIcons name="briefcase-clock-outline" size={23} color={colors.purple} />
          <Text style={styles.smallLabel}>ProduÃ§Ã£o do mÃªs</Text>
          <Text style={styles.smallValue}>{formatCurrency(production)}</Text>
          <Text style={styles.smallHint}>Entra no prÃ³ximo mÃªs</Text>
        </Panel>
        <Panel style={styles.smallCard}>
          <MaterialCommunityIcons name="credit-card-outline" size={23} color={colors.amber} />
          <Text style={styles.smallLabel}>CartÃµes</Text>
          <Text style={styles.smallValue}>{data.cartoes.length}</Text>
          <Text style={styles.smallHint}>na sua carteira</Text>
        </Panel>
      </View>

      <Panel style={styles.insightPanel}>
        <View style={styles.insightHead}>
          <View style={styles.insightIcon}><MaterialCommunityIcons name="creation" size={22} color={colors.purple} /></View>
          <View style={styles.insightText}>
            <Text style={styles.insightTitle}>Zoni Financeiro</Text>
            <Text style={styles.insightCopy}>{balance >= 0 ? 'Seu mÃªs estÃ¡ positivo. Posso ajudar a decidir o melhor uso para esse saldo.' : 'Seus compromissos superam as receitas previstas. Vamos organizar as prioridades?'}</Text>
          </View>
        </View>
        <Text accessibilityRole="button" onPress={onOpenZoni} style={styles.zoniLink}>Conversar com o Zoni</Text>
      </Panel>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>PrÃ³ximas contas</Text>
        <Text style={styles.sectionMeta}>{pending.length} pendentes</Text>
      </View>
      <Panel style={styles.billPanel}>
        {pending.length ? pending.map((item, index) => (
          <View key={String(item.id ?? `${item.descricao}-${index}`)} style={[styles.billRow, index > 0 && styles.billBorder]}>
            <View style={styles.billDate}><Text style={styles.billDay}>{item.vencimento || 'â€”'}</Text><Text style={styles.billMonth}>DIA</Text></View>
            <View style={styles.billText}><Text style={styles.billName}>{item.descricao}</Text><Text style={styles.billDetail}>{item.compartilhado ? 'Sua parte (50%)' : 'Valor integral'}</Text></View>
            <Text style={styles.billValue}>{formatCurrency(Number(item.valor || 0) / (item.compartilhado ? 2 : 1))}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Nenhuma conta pendente neste mÃªs.</Text>}
      </Panel>
    </ScrollView>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl, gap: spacing.lg },
  balanceCard: { marginHorizontal: spacing.lg, padding: spacing.xl, backgroundColor: '#09203B', borderColor: '#164F7E' },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  balance: { color: colors.green, fontSize: 32, fontWeight: '900', marginTop: spacing.xs },
  balanceIcon: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: '#0B3158', alignItems: 'center', justifyContent: 'center' },
  metricRow: { flexDirection: 'row', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  metric: { flex: 1 },
  metricLabel: { color: colors.muted, fontSize: 11 },
  metricValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  separator: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: colors.textSecondary, fontSize: 12 },
  twoColumns: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  smallCard: { flex: 1, gap: spacing.sm },
  smallLabel: { color: colors.textSecondary, fontSize: 12 },
  smallValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  smallHint: { color: colors.muted, fontSize: 11 },
  insightHead: { flexDirection: 'row', gap: spacing.md },
  insightPanel: { marginHorizontal: spacing.lg },
  insightIcon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: '#261443', alignItems: 'center', justifyContent: 'center' },
  insightText: { flex: 1 },
  insightTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  insightCopy: { color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  zoniLink: { color: colors.blue, fontWeight: '800', marginTop: spacing.lg, minHeight: 40, textAlignVertical: 'center' },
  billPanel: { marginHorizontal: spacing.lg, paddingVertical: spacing.xs },
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  billBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  billDate: { width: 46, height: 46, borderRadius: radii.md, backgroundColor: colors.backgroundRaised, alignItems: 'center', justifyContent: 'center' },
  billDay: { color: colors.amber, fontSize: 16, fontWeight: '900' },
  billMonth: { color: colors.muted, fontSize: 8, fontWeight: '800' },
  billText: { flex: 1, paddingHorizontal: spacing.md },
  billName: { color: colors.text, fontWeight: '800' },
  billDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  billValue: { color: colors.text, fontWeight: '900' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl },
});
