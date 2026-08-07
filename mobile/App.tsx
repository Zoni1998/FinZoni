import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { FinanceProvider, useFinance } from './src/contexts/FinanceContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BottomNav } from './src/components/BottomNav';
import { QuickActionSheet } from './src/components/QuickActionSheet';
import { ZoniButton, ZoniSheet } from './src/components/ZoniSheet';
import { LoadingState } from './src/components/UI';
import { colors } from './src/theme';
import type { QuickActionType, TabKey } from './src/types';

function FinZoniApp() {
  const { session, loading: authLoading } = useAuth();

  if (authLoading) return <LoadingState label="Preparando o FinZoni..." />;
  if (!session) return <AuthScreen />;
  return <AuthenticatedShell />;
}

function AuthenticatedShell() {
  const { loading } = useFinance();
  const [tab, setTab] = useState<TabKey>('home');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<QuickActionType>('expense');
  const [zoniOpen, setZoniOpen] = useState(false);

  if (loading) return <LoadingState />;

  const openQuick = (type: QuickActionType = 'expense') => {
    setQuickType(type);
    setQuickOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.screen}>
        {tab === 'home' ? <HomeScreen onOpenZoni={() => setZoniOpen(true)} /> : null}
        {tab === 'wallet' ? <WalletScreen onNewPurchase={() => openQuick('card')} /> : null}
        {tab === 'goals' ? <GoalsScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </View>
      <BottomNav active={tab} onChange={setTab} onQuickAction={() => openQuick('expense')} />
      <ZoniButton onPress={() => setZoniOpen(true)} />
      <QuickActionSheet visible={quickOpen} initialType={quickType} onClose={() => setQuickOpen(false)} />
      <ZoniSheet visible={zoniOpen} onClose={() => setZoniOpen(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <FinanceProvider>
          <FinZoniApp />
        </FinanceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, minWidth: 0 },
});
