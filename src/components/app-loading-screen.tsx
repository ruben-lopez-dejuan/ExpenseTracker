import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppSettings } from '../context/app-settings-context';
import { useAppStyles } from '../lib/themed-styles';

export default function AppLoadingScreen() {
  const styles = useAppStyles(lightStyles);
  const { t } = useAppSettings();
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.logoShell}>
          <Image
            source={require('../../assets/images/expense-tracker-app-icon.png')}
            style={styles.logo}
            contentFit="cover"
          />
        </View>
        <Text style={styles.title}>Expense Tracker</Text>
        <Text style={styles.message}>{t('loadingData')}</Text>
        <ActivityIndicator size="small" color="#4F46E5" style={styles.indicator} />
      </View>
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logoShell: {
    width: 104, height: 104, padding: 5, borderRadius: 28, backgroundColor: '#FFFFFF',
    shadowColor: '#312E81', shadowOpacity: 0.14, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 7,
  },
  logo: { width: '100%', height: '100%', borderRadius: 23 },
  title: { marginTop: 24, color: '#111827', fontSize: 25, fontWeight: '800' },
  message: { marginTop: 8, color: '#6B7280', fontSize: 14, textAlign: 'center' },
  indicator: { marginTop: 22 },
});
