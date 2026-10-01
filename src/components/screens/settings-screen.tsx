import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CurrencyPickerModal from '../currency-picker-modal';
import {
  CurrencyCode,
  currencyName,
  useAppSettings,
} from '../../context/app-settings-context';
import { useAuth } from '../../context/auth-context';
import { useFeedback } from '../../context/feedback-context';
import { useConnectivity } from '../../context/connectivity-context';
import { E5Status, useE5Model } from '../../context/e5-model-context';
import { useAppStyles } from '../../lib/themed-styles';
import { TranslationKey } from '../../lib/i18n';
import { clearOfflineUserData } from '../../lib/offline-storage';
import { supabase } from '../../lib/supabase';

type SettingsScreenProps = {
  onClose?: () => void;
};

type CurrencyPickerMode = 'input' | 'display' | null;

function modelDescription(status: E5Status, progress: number, t: (key: TranslationKey) => string) {
  if (status === 'ready') return t('advancedModelReady');
  if (status === 'expo-go') return t('advancedModelBuildRequired');
  if (status === 'downloading') return `${t('advancedModelDownloading')} · ${Math.round(progress * 100)}%`;
  if (status === 'loading') return t('advancedModelLoading');
  if (status === 'error') return t('advancedModelError');
  if (status === 'checking') return t('advancedModelChecking');
  return t('advancedModelOptional');
}

