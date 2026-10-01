import DateTimePicker from '@expo/ui/community/datetime-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryPickerModal from '../category-picker-modal';
import CurrencyPickerModal from '../currency-picker-modal';
import SettingsButton from '../settings-button';
import {
  currencyInfo,
  useAppSettings,
} from '../../context/app-settings-context';
import { useCategories } from '../../context/categories-context';
import { useExpenses } from '../../context/expenses-context';
import { useFeedback } from '../../context/feedback-context';
import { classifyCategories } from '../../lib/expense-intelligence/category-classifier';
import { useAppStyles } from '../../lib/themed-styles';

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isToday(date: Date) {
  return (
    startOfDay(date).getTime() ===
    startOfDay(new Date()).getTime()
  );
}

function isYesterday(date: Date) {
  const yesterday = startOfDay(new Date());
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    startOfDay(date).getTime() ===
    yesterday.getTime()
  );
}

function isFuture(date: Date) {
  return (
    startOfDay(date).getTime() >
    startOfDay(new Date()).getTime()
  );
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function AddExpenseScreen({
  initialDate,
  onSwitchIncome,
  onOpenSettings,
}: {
  initialDate?: Date | null;
  onSwitchIncome?: () => void;
  onOpenSettings: () => void;
}) {
  const styles = useAppStyles(lightStyles);
  const { addExpense } = useExpenses();
  const { categories, getCategoryById } =
    useCategories();
  const { showFeedback } = useFeedback();
  const { inputCurrency, locale, t } = useAppSettings();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] =
    useState(inputCurrency);
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
  const [suggestedCategoryIds, setSuggestedCategoryIds] =
    useState<string[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountInputRef = useRef<TextInput>(null);
  const classificationSequence = useRef(0);
  const classificationQueue = useRef<Promise<void>>(
    Promise.resolve()
  );

  const selectedCategory =
    getCategoryById(categoryId);
  const planned = isFuture(transactionDate);
  const dateMode = isToday(transactionDate)
    ? 'today'
    : isYesterday(transactionDate)
      ? 'yesterday'
      : 'other';

  useEffect(() => {
    setExpenseCurrency(inputCurrency);
  }, [inputCurrency]);

  useEffect(() => {
    if (initialDate) {
      setTransactionDate(new Date(initialDate));
      setShowDatePicker(false);
    }
  }, [initialDate]);

  useEffect(() => {
    const sequence = ++classificationSequence.current;
    const text = description.trim();

    if (text.length < 2 || categories.length === 0) {
      setSuggestedCategoryIds([]);
      setClassifying(false);
      return;
    }

    const timer = setTimeout(() => {
      setClassifying(true);

      const task = classificationQueue.current.then(
        () => classifyCategories(text, categories, 3)
      );

      classificationQueue.current = task.then(
        () => undefined,
        () => undefined
      );

      void task
        .then((result) => {
          if (
            sequence !== classificationSequence.current
          ) {
            return;
          }

          setSuggestedCategoryIds(
            result.suggestions.map(
              (item) => item.categoryId
            )
          );
        })
        .catch((error) => {
          console.warn(
            'Category classification failed:',
            error
          );
        })
        .finally(() => {
          if (
            sequence === classificationSequence.current
          ) {
            setClassifying(false);
          }
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [description, categories]);

  function chooseToday() {
    setTransactionDate(new Date());
    setShowDatePicker(false);
  }

  function chooseYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setTransactionDate(yesterday);
    setShowDatePicker(false);
  }

  async function handleSave() {
    if (saving) {
      return;
    }

    const parsedAmount = Number(
      amount.replace(',', '.')
    );

    if (
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      showFeedback(
        t('invalidAmount'),
        'error'
      );
      amountInputRef.current?.focus();
      return;
    }

    if (!categoryId) {
      showFeedback(
        t('selectCategory'),
        'error'
      );
      return;
    }

    try {
      setSaving(true);

      await addExpense({
        description: description.trim(),
        amount: parsedAmount,
        currency: expenseCurrency,
        categoryId,
        transactionDate,
        status: planned ? 'planned' : 'completed',
        source: 'manual',
      });

      setDescription('');
      setAmount('');
      setExpenseCurrency(inputCurrency);
      setCategoryId(null);
      setSuggestedCategoryIds([]);
      setTransactionDate(new Date());

      showFeedback(
        planned
          ? t('plannedExpenseSaved')
          : t('expenseSaved')
      );
    } catch (error) {
      console.error('Error saving expense:', error);
      showFeedback(
        t('expenseSaveError'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  const suggestedCategories =
    suggestedCategoryIds
      .map((id) => getCategoryById(id))
      .filter(Boolean);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            categoryId && styles.contentWithFooter,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            {onSwitchIncome && (
              <View style={styles.modeRow}>
                <View style={styles.modeActive}>
                  <Text style={styles.modeActiveText}>{t('expense')}</Text>
                </View>
                <TouchableOpacity style={styles.modeInactive} onPress={onSwitchIncome}>
                  <Text style={styles.modeInactiveText}>{t('income')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <SettingsButton onPress={onOpenSettings} />
          </View>
          <Text style={styles.title}>{t('newExpense')}</Text>

          <Text style={styles.subtitle}>
            {t('addFewSteps')}
          </Text>

          <View style={styles.fieldsRow}>
            <View style={styles.conceptField}>
              <Text style={styles.label}>{t('concept')}</Text>

              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder={t('conceptPlaceholder')}
                placeholderTextColor="#9CA3AF"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() =>
                  amountInputRef.current?.focus()
                }
              />
            </View>

            <View style={styles.amountField}>
              <Text style={styles.label}>{t('amount')}</Text>

              <View style={styles.amountInputContainer}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.currencyButton}
                  onPress={() => setCurrencyPickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar divisa del gasto"
                >
                  <Text style={styles.currencySymbol}>
                    {currencyInfo(expenseCurrency).symbol}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={13}
                    color="#6B7280"
                  />
                </TouchableOpacity>

                <TextInput
                  ref={amountInputRef}
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0,00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('date')}</Text>

          <View style={styles.dateOptions}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                styles.dateOption,
                dateMode === 'today' &&
                  styles.dateOptionActive,
              ]}
              onPress={chooseToday}
            >
              <Text
                style={[
                  styles.dateOptionText,
                  dateMode === 'today' &&
                    styles.dateOptionTextActive,
                ]}
              >
                {t('today')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                styles.dateOption,
                dateMode === 'yesterday' &&
                  styles.dateOptionActive,
              ]}
              onPress={chooseYesterday}
            >
              <Text
                style={[
                  styles.dateOptionText,
                  dateMode === 'yesterday' &&
                    styles.dateOptionTextActive,
                ]}
              >
                {t('yesterday')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                styles.dateOption,
                dateMode === 'other' &&
                  styles.dateOptionActive,
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text
                style={[
                  styles.dateOptionText,
                  dateMode === 'other' &&
                    styles.dateOptionTextActive,
                ]}
                numberOfLines={1}
              >
                {dateMode === 'other'
                  ? formatDate(transactionDate, locale)
                  : t('anotherDay')}
              </Text>
            </TouchableOpacity>
          </View>

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

          {planned && (
            <View style={styles.plannedBanner}>
              <Ionicons
                name="time-outline"
                size={20}
                color="#C2410C"
              />

              <View style={styles.plannedTextContainer}>
                <Text style={styles.plannedTitle}>
                  {t('plannedExpense')}
                </Text>

                <Text style={styles.plannedText}>
                  {t('plannedPending')}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.categoryHeading}>
            <Text style={styles.sectionLabel}>{t('category')}</Text>

            {classifying && (
              <View style={styles.classifying}>
                <ActivityIndicator
                  size="small"
                  color="#6366F1"
                />
                <Text style={styles.classifyingText}>
                  {t('searching')}
                </Text>
              </View>
            )}
          </View>

          {selectedCategory && (
            <View
              style={[
                styles.selectedCategory,
                {
                  borderColor: `${selectedCategory.color}50`,
                  backgroundColor: `${selectedCategory.color}0D`,
                },
              ]}
            >
              <View
                style={[
                  styles.selectedCategoryIcon,
                  {
                    backgroundColor: `${selectedCategory.color}20`,
                  },
                ]}
              >
                <Ionicons
                  name={selectedCategory.icon as any}
                  size={23}
                  color={selectedCategory.color}
                />
              </View>

              <View style={styles.selectedCategoryText}>
                <Text style={styles.selectedCategoryLabel}>
                  {t('selected')}
                </Text>
                <Text style={styles.selectedCategoryName}>
                  {selectedCategory.name}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setCategoryPickerVisible(true)}
              >
                <Text style={styles.changeCategory}>{t('change')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {suggestedCategories.length > 0 && (
            <View style={styles.suggestionsSection}>
              <View style={styles.suggestionsHeader}>
                <Text style={styles.suggestionsTitle}>
                  {t('suggested')}
                </Text>
              </View>

              <View style={styles.suggestionsList}>
                {suggestedCategories.map((category) => {
                  if (!category) {
                    return null;
                  }

                  const selected =
                    category.id === categoryId;

                  return (
                    <TouchableOpacity
                      key={category.id}
                      activeOpacity={0.75}
                      style={[
                        styles.suggestionCard,
                        selected && {
                          borderColor: category.color,
                          backgroundColor: `${category.color}10`,
                        },
                      ]}
                      onPress={() => setCategoryId(category.id)}
                    >
                      <View
                        style={[
                          styles.suggestionIcon,
                          {
                            backgroundColor: `${category.color}18`,
                          },
                        ]}
                      >
                        <Ionicons
                          name={category.icon as any}
                          size={20}
                          color={category.color}
                        />
                      </View>

                      <Text
                        style={styles.suggestionText}
                        numberOfLines={2}
                      >
                        {category.name}
                      </Text>

                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={category.color}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.allCategoriesButton}
            onPress={() => setCategoryPickerVisible(true)}
          >
            <View style={styles.allCategoriesIcon}>
              <Ionicons
                name="grid-outline"
                size={20}
                color="#4F46E5"
              />
            </View>

            <Text style={styles.allCategoriesText}>
              {selectedCategory
                ? t('viewAllCategories')
                : t('chooseCategory')}
            </Text>

            <Ionicons
              name="chevron-forward"
              size={19}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </ScrollView>

        {categoryId && (
          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.saveButton,
                saving && styles.saveButtonDisabled,
              ]}
              disabled={saving}
              onPress={() => void handleSave()}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={21}
                    color="#FFFFFF"
                  />
                  <Text style={styles.saveButtonText}>
                    {planned
                      ? t('savePlannedExpense')
                      : t('saveExpense')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <CategoryPickerModal
        visible={categoryPickerVisible}
        selectedCategoryId={categoryId}
        onSelect={setCategoryId}
        onClose={() => setCategoryPickerVisible(false)}
      />

      <CurrencyPickerModal
        visible={currencyPickerVisible}
        title={t('expenseCurrency')}
        selected={expenseCurrency}
        onSelect={setExpenseCurrency}
        onClose={() => setCurrencyPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  keyboardView: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },

  contentWithFooter: {
    paddingBottom: 110,
  },

  topBar: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  modeRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    padding: 4,
    borderRadius: 13,
    backgroundColor: '#E5E7EB',
  },

  modeActive: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
  },

  modeInactive: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },

  modeActiveText: { color: '#FFFFFF', fontWeight: '700' },
  modeInactiveText: { color: '#4B5563', fontWeight: '700' },

  title: {
    marginTop: 12,
    fontSize: 30,
    fontWeight: '700',
    color: '#111827',
  },

  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: '#6B7280',
  },

  fieldsRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },

  conceptField: {
    flex: 1.35,
  },

  amountField: {
    flex: 1.15,
  },

  label: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },

  input: {
    height: 58,
    paddingHorizontal: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#111827',
  },

  amountInputContainer: {
    height: 58,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },

  currencySymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },

  currencyButton: {
    minWidth: 36,
    minHeight: 40,
    marginRight: 2,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },

  amountInput: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },

  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },

  dateOptions: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#E9ECF1',
    flexDirection: 'row',
    gap: 4,
  },

  dateOption: {
    flex: 1,
    minHeight: 43,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dateOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 2,
  },

  dateOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },

  dateOptionTextActive: {
    color: '#111827',
    fontWeight: '700',
  },

  plannedBanner: {
    marginTop: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    flexDirection: 'row',
    gap: 10,
  },

  plannedTextContainer: {
    flex: 1,
  },

  plannedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9A3412',
  },

  plannedText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: '#C2410C',
  },

  categoryHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  classifying: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  classifyingText: {
    fontSize: 11,
    color: '#6366F1',
  },

  selectedCategory: {
    minHeight: 68,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  selectedCategoryIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedCategoryText: {
    flex: 1,
  },

  selectedCategoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },

  selectedCategoryName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  changeCategory: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },

  suggestionsSection: {
    marginTop: 16,
  },

  suggestionsHeader: {
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  suggestionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },

  suggestionsList: {
    flexDirection: 'row',
    gap: 8,
  },

  suggestionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 82,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  suggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  suggestionText: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#374151',
  },

  allCategoriesButton: {
    marginTop: 14,
    minHeight: 58,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  allCategoriesIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  allCategoriesText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F6F7F9F5',
  },

  saveButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  saveButtonDisabled: {
    opacity: 0.55,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
