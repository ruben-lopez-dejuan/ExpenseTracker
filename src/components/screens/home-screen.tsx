import DateTimePicker from '@expo/ui/community/datetime-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ExpenseDonut from '../expense-donut';
import ExpenseEditorModal from '../expense-editor-modal';

import {
  formatCurrencyAmount,
  useAppSettings,
} from '../../context/app-settings-context';
import {
  Category,
  useCategories,
} from '../../context/categories-context';
import {
  Expense,
  useExpenses,
} from '../../context/expenses-context';
import {
  SummaryPeriod,
  usePreferences,
} from '../../context/preferences-context';
import { useAppStyles } from '../../lib/themed-styles';
import { sumConvertedAmounts } from '../../lib/currency';
import {
  addLocalDays,
  getCalendarPeriodRange,
} from '../../lib/periods';

type HomeScreenProps = {
  onAddExpense: (initialDate: Date) => void;
  onOpenSettings: () => void;
};

const periodOptions: {
  labelKey: 'day' | 'week' | 'month' | 'year';
  value: SummaryPeriod;
}[] = [
  { labelKey: 'day', value: 'day' },
  { labelKey: 'week', value: 'week' },
  { labelKey: 'month', value: 'month' },
  { labelKey: 'year', value: 'year' },
];

function formatRange(
  start: Date,
  endExclusive: Date,
  locale: string
) {
  const end =
    addLocalDays(endExclusive, -1);

  if (
    start.getTime() ===
    end.getTime()
  ) {
    return new Intl.DateTimeFormat(
      locale,
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    ).format(start);
  }

  return `${new Intl.DateTimeFormat(
    locale,
    {
      day: 'numeric',
      month: 'short',
    }
  ).format(start)} – ${new Intl.DateTimeFormat(
    locale,
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }
  ).format(end)}`;
}


