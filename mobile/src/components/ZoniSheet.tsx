import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../contexts/FinanceContext';
import { finzoniApiUrl } from '../lib/supabase';
import { colors, radii, spacing } from '../theme';
import { buildZoniContext } from '../utils/finance';
import { IconButton } from './UI';

interface Message { role: 'user' | 'assistant'; content: string }

export function ZoniButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Abrir Zoni Financeiro" onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.75 }]}><MaterialCommunityIcons name="creation" size={27} color={colors.text} /></Pressable>;
}

export function ZoniSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { data, month } = useFinance();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'OlÃ¡! Sou o Zoni. Posso analisar seus nÃºmeros e ajudar vocÃª a decidir o prÃ³ximo passo.' }]);
  const scrollRef = useRef<ScrollView>(null);
  const context = useMemo(() => buildZoniContext(data, month), [data, month]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!data.nvidiaApiKey) {
      setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: 'A chave da NVIDIA NIM ainda nÃ£o estÃ¡ configurada. Configure-a nos Ajustes do FinZoni Web e tente novamente.' }]);
      setInput('');
      return;
    }
    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(`${finzoniApiUrl}/api/nvidia-proxy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ action: 'chat', apiKey: data.nvidiaApiKey, model: data.nvidiaModel || 'meta/llama-3.1-8b-instruct', temperature: 0.45, max_tokens: 650,
          messages: [{ role: 'system', content: `VocÃª Ã© o Zoni, assistente financeiro pessoal do FinZoni. Responda sempre em portuguÃªs do Brasil, de forma clara, breve e prÃ¡tica. NÃ£o invente valores. Dados atuais do usuÃ¡rio: ${context}` }, ...nextMessages.slice(-8)] }),
      });
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Falha ao consultar a NVIDIA NIM.');
      const answer = payload.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error('A NVIDIA nÃ£o retornou uma resposta agora.');
      setMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'AbortError';
      setMessages((current) => [...current, { role: 'assistant', content: timedOut ? 'A NVIDIA demorou mais que o esperado. Toque em tentar novamente daqui a pouco.' : 'NÃ£o consegui responder agora. Verifique sua conexÃ£o e tente novamente.' }]);
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar Zoni" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.head}><View style={styles.zoniIcon}><MaterialCommunityIcons name="creation" size={23} color={colors.purple} /></View><View style={styles.headText}><Text style={styles.title}>Zoni Financeiro</Text><Text style={styles.subtitle}>InteligÃªncia NVIDIA NIM</Text></View><IconButton icon="close" label="Fechar" onPress={onClose} /></View>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.map((message, index) => <View key={`${message.role}-${index}`} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={styles.messageText}>{message.content}</Text></View>)}
          {busy ? <View style={[styles.bubble, styles.assistantBubble]}><Text style={styles.thinking}>Analisando seus dados...</Text></View> : null}
        </ScrollView>
        <View style={styles.composer}><TextInput accessibilityLabel="Mensagem para o Zoni" value={input} onChangeText={setInput} onSubmitEditing={send} returnKeyType="send" placeholder="Ex.: Quanto posso gastar atÃ© o fim do mÃªs?" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={800} /><Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={busy || !input.trim()} onPress={send} style={[styles.send, (busy || !input.trim()) && styles.sendDisabled]}><MaterialCommunityIcons name="arrow-up" size={23} color={colors.black} /></Pressable></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: spacing.lg, bottom: 88, width: 56, height: 56, borderRadius: radii.pill, backgroundColor: '#261443', borderWidth: 1, borderColor: colors.purple, alignItems: 'center', justifyContent: 'center', elevation: 10 },
  overlay: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)' }, sheet: { height: '84%', backgroundColor: colors.backgroundRaised, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong },
  head: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, zoniIcon: { width: 46, height: 46, borderRadius: radii.md, backgroundColor: '#261443', alignItems: 'center', justifyContent: 'center' }, headText: { flex: 1, marginLeft: spacing.md }, title: { color: colors.text, fontSize: 19, fontWeight: '900' }, subtitle: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  messages: { flex: 1 }, messagesContent: { padding: spacing.lg, gap: spacing.md }, bubble: { maxWidth: '86%', borderRadius: radii.md, padding: spacing.md }, assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, userBubble: { alignSelf: 'flex-end', backgroundColor: colors.purple }, messageText: { color: colors.text, fontSize: 15, lineHeight: 21 }, thinking: { color: colors.textSecondary, fontStyle: 'italic' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderColor: colors.border }, input: { flex: 1, maxHeight: 110, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 }, send: { width: 50, height: 50, borderRadius: radii.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.4 },
});
