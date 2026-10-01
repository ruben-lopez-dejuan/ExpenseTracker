import DateTimePicker from '@expo/ui/community/datetime-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
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

import CategoryPickerModal from './category-picker-modal';
import CurrencyPickerModal from './currency-picker-modal';
import {
  CurrencyCode,
  currencyInfo,
  useAppSettings,
} from '../context/app-settings-context';
import { useCategories } from '../context/categories-context';
import {
  Expense,
  useExpenses,
} from '../context/expenses-context';
import { useFeedback } from '../context/feedback-context';
import { useFinance } from '../context/finance-context';
import { useAppStyles } from '../lib/themed-styles';

type ExpenseEditorModalProps = {
  expense: Expense | null;
  onClose: () => void;
};

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export default function ExpenseEditorModal({
  expense,
  onClose,
}: ExpenseEditorModalProps) {
  const styles = useAppStyles(lightStyles);
  const { updateExpense, deleteExpense } =
    useExpenses();
  const { getCategoryById } = useCategories();
  const { showFeedback } = useFeedback();
  const { completePlannedMovement } = useFinance();
  const { locale, plannedExecutionMode, t } = useAppSettings();

  const [description, setDescription] =
    useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] =
    useState<CurrencyCode>('EUR');
  const [categoryId, setCategoryId] =
    useState<string | null>(null);
  const [transactionDate, setTransactionDate] =
    useState(new Date());
  const [showDatePicker, setShowDatePicker] =
    useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] =
    useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] =
    useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!expense) {
      return;
    }

    setDescription(expense.description);
    setAmount(String(expense.amount));
    setCurrency(expense.currency);
    setCategoryId(expense.categoryId);
    setTransactionDate(expense.transactionDate);
    setShowDatePicker(false);
    setCategoryPickerVisible(false);
    setCurrencyPickerVisible(false);
  }, [expense]);

  const selectedCategory =
    getCategoryById(categoryId);
  const canComplete =
    expense?.status === 'planned' &&
    plannedExecutionMode === 'manual' &&
    startOfDay(transactionDate).getTime() <= startOfDay(new Date()).getTime();

  async function saveExpense() {
    if (!expense || saving) {
      return;
    }

    const parsedAmount = Number(
      amount.replace(',', '.')
    );

    if (
      !categoryId ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      showFeedback(
        t('invalidAmount'),
        'error'
      );
      return;
    }

    const future =
      startOfDay(transactionDate).getTime() >
      startOfDay(new Date()).getTime();

    try {
      setSaving(true);

      await updateExpense(expense.id, {
        description,
        amount: parsedAmount,
        currency,
        categoryId,
        transactionDate,
        status:
          future || (expense.status === 'planned' && plannedExecutionMode === 'manual')
            ? 'planned'
            : 'completed',
        source: expense.source,
      });

      onClose();
      showFeedback(t('updatedExpense'));
    } catch (error) {
      console.error('Error updating expense:', error);
      showFeedback(
        t('expenseSaveError'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeExpense() {
    if (!expense || saving) return;
    try {
      setSaving(true);
      await completePlannedMovement('expense', expense.id, expense.recurringId);
      onClose();
      showFeedback(t('movementCompleted'));
    } catch (error) {
      console.error('Error completing expense:', error);
      showFeedback(t('movementCompleteError'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!expense || saving) {
      return;
    }

    Alert.alert(
      t('deleteExpense'),
      t('deleteConfirm'),
      [
        {
          text: t('cancel'),
          style: 'cancel',
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteExpense(expense.id);
              onClose();
              showFeedback(t('expenseDeleted'));
            } catch (error) {
              console.error('Error deleting expense:', error);
              showFeedback(
                t('movementCompleteError'),
                'error'
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <Modal
        visible={expense !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  {t('editExpense')}
                </Text>

                <Text style={styles.subtitle}>
                  {t('editSubtitle')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('concept')}</Text>

            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder={t('optionalDescription')}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>{t('amount')}</Text>

            <View style={styles.amountInputContainer}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.currencyButton}
                onPress={() => setCurrencyPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('changeExpenseCurrency')}
              >
                <Text style={styles.currencySymbol}>
                  {currencyInfo(currency).symbol}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color="#6B7280"
                />
              </TouchableOpacity>

              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>{t('date')}</Text>

            <TouchableOpacity
              style={styles.selectorRow}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.dateIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={21}
                  color="#4F46E5"
                />
              </View>

              <Text style={styles.selectorText}>
                {new Intl.DateTimeFormat(locale, {
                  day: '2-digit', month: 'short', year: 'numeric',
                }).format(transactionDate)}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={transactionDate}
                mode="date"
                presentation="dialog"
                onValueChange={(_event, value) => {
                  setTransactionDate(value);
                  setShowDatePicker(false);
                }}
                onDismiss={() => setShowDatePicker(false)}
              />
            )}

            <Text style={styles.label}>{t('category')}</Text>

            <TouchableOpacity
              style={styles.selectorRow}
              onPress={() => setCategoryPickerVisible(true)}
            >
              <View
                style={[
                  styles.categoryIcon,
                  {
                    backgroundColor: `${
                      selectedCategory?.color ?? '#6366F1'
                    }18`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    (selectedCategory?.icon ??
                      'pricetag-outline') as any
                  }
                  size={22}
                  color={
                    selectedCategory?.color ?? '#6366F1'
                  }
                />
              </View>

              <View style={styles.selectorContent}>
                <Text style={styles.selectorText}>
                  {selectedCategory?.name ??
                    t('chooseCategoryAction')}
                </Text>

                {selectedCategory && (
                  <Text
                    style={styles.selectorDescription}
                    numberOfLines={1}
                  >
                    {selectedCategory.description}
                  </Text>
                )}
              </View>

              <Ionicons
                name="chevron-forward"
                size={19}
                color="#9CA3AF"
              />
            </TouchableOpacity>

            {canComplete && (
              <TouchableOpacity
                style={styles.completeButton}
                disabled={saving}
                onPress={() => void completeExpense()}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#047857" />
                <Text style={styles.completeText}>{t('markCompleted')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.saveButton,
                saving && styles.disabled,
              ]}
              disabled={saving}
              onPress={() => void saveExpense()}
            >
              <Text style={styles.saveText}>
                {saving ? t('saving') : t('saveChanges')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              disabled={saving}
              onPress={confirmDelete}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color="#DC2626"
              />

              <Text style={styles.deleteText}>
                {t('deleteExpense')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <CategoryPickerModal
        visible={categoryPickerVisible}
        selectedCategoryId={categoryId}
        title={t('changeCategory')}
        onSelect={setCategoryId}
        onClose={() => setCategoryPickerVisible(false)}
      />

      <CurrencyPickerModal
        visible={currencyPickerVisible}
        title={t('expenseCurrency')}
        selected={currency}
        onSelect={setCurrency}
        onClose={() => setCurrencyPickerVisible(false)}
      />
    </>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  content: {
    padding: 22,
    paddingBottom: 60,
  },

  header: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  input: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#111827',
  },

  amountInputContainer: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },

  currencySymbol: {
    fontSize: 17,
    fontWeight: '700',
    color: '#6B7280',
  },

  currencyButton: {
    minWidth: 48,
    minHeight: 42,
    marginRight: 6,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  amountInput: {
    flex: 1,
    height: 56,
    fontSize: 21,
    fontWeight: '700',
    color: '#111827',
  },

  selectorRow: {
    minHeight: 66,
    padding: 12,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  dateIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectorContent: {
    flex: 1,
  },

  selectorText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  selectorDescription: {
    marginTop: 3,
    paddingRight: 10,
    fontSize: 12,
    color: '#6B7280',
  },

  saveButton: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#111827',
  },

  completeButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    backgroundColor: '#ECFDF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  completeText: { color: '#047857', fontSize: 14, fontWeight: '800' },

  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  deleteButton: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  deleteText: {
    color: '#DC2626',
    fontWeight: '600',
  },

  disabled: {
    opacity: 0.55,
  },
});
