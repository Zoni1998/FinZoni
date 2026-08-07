import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Panel, ScreenHeader } from '../components/UI';
import { useFinance } from '../contexts/FinanceContext';
import { colors, radii, spacing } from '../theme';
import type { CreditCard } from '../types';
import { cardInvoice, cardOpenAmount, formatCurrency, monthKey } from '../utils/finance';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const screenWidth = Dimensions.get('window').width;
const cardWidth = Math.min(354, screenWidth - 92);

export function WalletScreen({ onNewPurchase }: { onNewPurchase: () => void }) {
  const { data, month } = useFinance();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<FlatList<CreditCard>>(null);
  const selected = data.cartoes[Math.min(selectedIndex, Math.max(0, data.cartoes.length - 1))];
  const targetKey = monthKey(data.year, month);
  const invoice = selected ? cardInvoice(data, selected.id, targetKey) : 0;
  const open = selected ? cardOpenAmount(data, selected.id, targetKey) : 0;
  const limit = Number(selected?.limite || 0);
  const available = Math.max(0, limit - open);
  const usage = limit > 0 ? Math.min(100, (open / limit) * 100) : 0;
  const purchases = useMemo(
    () => data.comprasCartao.filter((item) => selected && String(item.cartaoId) === String(selected.id)).slice().reverse().slice(0, 8),
    [data.comprasCartao, selected],
  );

  const goTo = (index: number) => {
    if (!data.cartoes.length) return;
    const next = (index + data.cartoes.length) % data.cartoes.length;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setSelectedIndex(next);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + spacing.md));
    setSelectedIndex(Math.max(0, Math.min(data.cartoes.length - 1, index)));
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} nestedScrollEnabled>
      <ScreenHeader title="Carteira" subtitle="CartÃµes, limites e faturas" />
      {data.cartoes.length ? (
        <>
          <View style={styles.carouselRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="CartÃ£o anterior" onPress={() => goTo(selectedIndex - 1)} style={styles.arrow}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
            </Pressable>
            <FlatList
              ref={listRef}
              style={styles.cardList}
              data={data.cartoes}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + spacing.md}
              decelerationRate="fast"
              onMomentumScrollEnd={onScrollEnd}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.cardRail}
              renderItem={({ item, index }) => <CreditCardView card={item} selected={index === selectedIndex} holder={data.perfil.nome} invoice={cardInvoice(data, item.id, targetKey)} onPress={() => goTo(index)} />}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="PrÃ³ximo cartÃ£o" onPress={() => goTo(selectedIndex + 1)} style={styles.arrow}>
              <MaterialCommunityIcons name="chevron-right" size={26} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.dots}>{data.cartoes.map((card, index) => <View key={String(card.id)} style={[styles.dot, index === selectedIndex && styles.dotActive]} />)}</View>

          <Panel style={styles.summary}>
            <View style={styles.summaryTop}>
              <View><Text style={styles.summaryLabel}>Em aberto</Text><Text style={styles.invoice}>{formatCurrency(invoice)}</Text></View>
              <View style={styles.due}><Text style={styles.summaryLabel}>{selected?.vencimento ? `Vence dia ${selected.vencimento}` : 'Vencimento nÃ£o informado'}</Text></View>
            </View>
            <View style={styles.divider} />
            <View style={styles.limitRow}>
              <View><Text style={styles.summaryLabel}>Limite disponÃ­vel</Text><Text style={styles.limit}>{limit > 0 ? formatCurrency(available) : 'â€”'}</Text></View>
              <View style={styles.limitRight}><Text style={styles.usage}>{limit > 0 ? `${usage.toFixed(0)}%` : 'â€”'}</Text><Text style={styles.summaryLabel}>{limit > 0 ? `de ${formatCurrency(limit)}` : 'Limite nÃ£o informado'}</Text></View>
            </View>
            <View style={styles.progress}><View style={[styles.progressFill, { width: `${usage}%`, backgroundColor: selected?.cor || colors.blue }]} /></View>
            <View style={styles.divider} />
            <View style={styles.bestDay}><Text style={styles.summaryLabel}>Melhor dia de compra</Text><Text style={styles.bestDayValue}>{selected?.fechamento ? `Dia ${selected.fechamento === 31 ? 1 : selected.fechamento + 1}` : 'â€”'}</Text></View>
          </Panel>

          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>LanÃ§amentos</Text><Pressable accessibilityRole="button" accessibilityLabel="Nova despesa no cartÃ£o" onPress={onNewPurchase} style={styles.newPurchase}><MaterialCommunityIcons name="plus" size={18} color={colors.blue} /><Text style={styles.newPurchaseText}>Nova despesa</Text></Pressable></View>
          {purchases.length ? purchases.map((purchase) => (
            <Panel key={String(purchase.id)} style={styles.purchase}>
              <View style={styles.purchaseIcon}><MaterialCommunityIcons name="receipt-text-outline" size={22} color={selected?.cor || colors.blue} /></View>
              <View style={styles.purchaseText}><Text style={styles.purchaseName}>{purchase.descricao}</Text><Text style={styles.purchaseMeta}>{purchase.data} Â· {purchase.parcelas > 1 ? `${purchase.parcelas} parcelas` : 'Ã  vista'}</Text></View>
              <Text style={styles.purchaseValue}>{formatCurrency(purchase.valorParcela || purchase.valorTotal)}</Text>
            </Panel>
          )) : <Panel style={styles.emptyPurchases}><Text style={styles.emptyText}>Nenhuma compra lanÃ§ada neste cartÃ£o.</Text></Panel>}
        </>
      ) : (
        <Panel style={styles.emptyCard}><EmptyState icon="credit-card-plus-outline" title="Sua carteira estÃ¡ vazia" detail="Adicione um cartÃ£o pelo FinZoni Web. O cadastro direto pelo app serÃ¡ incluÃ­do na prÃ³xima etapa." /></Panel>
      )}
    </ScrollView>
  );
}

