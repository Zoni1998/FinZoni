import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../contexts/FinanceContext';
import { colors, radii, spacing } from '../theme';
import type { QuickActionType } from '../types';
import { makeId, monthKey } from '../utils/finance';
import { Field, IconButton, PrimaryButton } from './UI';

const actions: Array<{ key: QuickActionType; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = [
  { key: 'expense', label: 'Despesa', icon: 'arrow-up-circle-outline' },
  { key: 'income', label: 'Receita', icon: 'arrow-down-circle-outline' },
  { key: 'work', label: 'DiÃ¡ria', icon: 'briefcase-clock-outline' },
  { key: 'card', label: 'CartÃ£o', icon: 'credit-card-outline' },
];

export function QuickActionSheet({ visible, initialType = 'expense', onClose }: { visible: boolean; initialType?: QuickActionType; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { data, month, mutate } = useFinance();
  const [type, setType] = useState<QuickActionType>(initialType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState('1');
  const [clinicId, setClinicId] = useState('');
  const [cardId, setCardId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setClinicId(data.clinicas[0]?.id ?? '');
      setCardId(String(data.cartoes[0]?.id ?? ''));
      setError(null);
    }
  }, [visible, initialType, data.clinicas, data.cartoes]);

  const selectedClinic = useMemo(() => data.clinicas.find((item) => item.id === clinicId), [data.clinicas, clinicId]);

  const save = async () => {
    const numericAmount = Number(amount.replace(',', '.'));
    const numericInstallments = Math.max(1, Number.parseInt(installments, 10) || 1);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Preencha descriÃ§Ã£o, valor e data corretamente.');
      return;
    }
    if (type === 'work' && !selectedClinic) {
      setError('Selecione uma clÃ­nica.');
      return;
    }
    if (type === 'card' && !cardId) {
      setError('Cadastre ou selecione um cartÃ£o.');
      return;
    }
    setBusy(true);
    setError(null);
    const saved = await mutate((draft) => {
      const current = draft.meses[String(month)];
      if (!current) return;
      if (type === 'expense') {
        current.gastosVariaveis.push({ id: makeId(), descricao: description.trim(), valor: numericAmount, data: date, categoriaId: draft.categoriasVariaveis[0]?.id });
      }
      if (type === 'income') {
        current.outrasReceitas.push({ id: makeId(), descricao: description.trim(), valor: numericAmount, data: date });
      }
      if (type === 'work' && selectedClinic) {
        const day = String(Number(date.slice(-2)));
        current.diarias.diasTrabalhados[day] ??= [];
        current.diarias.diasTrabalhados[day].push({ clinicaId: selectedClinic.id, valor: numericAmount, comissao: 0 });
      }
      if (type === 'card') {
        draft.comprasCartao.push({
          id: makeId(), cartaoId: cardId, descricao: description.trim(), data: date, valorTotal: numericAmount,
          parcelas: numericInstallments, valorParcela: numericAmount / numericInstallments, mesInicio: monthKey(Number(date.slice(0, 4)), Number(date.slice(5, 7))),
        });
      }
    });
    setBusy(false);
    if (!saved) {
      setError('NÃ£o foi possÃ­vel salvar. Verifique a conexÃ£o e tente novamente.');
      return;
    }
    setDescription('');
    setAmount('');
    setInstallments('1');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Fechar lanÃ§amento" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.head}><View><Text style={styles.title}>Novo lanÃ§amento</Text><Text style={styles.subtitle}>Salva no mesmo instante no FinZoni</Text></View><IconButton icon="close" label="Fechar" onPress={onClose} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
              {actions.map((action) => <Pressable key={action.key} accessibilityRole="button" accessibilityState={{ selected: type === action.key }} onPress={() => setType(action.key)} style={[styles.action, type === action.key && styles.actionActive]}><MaterialCommunityIcons name={action.icon} size={20} color={type === action.key ? colors.blue : colors.textSecondary} /><Text style={[styles.actionText, type === action.key && styles.actionTextActive]}>{action.label}</Text></Pressable>)}
            </ScrollView>
            {type === 'work' ? <ChoiceRow label="ClÃ­nica" values={data.clinicas.map((item) => ({ id: item.id, label: item.nome }))} selected={clinicId} onSelect={setClinicId} /> : null}
            {type === 'card' ? <ChoiceRow label="CartÃ£o" values={data.cartoes.map((item) => ({ id: String(item.id), label: item.nome }))} selected={cardId} onSelect={setCardId} /> : null}
            <Field label={type === 'work' ? 'ObservaÃ§Ã£o' : 'DescriÃ§Ã£o'} value={description} onChangeText={setDescription} placeholder={type === 'work' ? 'Ex.: PlantÃ£o de sexta' : 'Ex.: Mercado'} />
            <View style={styles.row}><View style={styles.flex}><Field label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" /></View><View style={styles.flex}><Field label="Data" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" /></View></View>
            {type === 'card' ? <Field label="Parcelas" value={installments} onChangeText={setInstallments} keyboardType="number-pad" /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Salvar lanÃ§amento" variant="green" onPress={save} loading={busy} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChoiceRow({ label, values, selected, onSelect }: { label: string; values: Array<{ id: string; label: string }>; selected: string; onSelect: (id: string) => void }) {
  return <View style={styles.choiceGroup}><Text style={styles.choiceLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{values.length ? values.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: selected === item.id }} onPress={() => onSelect(item.id)} style={[styles.choice, selected === item.id && styles.choiceActive]}><Text style={[styles.choiceText, selected === item.id && styles.choiceTextActive]}>{item.label}</Text></Pressable>) : <Text style={styles.error}>Nenhuma opÃ§Ã£o cadastrada.</Text>}</ScrollView></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.66)' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong }, handle: { width: 42, height: 5, borderRadius: radii.pill, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }, title: { color: colors.text, fontSize: 21, fontWeight: '900' }, subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, form: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }, actions: { gap: spacing.sm }, action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing.md, backgroundColor: colors.backgroundRaised }, actionActive: { borderColor: colors.blue, backgroundColor: '#0B2A47' }, actionText: { color: colors.textSecondary, fontWeight: '700' }, actionTextActive: { color: colors.blue },
  row: { flexDirection: 'row', gap: spacing.md }, flex: { flex: 1 }, error: { color: colors.red, fontSize: 13 }, choiceGroup: { gap: spacing.sm }, choiceLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' }, choices: { gap: spacing.sm }, choice: { minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing.md }, choiceActive: { borderColor: colors.blue, backgroundColor: '#0B2A47' }, choiceText: { color: colors.textSecondary, fontWeight: '700' }, choiceTextActive: { color: colors.blue },
});
