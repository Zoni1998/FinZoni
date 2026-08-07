import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field, PrimaryButton } from '../components/UI';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii, spacing } from '../theme';

type Mode = 'login' | 'register' | 'reset';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!email.includes('@')) {
      setError('Informe um e-mail vÃ¡lido.');
      return;
    }
    if (mode !== 'reset' && password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      if (mode === 'register') {
        const result = await signUp(email, password);
        if (result === 'confirmation_required') {
          setMessage('Conta criada. Confirme o e-mail e depois entre no aplicativo.');
          setMode('login');
        }
      }
      if (mode === 'reset') {
        await resetPassword(email);
        setMessage('Enviamos as instruÃ§Ãµes de recuperaÃ§Ã£o para seu e-mail.');
        setMode('login');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'NÃ£o foi possÃ­vel continuar.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'Bem-vindo de volta' : mode === 'register' ? 'Criar sua conta' : 'Recuperar acesso';
  const action = mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Enviar instruÃ§Ãµes';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image source={require('../../assets/logo-glass.png')} style={styles.logo} accessibilityLabel="Logotipo do FinZoni" />
          <View>
            <Text style={styles.brandName}>FinZoni</Text>
            <Text style={styles.brandTag}>Sua vida financeira em um sÃ³ lugar</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Use a mesma conta do FinZoni no navegador.</Text>
          <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          {mode !== 'reset' ? <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /> : null}
          {error ? (
            <View style={styles.feedbackError}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={styles.feedbackText}>{error}</Text>
            </View>
          ) : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <PrimaryButton label={action} onPress={submit} loading={busy} />
          {mode === 'login' ? (
            <Pressable accessibilityRole="button" onPress={() => setMode('reset')} style={styles.linkButton}>
              <Text style={styles.link}>Esqueci minha senha</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'register' ? 'login' : mode === 'reset' ? 'login' : 'register')} style={styles.linkButton}>
            <Text style={styles.link}>{mode === 'login' ? 'Ainda nÃ£o tenho conta' : 'Voltar para o login'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'center' },
  logo: { width: 62, height: 62, borderRadius: radii.md },
  brandName: { color: colors.text, fontSize: 28, fontWeight: '900' },
  brandTag: { color: colors.textSecondary, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: colors.textSecondary, marginTop: -spacing.sm, lineHeight: 20 },
  feedbackError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  feedbackText: { color: colors.red, flex: 1 },
  success: { color: colors.green, lineHeight: 20 },
  linkButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.blue, fontWeight: '800' },
});