function CreditCardView({ card, selected, holder, invoice, onPress }: { card: CreditCard; selected: boolean; holder: string; invoice: number; onPress: () => void }) {
  const name = card.nome || 'CartÃ£o';
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const background = normalized.includes('itau') ? '#C64E00' : normalized.includes('amazon') ? '#111923' : card.cor || '#1D4EA3';
  const ending = String(card.id).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Selecionar ${name}`} accessibilityState={{ selected }} onPress={onPress} style={[styles.creditCard, { backgroundColor: background, width: cardWidth }, selected && styles.creditCardSelected]}>
      <View style={styles.cardTop}><View style={styles.brandMark}><Text style={styles.brandMarkText}>{normalized.includes('itau') ? 'itaÃº' : normalized.includes('amazon') ? 'a' : name.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.cardName}>{name}</Text><MaterialCommunityIcons name="contactless-payment" size={31} color={colors.text} /></View>
      <View style={styles.chip}><View style={styles.chipLine} /><View style={styles.chipLine} /></View>
      <Text style={styles.cardNumber}>â€¢â€¢â€¢â€¢  â€¢â€¢â€¢â€¢  â€¢â€¢â€¢â€¢  {ending}</Text>
      <View style={styles.cardBottom}><View><Text style={styles.holderLabel}>Titular</Text><Text style={styles.holder}>{(holder || 'Titular').toUpperCase()}</Text></View><Text style={styles.visa}>VISA</Text></View>
      <View style={styles.cardMeta}><Text style={styles.cardMetaText}>{card.fechamento ? `Fecha dia ${card.fechamento}` : 'Fechamento nÃ£o informado'}</Text><Text style={styles.cardMetaText}>{card.vencimento ? `Vence dia ${card.vencimento}` : 'Vencimento nÃ£o informado'}</Text></View>
      <Text style={styles.cardInvoice}>Fatura {formatCurrency(invoice)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: spacing.xxl, gap: spacing.md },
  carouselRow: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  cardList: { flex: 1, minWidth: 0 },
  arrow: { width: 34, height: 54, alignItems: 'center', justifyContent: 'center' },
  cardRail: { gap: spacing.md, paddingRight: spacing.md },
  creditCard: { minHeight: 236, borderRadius: 25, padding: spacing.lg, borderWidth: 2, borderColor: 'rgba(255,255,255,0.13)', overflow: 'hidden' },
  creditCardSelected: { borderColor: colors.blue },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 42, height: 42, borderRadius: radii.sm, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardName: { color: colors.text, fontSize: 18, fontWeight: '900', flex: 1 },
  chip: { width: 51, height: 38, borderRadius: 8, backgroundColor: '#F6CD56', marginTop: spacing.lg, justifyContent: 'center', gap: 5 },
  chipLine: { height: 1, backgroundColor: '#B68F24' },
  cardNumber: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: 1.2, marginTop: spacing.lg },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.lg },
  holderLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10 }, holder: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 1 }, visa: { color: colors.text, fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginTop: spacing.lg, paddingTop: spacing.sm },
  cardMetaText: { color: 'rgba(255,255,255,0.78)', fontSize: 10 }, cardInvoice: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong }, dotActive: { width: 18, backgroundColor: colors.blue },
  summary: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: '#071B31' }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { color: colors.textSecondary, fontSize: 12 }, invoice: { color: colors.amber, fontSize: 29, fontWeight: '900', marginTop: spacing.xs }, due: { alignItems: 'flex-end' }, divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, limit: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 3 }, limitRight: { alignItems: 'flex-end' }, usage: { color: colors.text, fontSize: 17, fontWeight: '900' },
  progress: { height: 8, borderRadius: radii.pill, backgroundColor: colors.background, overflow: 'hidden', marginTop: spacing.md }, progressFill: { height: '100%', borderRadius: radii.pill }, bestDay: { flexDirection: 'row', justifyContent: 'space-between' }, bestDayValue: { color: colors.text, fontWeight: '900' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.sm }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' }, newPurchase: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.md }, newPurchaseText: { color: colors.blue, fontWeight: '800' },
  purchase: { marginHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', padding: spacing.md }, purchaseIcon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.backgroundRaised, alignItems: 'center', justifyContent: 'center' }, purchaseText: { flex: 1, marginHorizontal: spacing.md }, purchaseName: { color: colors.text, fontWeight: '800' }, purchaseMeta: { color: colors.muted, fontSize: 11, marginTop: 3 }, purchaseValue: { color: colors.text, fontWeight: '900' },
  emptyPurchases: { marginHorizontal: spacing.lg }, emptyText: { color: colors.textSecondary, textAlign: 'center' }, emptyCard: { margin: spacing.lg },
});