export default function SettingsScreen({
  onClose,
}: SettingsScreenProps) {
  const styles = useAppStyles(lightStyles);
  const { user, signOut } = useAuth();
  const { showFeedback } = useFeedback();
  const { status: connectivityStatus, retry: retryConnectivity } = useConnectivity();
  const model = useE5Model();
  const {
    inputCurrency,
    displayCurrency,
    themeMode,
    language,
    locale,
    plannedExecutionMode,
    rateStatus,
    setInputCurrency,
    setDisplayCurrency,
    setThemeMode,
    setPlannedExecutionMode,
    t,
    refreshRates,
    getRate,
  } = useAppSettings();
  const [signingOut, setSigningOut] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [currencyPicker, setCurrencyPicker] =
    useState<CurrencyPickerMode>(null);

  const currentRate = getRate(inputCurrency);

  async function handleSignOut() {
    if (signingOut) return;

    try {
      setSigningOut(true);
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      showFeedback(t('signOutError'), 'error');
      setSigningOut(false);
    }
  }

  async function handleRefreshRate() {
    const updated = await refreshRates([inputCurrency], true);
    showFeedback(
      updated
        ? t('rateUpdated')
        : t('rateUpdateError'),
      updated ? 'info' : 'error'
    );
  }

  function handleRemoveModel() {
    Alert.alert(
      t('removeAdvancedModel'),
      t('removeAdvancedModelConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => void model.remove() },
      ]
    );
  }

  function closeDeleteDialog() {
    if (deletingAccount) return;
    setDeleteConfirmation('');
    setDeleteVisible(false);
  }

  async function handleDeleteAccount() {
    if (!user || deleteConfirmation.trim().toUpperCase() !== t('deleteAccountWord')) return;
    if (connectivityStatus !== 'online') {
      showFeedback(t('deleteAccountOffline'), 'error');
      return;
    }

    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
      });
      if (error) throw error;
      await clearOfflineUserData(user.id);
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
    } catch (error) {
      console.error('Error deleting account:', error);
      showFeedback(t('deleteAccountError'), 'error');
      setDeletingAccount(false);
    }
  }

  function chooseCurrency(currency: CurrencyCode) {
    if (currencyPicker === 'input') setInputCurrency(currency);
    if (currencyPicker === 'display') setDisplayCurrency(currency);
    setCurrencyPicker(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {onClose && (
            <TouchableOpacity accessibilityLabel={t('back')} style={styles.closeButton} onPress={onClose}>
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{t('settings')}</Text>
        </View>
        <Text style={styles.subtitle}>
          {t('settingsSubtitle')}
        </Text>

        <Text style={styles.sectionTitle}>{t('account')}</Text>
        <View style={styles.card}>
          <SettingRow
            styles={styles}
            icon="person-outline"
            iconColor="#4F46E5"
            iconBackground="#EEF2FF"
            title={t('signedIn')}
            value={user?.email ?? 'Cuenta de ExpenseTracker'}
          />
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.75}
            onPress={() => setDeleteVisible(true)}
          >
            <View style={styles.dangerIcon}>
              <Ionicons name="trash-outline" size={21} color="#DC2626" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.dangerTitle}>{t('deleteAccount')}</Text>
              <Text style={styles.rowValue}>{t('deleteAccountDescription')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t('preferences')}</Text>
        <View style={styles.themeControl}>
          <ThemeOption
            styles={styles}
            label={t('automatic')}
            icon="flash-outline"
            selected={plannedExecutionMode === 'automatic'}
            onPress={() => setPlannedExecutionMode('automatic')}
          />
          <ThemeOption
            styles={styles}
            label={t('manual')}
            icon="hand-left-outline"
            selected={plannedExecutionMode === 'manual'}
            onPress={() => setPlannedExecutionMode('manual')}
          />
        </View>
        <Text style={styles.preferenceHint}>
          {plannedExecutionMode === 'automatic'
            ? t('automaticDescription')
            : t('manualDescription')}
        </Text>

        <Text style={styles.sectionTitle}>{t('currencies')}</Text>
        <View style={styles.card}>
          <SettingRow
            styles={styles}
            icon="wallet-outline"
            iconColor="#047857"
            iconBackground="#ECFDF5"
            title={t('inputCurrency')}
            value={`${currencyName(inputCurrency, language)} (${inputCurrency})`}
            onPress={() => setCurrencyPicker('input')}
          />
          <View style={styles.divider} />
          <SettingRow
            styles={styles}
            icon="swap-horizontal-outline"
            iconColor="#0369A1"
            iconBackground="#E0F2FE"
            title={t('displayedCurrency')}
            value={`${currencyName(displayCurrency, language)} (${displayCurrency})`}
            onPress={() => setCurrencyPicker('display')}
          />
          <View style={styles.divider} />
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.rateRow}
            onPress={() => void handleRefreshRate()}
            disabled={rateStatus === 'loading'}
          >
            <View style={styles.rateText}>
              <Text style={styles.rowTitle}>{t('exchangeRate')}</Text>
              <Text style={styles.rowValue}>
                {inputCurrency === displayCurrency
                  ? `1 ${inputCurrency} = 1 ${displayCurrency}`
                  : currentRate
                    ? `1 ${inputCurrency} = ${currentRate.rate.toLocaleString(locale, {
                        maximumFractionDigits: 6,
                      })} ${displayCurrency} · ${currentRate.date}`
                    : rateStatus === 'error'
                      ? t('cachedRate')
                      : t('latestRate')}
              </Text>
              <Text style={styles.rateProvider}>
                {t('rateReference')}
              </Text>
            </View>
            {rateStatus === 'loading' ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Ionicons name="refresh" size={20} color="#6B7280" />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t('appearance')}</Text>
        <View style={styles.themeControl}>
          <ThemeOption
            styles={styles}
            label={t('light')}
            icon="sunny-outline"
            selected={themeMode === 'light'}
            onPress={() => setThemeMode('light')}
          />
          <ThemeOption
            styles={styles}
            label={t('dark')}
            icon="moon-outline"
            selected={themeMode === 'dark'}
            onPress={() => setThemeMode('dark')}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('categories')}</Text>
        <View style={styles.card}>
          <SettingRow
            styles={styles}
            icon={model.status === 'ready' ? 'checkmark-circle' : 'sparkles-outline'}
            iconColor={model.status === 'ready' ? '#047857' : '#4F46E5'}
            iconBackground={model.status === 'ready' ? '#DCFCE7' : '#EEF2FF'}
            title={t('advancedCategorization')}
            value={modelDescription(model.status, model.progress, t)}
            onPress={model.status === 'not-installed'
              ? () => void model.download()
              : model.status === 'error'
                ? () => void model.download()
                : undefined}
          />
          {model.status === 'downloading' && (
            <View style={styles.modelProgressTrack}>
              <View style={[styles.modelProgressFill, { width: `${Math.round(model.progress * 100)}%` }]} />
            </View>
          )}
          {model.status === 'ready' && (
            <>
              <View style={styles.divider} />
              <SettingRow
                styles={styles}
                icon="trash-outline"
                iconColor="#B91C1C"
                iconBackground="#FEE2E2"
                title={t('removeAdvancedModel')}
                value={t('removeAdvancedModelDescription')}
                onPress={handleRemoveModel}
              />
            </>
          )}
          <View style={styles.divider} />
          <SettingRow
            styles={styles}
            icon="pricetags-outline"
            iconColor="#4F46E5"
            iconBackground="#EEF2FF"
            title={t('categorySuggestions')}
            value={t('categorySuggestionsDescription')}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('dataAndPrivacy')}</Text>
        <View style={styles.card}>
          <SettingRow
            styles={styles}
            icon="shield-checkmark-outline"
            iconColor="#0369A1"
            iconBackground="#E0F2FE"
            title={t('privacy')}
            value={t('privacyDescription')}
          />
          <View style={styles.divider} />
          <SettingRow
            styles={styles}
            icon={connectivityStatus === 'online' ? 'cloud-done-outline' : 'cloud-offline-outline'}
            iconColor={connectivityStatus === 'online' ? '#047857' : '#A16207'}
            iconBackground={connectivityStatus === 'online' ? '#DCFCE7' : '#FEF3C7'}
            title={t('connection')}
            value={connectivityStatus === 'online'
              ? t('connected')
              : connectivityStatus === 'offline'
                ? t('offlineRetry')
                : t('checkingConnection')}
            onPress={connectivityStatus === 'offline' ? retryConnectivity : undefined}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('about')}</Text>
        <View style={styles.card}>
          <SettingRow
            styles={styles}
            icon="information-circle-outline"
            iconColor="#4B5563"
            iconBackground="#F3F4F6"
            title={t('version')}
            value={Constants.expoConfig?.version ?? '1.0.0'}
          />
        </View>

        <View style={styles.spacer} />
        <TouchableOpacity
          activeOpacity={0.78}
          style={[
            styles.logoutButton,
            signingOut && styles.logoutButtonDisabled,
          ]}
          disabled={signingOut}
          onPress={() => void handleSignOut()}
        >
          {signingOut ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <Ionicons name="log-out-outline" size={21} color="#DC2626" />
          )}
          <Text style={styles.logoutText}>
            {signingOut ? t('signingOut') : t('signOut')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteDialog}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteDialog}>
            <View style={styles.deleteDialogIcon}>
              <Ionicons name="warning-outline" size={26} color="#DC2626" />
            </View>
            <Text style={styles.deleteDialogTitle}>{t('deleteAccount')}</Text>
            <Text style={styles.deleteDialogDescription}>
              {t('deleteAccountWarning')}
            </Text>
            <Text style={styles.deleteDialogInstruction}>
              {t('deleteAccountInstruction')}
            </Text>
            <TextInput
              style={styles.deleteInput}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deletingAccount}
              placeholder={t('deleteAccountWord')}
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.cancelDeleteButton}
                disabled={deletingAccount}
                onPress={closeDeleteDialog}
              >
                <Text style={styles.cancelDeleteText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDeleteButton,
                  (deletingAccount || deleteConfirmation.trim().toUpperCase() !== t('deleteAccountWord')) && styles.logoutButtonDisabled,
                ]}
                disabled={deletingAccount || deleteConfirmation.trim().toUpperCase() !== t('deleteAccountWord')}
                onPress={() => void handleDeleteAccount()}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDeleteText}>{t('deleteAccountPermanently')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal
        visible={currencyPicker !== null}
        title={
          currencyPicker === 'input'
            ? t('inputCurrency')
            : t('displayedCurrency')
        }
        selected={
          currencyPicker === 'input' ? inputCurrency : displayCurrency
        }
        onSelect={chooseCurrency}
        onClose={() => setCurrencyPicker(null)}
      />
    </SafeAreaView>
  );
}