type CategoryBreakdown = Category & {
  value: number;
  expenses: Expense[];
};
export default function HomeScreen({
  onAddExpense,
  onOpenSettings,
}: HomeScreenProps) {
  const styles = useAppStyles(lightStyles);
  const { expenses } = useExpenses();
  const {
    convertAmount,
    displayCurrency,
    formatMoney,
    isDark,
    locale,
    t,
  } = useAppSettings();

  const {
    categories,
  } = useCategories();

  const {
    summaryPeriod,
    customStartDate,
    customEndDate,
    setSummaryPeriod,
    setCustomPeriod,
  } = usePreferences();

  const [anchorDate, setAnchorDate] =
    useState(new Date());
  const [dayPickerVisible, setDayPickerVisible] = useState(false);

  const [
    customModalVisible,
    setCustomModalVisible,
  ] = useState(false);

  const [
    customStart,
    setCustomStart,
  ] = useState(
    customStartDate ??
      new Date()
  );

  const [
    customEnd,
    setCustomEnd,
  ] = useState(
    customEndDate ??
      new Date()
  );

  const [
    choosingStart,
    setChoosingStart,
  ] = useState(false);

  const [
    choosingEnd,
    setChoosingEnd,
  ] = useState(false);

  const [
    selectedCategory,
    setSelectedCategory,
  ] =
    useState<CategoryBreakdown | null>(null);

  const [
    editingExpense,
    setEditingExpense,
  ] =
    useState<Expense | null>(
      null
    );

  const range = getCalendarPeriodRange(
    summaryPeriod,
    anchorDate,
    customStartDate,
    customEndDate
  );

  const periodExpenses =
    expenses.filter(
      (expense) =>
        expense.status ===
          'completed' &&
        expense.transactionDate.getTime() >=
          range.start.getTime() &&
        expense.transactionDate.getTime() <
          range.end.getTime()
    );

  const total = sumConvertedAmounts(
    periodExpenses,
    (expense) => convertAmount(expense.amount, expense.currency)
  );

  const breakdown = total === null
    ? []
    : categories
      .map((category) => {
        const categoryExpenses =
          periodExpenses.filter(
            (expense) =>
              expense.categoryId ===
              category.id
          );

        return {
          ...category,
          expenses:
            categoryExpenses,
          value:
            sumConvertedAmounts(
              categoryExpenses,
              (expense) => convertAmount(expense.amount, expense.currency)
            ) ?? 0,
        };
      })
      .filter(
        (category) =>
          category.value > 0
      )
      .sort(
        (a, b) =>
          b.value -
          a.value
      );

  function movePeriod(
    direction: number
  ) {
    if (
      summaryPeriod ===
      'custom'
    ) {
      return;
    }

    const next =
      new Date(anchorDate);

    if (
      summaryPeriod ===
      'day'
    ) {
      next.setDate(
        next.getDate() +
          direction
      );
    }

    if (
      summaryPeriod ===
      'week'
    ) {
      next.setDate(
        next.getDate() +
          7 * direction
      );
    }

    if (
      summaryPeriod ===
      'month'
    ) {
      next.setMonth(
        next.getMonth() +
          direction
      );
    }

    if (
      summaryPeriod ===
      'year'
    ) {
      next.setFullYear(
        next.getFullYear() +
          direction
      );
    }

    setAnchorDate(next);
  }

  function openExpense(
    expense: Expense
  ) {
    setSelectedCategory(null);
    setEditingExpense(expense);
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={
          styles.container
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={styles.header}
        >
          <Text
            style={styles.title}
          >
            {t('summary')}
          </Text>
          <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
            <Ionicons name="settings-outline" size={22} color={isDark ? '#F9FAFB' : '#374151'} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.periodSelector
          }
        >
          {periodOptions.map(
            (option) => (
              <TouchableOpacity
                key={
                  option.value
                }
                style={[
                  styles.periodButton,
                  summaryPeriod ===
                    option.value &&
                    styles.periodButtonActive,
                ]}
                onPress={() => {
                  setAnchorDate(
                    new Date()
                  );

                  void setSummaryPeriod(
                    option.value
                  );
                }}
              >
                <Text
                  style={[
                    styles.periodText,
                    summaryPeriod ===
                      option.value &&
                      styles.periodTextActive,
                  ]}
                >
                  {
                    t(option.labelKey)
                  }
                </Text>
              </TouchableOpacity>
            )
          )}

          <TouchableOpacity
            style={[
              styles.periodButton,
              summaryPeriod ===
                'custom' &&
                styles.periodButtonActive,
            ]}
            onPress={() =>
              setCustomModalVisible(
                true
              )
            }
          >
            <Text
              style={[
                styles.periodText,
                summaryPeriod ===
                  'custom' &&
                  styles.periodTextActive,
              ]}
            >
              {t('custom')}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View
          style={
            styles.rangeNavigator
          }
        >
          {summaryPeriod !==
            'custom' && (
            <TouchableOpacity
              style={
                styles.arrowButton
              }
              onPress={() =>
                movePeriod(-1)
              }
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={isDark ? '#F9FAFB' : '#111827'}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            disabled={summaryPeriod !== 'day'}
            onPress={() => setDayPickerVisible(true)}
            accessibilityRole={summaryPeriod === 'day' ? 'button' : undefined}
          >
          <Text style={styles.rangeText}>
            {formatRange(
              range.start,
              range.end,
              locale
            )}
          </Text>
          </TouchableOpacity>

          {summaryPeriod !==
            'custom' && (
            <TouchableOpacity
              style={
                styles.arrowButton
              }
              onPress={() =>
                movePeriod(1)
              }
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={isDark ? '#F9FAFB' : '#111827'}
              />
            </TouchableOpacity>
          )}
        </View>

        <View
          style={
            styles.chartCard
          }
        >
          <ExpenseDonut
            total={total}
            currency={displayCurrency}
            items={breakdown.map(
              (item) => ({
                value:
                  item.value,
                color:
                  item.color,
              })
            )}
          />

          <Text
            style={
              styles.periodTotalLabel
            }
          >
            {total === null ? t('rateUpdateError') : t('totalPeriod')}
          </Text>
        </View>

        <Text
          style={
            styles.sectionTitle
          }
        >
          {t('categories')}
        </Text>

        <View
          style={
            styles.categoryGrid
          }
        >
          {breakdown.map(
            (item) => {
              const percentage =
                total !== null && total > 0
                  ? (item.value /
                      total) *
                    100
                  : 0;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={
                    styles.categoryCard
                  }
                  onPress={() =>
                    setSelectedCategory(
                      item
                    )
                  }
                >
                  <View
                    style={[
                      styles.categoryIcon,
                      {
                        backgroundColor:
                          `${item.color}20`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.icon as any
                      }
                      size={28}
                      color={
                        item.color
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.categoryInfo
                    }
                  >
                    <Text
                      style={
                        styles.categoryName
                      }
                    >
                      {
                        item.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.categoryAmount
                      }
                    >
                      {formatMoney(
                        item.value,
                        displayCurrency
                      )}
                    </Text>

                    <Text
                      style={
                        styles.categoryPercentage
                      }
                    >
                      {percentage.toFixed(
                        1
                      )}
                      %
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              );
            }
          )}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onAddExpense(range.start)}
        >
          <Text
            style={
              styles.addButtonText
            }
          >
            ＋ {t('addExpense')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {dayPickerVisible && (
        <DateTimePicker
          value={anchorDate}
          mode="date"
          presentation="dialog"
          onValueChange={(_event, value) => {
            setAnchorDate(value);
            setDayPickerVisible(false);
          }}
          onDismiss={() => setDayPickerVisible(false)}
        />
      )}

      <Modal
        visible={
          customModalVisible
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setCustomModalVisible(
            false
          )
        }
      >
        <SafeAreaView
          style={styles.modalSafe}
        >
          <View
            style={
              styles.modalContent
            }
          >
            <Text
              style={
                styles.modalTitle
              }
            >
              {t('customPeriod')}
            </Text>

            <Text style={styles.label}>
              {t('from')}
            </Text>

            <TouchableOpacity
              style={styles.input}
              onPress={() =>
                setChoosingStart(
                  true
                )
              }
            >
              <Text>
                {customStart.toLocaleDateString(
                  locale
                )}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>
              {t('to')}
            </Text>

            <TouchableOpacity
              style={styles.input}
              onPress={() =>
                setChoosingEnd(
                  true
                )
              }
            >
              <Text>
                {customEnd.toLocaleDateString(
                  locale
                )}
              </Text>
            </TouchableOpacity>

            {choosingStart && (
              <DateTimePicker
                value={customStart}
                mode="date"
                presentation="dialog"
                onValueChange={(
                  _event,
                  value
                ) => {
                  setCustomStart(
                    value
                  );
                  setChoosingStart(
                    false
                  );
                }}
                onDismiss={() =>
                  setChoosingStart(
                    false
                  )
                }
              />
            )}

            {choosingEnd && (
              <DateTimePicker
                value={customEnd}
                mode="date"
                presentation="dialog"
                onValueChange={(
                  _event,
                  value
                ) => {
                  setCustomEnd(
                    value
                  );
                  setChoosingEnd(
                    false
                  );
                }}
                onDismiss={() =>
                  setChoosingEnd(
                    false
                  )
                }
              />
            )}

            <TouchableOpacity
              style={
                styles.saveButton
              }
              onPress={async () => {
                if (
                  customEnd.getTime() <
                  customStart.getTime()
                ) {
                  Alert.alert(
                    'Periodo incorrecto',
                    'La fecha final debe ser posterior a la inicial.'
                  );
                  return;
                }

                await setCustomPeriod(
                  customStart,
                  customEnd
                );

                setCustomModalVisible(
                  false
                );
              }}
            >
              <Text
                style={
                  styles.saveButtonText
                }
              >
                {t('apply')}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={
          selectedCategory !==
          null
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setSelectedCategory(
            null
          )
        }
      >
        <SafeAreaView
          style={styles.modalSafe}
        >
          <ScrollView
            contentContainerStyle={
              styles.modalContent
            }
          >
            {selectedCategory && (
              <>
                <View
                  style={
                    styles.categoryDetailHeader
                  }
                >
                  <View
                    style={[
                      styles.categoryIconLarge,
                      {
                        backgroundColor:
                          `${selectedCategory.color}20`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        selectedCategory.icon as any
                      }
                      size={34}
                      color={
                        selectedCategory.color
                      }
                    />
                  </View>

                  <View>
                    <Text
                      style={
                        styles.modalTitle
                      }
                    >
                      {
                        selectedCategory.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.categoryDetailTotal
                      }
                    >
                      {formatMoney(
                        selectedCategory.value,
                        displayCurrency
                      )}
                    </Text>
                  </View>
                </View>

                {selectedCategory.expenses.map(
                  (expense) => (
                    <TouchableOpacity
                      key={
                        expense.id
                      }
                      style={
                        styles.expenseRow
                      }
                      onPress={() =>
                        openExpense(
                          expense
                        )
                      }
                    >
                      <View
                        style={{
                          flex: 1,
                        }}
                      >
                        <Text
                          style={
                            styles.expenseName
                          }
                        >
                          {
                            expense.description
                          }
                        </Text>

                        <Text
                          style={
                            styles.expenseDate
                          }
                        >
                          {expense.transactionDate.toLocaleDateString(
                  locale
                          )}
                        </Text>
                      </View>

                      <View style={styles.expenseAmountGroup}>
                        <Text style={styles.expenseAmount}>
                          {formatMoney(
                            expense.amount,
                            expense.currency
                          )}
                        </Text>
                        {expense.currency !== displayCurrency && (
                          <Text style={styles.expenseOriginalAmount}>
                            {formatCurrencyAmount(
                              expense.amount,
                              expense.currency,
                              locale
                            )}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                )}

                <TouchableOpacity
                  style={
                    styles.closeButton
                  }
                  onPress={() =>
                    setSelectedCategory(
                      null
                    )
                  }
                >
                  <Text>
                    {t('close')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ExpenseEditorModal
        expense={editingExpense}
        onClose={() =>
          setEditingExpense(null)
        }
      />
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  container: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  header: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111827',
  },

  periodSelector: {
    marginTop: 22,
    gap: 8,
  },

  periodButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
  },

  periodButtonActive: {
    backgroundColor: '#111827',
  },

  periodText: {
    fontSize: 13,
    color: '#6B7280',
  },

  periodTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  rangeNavigator: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rangeText: {
    flex: 1,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  chartCard: {
    marginTop: 18,
    padding: 20,
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },

  periodTotalLabel: {
    marginTop: 8,
    fontSize: 13,
    color: '#9CA3AF',
  },

  sectionTitle: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  categoryGrid: {
    gap: 10,
  },

  categoryCard: {
    minHeight: 92,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  categoryIcon: {
    width: 58,
    height: 58,
    marginRight: 15,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryInfo: {
    flex: 1,
  },

  categoryName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },

  categoryAmount: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  categoryPercentage: {
    marginTop: 2,
    fontSize: 12,
    color: '#9CA3AF',
  },

  addButton: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#111827',
  },

  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  modalSafe: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  modalContent: {
    padding: 22,
    paddingBottom: 60,
  },

  modalTitle: {
    fontSize: 27,
    fontWeight: '700',
    color: '#111827',
  },

  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  input: {
    minHeight: 52,
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    color: '#111827',
  },

  saveButton: {
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#111827',
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  deleteButton: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },

  deleteText: {
    color: '#DC2626',
    fontWeight: '600',
  },

  categoryDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },

  categoryIconLarge: {
    width: 70,
    height: 70,
    marginRight: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryDetailTotal: {
    marginTop: 5,
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },

  expenseRow: {
    marginBottom: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },

  expenseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  expenseDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#9CA3AF',
  },

  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseAmountGroup: {
    alignItems: 'flex-end',
  },
  expenseOriginalAmount: {
    marginTop: 3,
    fontSize: 11,
    color: '#9CA3AF',
  },

  closeButton: {
    marginTop: 20,
    paddingVertical: 15,
    alignItems: 'center',
  },

  editCategoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  editCategoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
});
