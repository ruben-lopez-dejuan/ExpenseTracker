import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
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

import { useAuth } from '../context/auth-context';
import { useAppSettings } from '../context/app-settings-context';
import { AUTH_CALLBACK_URL } from '../lib/auth-redirect';
import { supabase } from '../lib/supabase';
import { useAppStyles } from '../lib/themed-styles';

type AuthMode = 'signIn' | 'signUp' | 'confirm' | 'recover' | 'recoverySent';
type Notice = { text: string; error: boolean } | null;

export default function AuthScreen() {
  const styles = useAppStyles(lightStyles);
  const { session } = useAuth();
  const { t } = useAppSettings();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const passwordRef = useRef<TextInput>(null);

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  function changeMode(next: AuthMode) {
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  }

  function showError(error: unknown) {
    const message = error instanceof Error ? error.message : t('authGenericError');
    setNotice({ text: message, error: true });
  }

  function checkEmail() {
    if (isEmailValid) return true;
    setNotice({ text: t('invalidEmail'), error: true });
    return false;
  }

  async function handleSignIn() {
    if (!checkEmail()) return;
    if (!password) {
      setNotice({ text: t('enterCredentials'), error: true });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (error.code === 'email_not_confirmed') setMode('confirm');
        setNotice({
          text: error.code === 'email_not_confirmed' ? t('emailNotConfirmed') : error.message,
          error: true,
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    if (!checkEmail()) return;
    if (password.length < 6) {
      setNotice({ text: t('sixCharacters'), error: true });
      return;
    }
    if (password !== confirmPassword) {
      setNotice({ text: t('passwordsDoNotMatch'), error: true });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: AUTH_CALLBACK_URL },
      });
      if (error) throw error;
      if (!data.session) {
        setMode('confirm');
        setNotice({ text: t('confirmationLinkSent'), error: false });
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!checkEmail()) return;
    setLoading(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: AUTH_CALLBACK_URL },
      });
      if (error) throw error;
      setNotice({ text: t('confirmationLinkSent'), error: false });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset() {
    if (!checkEmail()) return;
    setLoading(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: AUTH_CALLBACK_URL,
      });
      if (error) throw error;
      setMode('recoverySent');
      setNotice({ text: t('recoveryLinkSent'), error: false });
    } catch {
      setNotice({ text: t('authGenericError'), error: true });
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'signUp' ? t('createAccount')
    : mode === 'confirm' ? t('verifyEmail')
    : mode === 'recover' || mode === 'recoverySent'
      ? t('resetPassword')
      : 'Expense Tracker';

  const description = mode === 'confirm' ? t('confirmationInstructions')
    : mode === 'recoverySent' ? t('recoveryInstructions')
    : mode === 'recover' ? t('recoveryEmailInstructions')
    : t('authSubtitle');

  const showEmail = mode !== 'recoverySent';
  const showPassword = mode === 'signIn' || mode === 'signUp';

  const submit = mode === 'signIn' ? handleSignIn
    : mode === 'signUp' ? handleSignUp
    : mode === 'recover' ? handleRequestReset
    : undefined;

  const submitLabel = mode === 'signIn' ? t('signIn')
    : mode === 'signUp' ? t('createAccount')
    : t('sendRecoveryLink');

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>€</Text></View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{description}</Text>

        <View style={styles.form}>
          {showEmail && (
            <>
              <Text style={styles.label}>{t('email')}</Text>
              <TextInput
                style={styles.input}
                placeholder="tu@email.com"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                editable={!loading && mode !== 'confirm'}
                returnKeyType={showPassword ? 'next' : 'done'}
                onSubmitEditing={() => showPassword ? passwordRef.current?.focus() : submit && void submit()}
              />
            </>
          )}

          {showPassword && (
            <>
              <Text style={styles.label}>{t('password')}</Text>
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                returnKeyType={mode === 'signUp' ? 'next' : 'done'}
                onSubmitEditing={() => mode === 'signIn' && void handleSignIn()}
              />
            </>
          )}

          {mode === 'signUp' && (
            <>
              <Text style={styles.label}>{t('confirmPassword')}</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                autoComplete="new-password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={() => void handleSignUp()}
              />
            </>
          )}

          {notice && (
            <View style={[styles.notice, notice.error ? styles.noticeError : styles.noticeSuccess]}>
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
          )}

          {submit && (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              disabled={loading}
              onPress={() => void submit()}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.primaryButtonText}>{submitLabel}</Text>}
            </TouchableOpacity>
          )}

          {mode === 'signIn' && (
            <>
              <TouchableOpacity style={styles.textButton} disabled={loading} onPress={() => changeMode('recover')}>
                <Text style={styles.textButtonText}>{t('forgotPassword')}</Text>
              </TouchableOpacity>
              <View style={styles.separator}>
                <View style={styles.line} />
                <Text style={styles.separatorText}>{t('or')}</Text>
                <View style={styles.line} />
              </View>
              <TouchableOpacity style={styles.secondaryButton} disabled={loading} onPress={() => changeMode('signUp')}>
                <Text style={styles.secondaryButtonText}>{t('createAccount')}</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'confirm' && (
            <TouchableOpacity style={styles.textButton} disabled={loading} onPress={() => void handleResendConfirmation()}>
              <Text style={styles.textButtonText}>{t('resendLink')}</Text>
            </TouchableOpacity>
          )}

          {mode === 'recoverySent' && (
            <TouchableOpacity style={styles.textButton} disabled={loading} onPress={() => void handleRequestReset()}>
              <Text style={styles.textButtonText}>{t('resendLink')}</Text>
            </TouchableOpacity>
          )}

          {mode !== 'signIn' && (
            <TouchableOpacity style={styles.textButton} disabled={loading} onPress={() => changeMode('signIn')}>
              <Text style={styles.textButtonText}>{t('backToSignIn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 50 },
  logo: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#111827',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  logoText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
  title: { fontSize: 34, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 10, fontSize: 16, lineHeight: 23, color: '#6B7280' },
  form: { marginTop: 38 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#374151' },
  input: {
    marginBottom: 18, paddingHorizontal: 16, paddingVertical: 16,
    borderRadius: 14, backgroundColor: '#FFFFFF', fontSize: 16, color: '#111827',
  },
  notice: { marginBottom: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  noticeError: { backgroundColor: '#FEF2F2' },
  noticeSuccess: { backgroundColor: '#ECFDF5' },
  noticeText: { color: '#374151', fontSize: 14, lineHeight: 20 },
  primaryButton: {
    marginTop: 6, minHeight: 54, borderRadius: 14, backgroundColor: '#111827',
    justifyContent: 'center', alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  textButton: { alignSelf: 'center', marginTop: 18, padding: 7 },
  textButtonText: { color: '#4F46E5', fontSize: 14, fontWeight: '700' },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#D1D5DB' },
  separatorText: { marginHorizontal: 14, color: '#9CA3AF' },
  secondaryButton: {
    minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
  secondaryButtonText: { color: '#111827', fontSize: 16, fontWeight: '600' },
});
