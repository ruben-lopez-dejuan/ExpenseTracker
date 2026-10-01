import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppLoadingScreen from '../components/app-loading-screen';

import {
  AppSettingsProvider,
  useAppSettings,
} from '../context/app-settings-context';
import { AuthProvider, useAuth } from '../context/auth-context';
import { CategoriesProvider, useCategories } from '../context/categories-context';
import { ConnectivityProvider } from '../context/connectivity-context';
import { ExpensesProvider, useExpenses } from '../context/expenses-context';
import { FeedbackProvider } from '../context/feedback-context';
import { FinanceProvider, useFinance } from '../context/finance-context';
import { OfflineSyncProvider } from '../context/offline-sync-context';
import { PreferencesProvider } from '../context/preferences-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppSettingsProvider>
        <AppContent />
      </AppSettingsProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { isDark } = useAppSettings();

  return (
    <ConnectivityProvider>
      <AuthProvider>
        <OfflineSyncProvider>
          <FeedbackProvider>
            <PreferencesProvider>
              <CategoriesProvider>
                <ExpensesProvider>
                  <FinanceProvider>
                    <AppBootstrapGate>
                      <StatusBar style={isDark ? 'light' : 'dark'} />
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: {
                            backgroundColor: isDark ? '#0F1115' : '#F6F7F9',
                          },
                        }}
                      >
                        <Stack.Screen name="index" />
                        <Stack.Screen name="auth" />
                        <Stack.Screen name="auth-callback" />
                        <Stack.Screen name="reset-password" />
                        <Stack.Screen name="(tabs)" />
                      </Stack>
                    </AppBootstrapGate>
                  </FinanceProvider>
                </ExpensesProvider>
              </CategoriesProvider>
            </PreferencesProvider>
          </FeedbackProvider>
        </OfflineSyncProvider>
      </AuthProvider>
    </ConnectivityProvider>
  );
}

function AppBootstrapGate({ children }: { children: React.ReactNode }) {
  const { hydrated: settingsHydrated } = useAppSettings();
  const { loading: authLoading, user } = useAuth();
  const { hydrated: categoriesHydrated } = useCategories();
  const { hydrated: expensesHydrated } = useExpenses();
  const { hydrated: financeHydrated } = useFinance();
  const ready = settingsHydrated && !authLoading && (
    !user || (categoriesHydrated && expensesHydrated && financeHydrated)
  );
  if (!ready) return <AppLoadingScreen />;
  return <>{children}</>;
}
