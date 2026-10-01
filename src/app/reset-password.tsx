import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppSettings } from '../context/app-settings-context';
import { useAuth } from '../context/auth-context';
import { supabase } from '../lib/supabase';
import { useAppStyles } from '../lib/themed-styles';

export default function ResetPasswordScreen() {
  const styles = useAppStyles(lightStyles);
  const { t } = useAppSettings();
  const { session } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Redirect href="/auth" />;

  async function savePassword() {
    if (password.length < 6) {
      setError(t('sixCharacters'));
      return;
    }
    if (password !== confirmation) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/(tabs)');
    } catch {
      setError(t('authGenericError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('resetPassword')}</Text>
        <Text style={styles.description}>{t('newPasswordInstructions')}</Text>
        <View style={styles.form}>
          <Text style={styles.label}>{t('newPassword')}</Text>
          <TextInput style={styles.input} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} editable={!loading} />
          <Text style={styles.label}>{t('confirmPassword')}</Text>
          <TextInput style={styles.input} secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={setConfirmation} editable={!loading} onSubmitEditing={() => void savePassword()} />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.button, loading && styles.disabled]} disabled={loading} onPress={() => void savePassword()}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('saveNewPassword')}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 50 },
  title: { fontSize: 34, fontWeight: '700', color: '#111827' },
  description: { marginTop: 10, fontSize: 16, lineHeight: 23, color: '#6B7280' },
  form: { marginTop: 38 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#374151' },
  input: { marginBottom: 18, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 14, backgroundColor: '#FFFFFF', fontSize: 16, color: '#111827' },
  error: { marginBottom: 14, color: '#B91C1C', fontSize: 14 },
  button: { marginTop: 6, minHeight: 54, borderRadius: 14, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
