import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Panel, PrimaryButton, ScreenHeader } from '../components/UI';
import { useAuth } from '../contexts/AuthContext';
import { useFinance } from '../contexts/FinanceContext';
import { colors, radii, spacing } from '../theme';

export function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data, saving, reload } = useFinance();
  const [busy, setBusy] = useState(false);

  const logout = () => {
    Alert.alert('Sair da conta?', 'Os dados jÃ¡ salvos continuarÃ£o seguros na nuvem.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { setBusy(true); try { await signOut(); } finally { setBusy(false); } } },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenHeader title="Ajustes" subtitle="Conta e sincronizaÃ§Ã£o" />
      <Panel style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(data.perfil.nome || session?.user.email || 'F').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.profileText}><Text style={styles.name}>{data.perfil.nome || 'Minha conta'}</Text><Text style={styles.email}>{session?.user.email}</Text></View>
      </Panel>

      <Text style={styles.section}>Dados</Text>
      <Panel style={styles.list}>
        <SettingsRow icon="cloud-check-outline" title="SincronizaÃ§Ã£o" detail={saving ? 'Salvando alteraÃ§Ãµes...' : 'Dados sincronizados com o FinZoni Web'} color={saving ? colors.amber : colors.green} onPress={reload} />
        <View style={styles.divider} />
        <SettingsRow icon="robot-outline" title="NVIDIA NIM" detail={data.nvidiaApiKey ? 'Chave configurada e pronta para o Zoni' : 'Configure a chave no FinZoni Web'} color={data.nvidiaApiKey ? colors.green : colors.amber} />
        <View style={styles.divider} />
        <SettingsRow icon="shield-lock-outline" title="Privacidade" detail="Sua sessÃ£o fica armazenada no dispositivo" color={colors.blue} />
      </Panel>

      <Text style={styles.section}>Aplicativo</Text>
      <Panel style={styles.list}>
        <SettingsRow icon="information-outline" title="FinZoni para Android" detail="VersÃ£o 0.1.0" color={colors.purple} />
      </Panel>
      <View style={styles.logout}><PrimaryButton label="Sair da conta" variant="danger" onPress={logout} loading={busy} /></View>
    </ScrollView>
  );
}

function SettingsRow({ icon, title, detail, color, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; detail: string; color: string; onPress?: () => void }) {
  const content = <><View style={[styles.rowIcon, { backgroundColor: `${color}1F` }]}><MaterialCommunityIcons name={icon} size={22} color={color} /></View><View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>{onPress ? <MaterialCommunityIcons name="refresh" size={20} color={colors.muted} /> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={styles.row}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { paddingBottom: spacing.xxl, gap: spacing.md },
  profile: { marginHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center' }, avatar: { width: 58, height: 58, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueDark }, avatarText: { color: colors.text, fontSize: 23, fontWeight: '900' }, profileText: { flex: 1, marginLeft: spacing.lg }, name: { color: colors.text, fontSize: 18, fontWeight: '900' }, email: { color: colors.textSecondary, marginTop: 3 },
  section: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: spacing.lg, marginTop: spacing.lg }, list: { marginHorizontal: spacing.lg, paddingVertical: spacing.xs }, row: { minHeight: 68, flexDirection: 'row', alignItems: 'center' }, rowIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' }, rowText: { flex: 1, marginHorizontal: spacing.md }, rowTitle: { color: colors.text, fontWeight: '800' }, rowDetail: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 }, divider: { height: 1, backgroundColor: colors.border }, logout: { marginHorizontal: spacing.lg, marginTop: spacing.xl },
});