function SettingRow({
  styles,
  icon,
  iconColor,
  iconBackground,
  title,
  value,
  onPress,
}: {
  styles: typeof lightStyles;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  title: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      )}
    </>
  );

  return onPress ? (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      {content}
    </TouchableOpacity>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

function ThemeOption({
  styles,
  label,
  icon,
  selected,
  onPress,
}: {
  styles: typeof lightStyles;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.themeOption, selected && styles.themeOptionSelected]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={21}
        color={selected ? '#4F46E5' : '#6B7280'}
      />
      <Text style={[styles.themeText, selected && styles.themeTextSelected]}>
        {label}
      </Text>
      {selected && (
        <Ionicons name="checkmark-circle" size={19} color="#4F46E5" />
      )}
    </TouchableOpacity>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32 },
  header: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 5, fontSize: 14, lineHeight: 20, color: '#6B7280' },
  sectionTitle: {
    marginTop: 25,
    marginBottom: 9,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: { paddingHorizontal: 15, borderRadius: 18, backgroundColor: '#FFFFFF' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowValue: { marginTop: 3, fontSize: 12, lineHeight: 17, color: '#6B7280' },
  divider: { height: 1, marginLeft: 54, backgroundColor: '#F0F1F3' },
  dangerRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
  },
  dangerTitle: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  modelProgressTrack: {
    height: 5, marginLeft: 54, marginRight: 4, marginBottom: 12,
    overflow: 'hidden', borderRadius: 3, backgroundColor: '#C7D2FE',
  },
  modelProgressFill: { height: 5, borderRadius: 3, backgroundColor: '#4F46E5' },
  rateRow: {
    minHeight: 82,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rateText: { flex: 1 },
  rateProvider: { marginTop: 5, fontSize: 11, color: '#9CA3AF' },
  themeControl: { flexDirection: 'row', gap: 10 },
  themeOption: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  themeOptionSelected: { borderColor: '#818CF8', backgroundColor: '#EEF2FF' },
  themeText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#4B5563' },
  themeTextSelected: { color: '#4F46E5' },
  preferenceHint: { marginTop: 9, fontSize: 12, lineHeight: 17, color: '#6B7280' },
  spacer: { flex: 1, minHeight: 42 },
  logoutButton: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  logoutButtonDisabled: { opacity: 0.55 },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  modalBackdrop: {
    flex: 1, padding: 22, backgroundColor: 'rgba(17, 24, 39, 0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteDialog: {
    width: '100%', maxWidth: 430, padding: 22, borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  deleteDialogIcon: {
    width: 50, height: 50, borderRadius: 16, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteDialogTitle: { marginTop: 16, fontSize: 22, fontWeight: '800', color: '#111827' },
  deleteDialogDescription: { marginTop: 9, fontSize: 14, lineHeight: 21, color: '#4B5563' },
  deleteDialogInstruction: { marginTop: 18, fontSize: 13, fontWeight: '700', color: '#374151' },
  deleteInput: {
    marginTop: 9, minHeight: 50, paddingHorizontal: 14, borderWidth: 1,
    borderColor: '#FCA5A5', borderRadius: 14, backgroundColor: '#FFFFFF',
    color: '#111827', fontSize: 15, fontWeight: '700',
  },
  deleteActions: { marginTop: 20, flexDirection: 'row', gap: 10 },
  cancelDeleteButton: {
    flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1,
    borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center',
  },
  cancelDeleteText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmDeleteButton: {
    flex: 1.4, minHeight: 50, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
  },
  confirmDeleteText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
});
