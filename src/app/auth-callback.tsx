import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppSettings } from '../context/app-settings-context';
import { AUTH_CALLBACK_URL } from '../lib/auth-redirect';
import { supabase } from '../lib/supabase';
import { useAppStyles } from '../lib/themed-styles';

export default function AuthCallbackScreen() {
  const styles = useAppStyles(lightStyles);
  const { t } = useAppSettings();
  const router = useRouter();
  const url = Linking.useURL();
  const handledUrl = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleLink(link: string | null) {
      if (!link || handledUrl.current === link) return;
      const suffix = link.slice(AUTH_CALLBACK_URL.length);
      if (!link.startsWith(AUTH_CALLBACK_URL) || (suffix && !/^[/?#]/.test(suffix))) {
        setError(t('authLinkInvalid'));
        return;
      }
      handledUrl.current = link;

      // Supabase's default email links return an implicit session in the URL
      // fragment. Query parameters are read too for expired-link errors.
      const query = new URLSearchParams(link.split('?')[1]?.split('#')[0] ?? '');
      const fragment = new URLSearchParams(link.split('#')[1] ?? '');
      const value = (key: string) => fragment.get(key) ?? query.get(key);

      if (value('error')) {
        setError(t('authLinkInvalid'));
        return;
      }

      const accessToken = value('access_token');
      const refreshToken = value('refresh_token');
      if (!accessToken || !refreshToken) {
        setError(t('authLinkInvalid'));
        return;
      }

      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        router.replace(value('type') === 'recovery' ? '/reset-password' : '/(tabs)');
      } catch {
        setError(t('authLinkInvalid'));
      }
    }

    if (url) {
      void handleLink(url);
    } else {
      void Linking.getInitialURL()
        .then((initialUrl) => initialUrl ? handleLink(initialUrl) : setError(t('authLinkInvalid')))
        .catch(() => setError(t('authLinkInvalid')));
    }
  }, [router, t, url]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{error ? t('authLinkError') : t('authLinkOpening')}</Text>
      {error ? (
        <>
          <Text style={styles.description}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
            <Text style={styles.buttonText}>{t('backToSignIn')}</Text>
          </TouchableOpacity>
        </>
      ) : <ActivityIndicator color="#4F46E5" style={styles.indicator} />}
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#F6F7F9' },
  title: { fontSize: 25, fontWeight: '700', color: '#111827', textAlign: 'center' },
  description: { marginTop: 14, fontSize: 15, lineHeight: 22, color: '#6B7280', textAlign: 'center' },
  indicator: { marginTop: 24 },
  button: { marginTop: 28, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, backgroundColor: '#111827' },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
});
