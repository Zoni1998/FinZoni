import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type ViewStyle,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../theme';

export function ScreenHeader({
  title,
  subtitle,
  onPrevious,
  onNext,
}: {
  title: string;
  subtitle?: string;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <View style={styles.header}>
      {onPrevious ? (
        <IconButton icon="chevron-left" label="MÃªs anterior" onPress={onPrevious} />
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {onNext ? <IconButton icon="chevron-right" label="PrÃ³ximo mÃªs" onPress={onNext} /> : null}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'blue',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'blue' | 'green' | 'danger' | 'secondary';
}) {
  const background =
    variant === 'green'
      ? colors.green
      : variant === 'danger'
        ? colors.red
        : variant === 'secondary'
          ? colors.surfaceSoft
          : colors.blue;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, { backgroundColor: background }, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' ? colors.text : colors.black} /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.blue}
        style={[styles.field, props.multiline && styles.fieldMultiline, error && styles.fieldError]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Panel({ children, style }: React.PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function EmptyState({ icon, title, detail }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; detail: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={30} color={colors.blue} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

export function LoadingState({ label = 'Carregando seus dados...' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.blue} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.red} />
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Tentar novamente" onPress={onRetry}>
          <Text style={styles.retry}>Tentar novamente</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  headerText: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  headerSubtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  iconButton: { width: 48, height: 48, borderRadius: radii.pill, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  primaryButton: { minHeight: 50, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  primaryButtonText: { color: colors.black, fontWeight: '800', fontSize: 15 },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  field: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, color: colors.text, backgroundColor: colors.backgroundRaised, fontSize: 16 },
  fieldMultiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  fieldError: { borderColor: colors.red },
  errorText: { color: colors.red, fontSize: 12 },
  panel: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.sm },
  emptyDetail: { color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: spacing.lg },
  loadingText: { color: colors.textSecondary },
  errorBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: '#2A1420', borderWidth: 1, borderColor: '#6A2735' },
  errorBannerText: { color: colors.text, flex: 1, fontSize: 13 },
  retry: { color: colors.blue, fontWeight: '800' },
});

