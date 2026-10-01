import DateTimePicker from '@expo/ui/community/datetime-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CategoryPickerModal from '../category-picker-modal';
import CurrencyPickerModal from '../currency-picker-modal';
import ExpenseEditorModal from '../expense-editor-modal';
import IncomeEditorModal from '../income-editor-modal';
import SettingsButton from '../settings-button';
import { CurrencyCode, currencyInfo, formatCurrencyAmount, useAppSettings } from '../../context/app-settings-context';
import { Category, useCategories } from '../../context/categories-context';
import { Expense, useExpenses } from '../../context/expenses-context';
import { useFeedback } from '../../context/feedback-context';
import { Budget, Income, RecurringFrequency, RecurringKind, RecurringTransaction, useFinance } from '../../context/finance-context';
import { recurringDatesBetween } from '../../lib/recurring-dates';
import { sumConvertedAmounts } from '../../lib/currency';
import { useAppStyles } from '../../lib/themed-styles';

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatMonth(date: Date, locale: string) {
  const value = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

const frequencyLabelKeys: Record<RecurringFrequency, 'weekly' | 'monthly' | 'yearly'> = {
  weekly: 'weekly', monthly: 'monthly', yearly: 'yearly',
};

type UpcomingMovement = {
  id: string;
  kind: 'expense' | 'income';
  description: string;
  amount: number;
  currency: CurrencyCode;
  date: Date;
  categoryId: string | null;
  recurring: boolean;
  recurringId: string | null;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function PlanningScreen({ onAddIncome, onOpenSettings }: { onAddIncome: () => void; onOpenSettings: () => void }) {
  const styles = useAppStyles(lightStyles);
  const { expenses } = useExpenses();
  const { categories, getCategoryById } = useCategories();
  const {
    incomes, budgets, recurring, setupRequired,
    saveBudget, updateBudget, deleteBudget, addRecurring, updateRecurring, toggleRecurring, deleteRecurring,
  } = useFinance();
  const { convertAmount, displayCurrency, formatMoney, locale, t } = useAppSettings();
  const [anchor, setAnchor] = useState(monthStart(new Date()));
  const [budgetVisible, setBudgetVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [recurringVisible, setRecurringVisible] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [upcomingVisible, setUpcomingVisible] = useState(false);

  const monthExpenses = expenses.filter(
    (item) => item.transactionDate >= monthStart(anchor) && item.transactionDate < monthEnd(anchor)
  );
  const monthIncomes = incomes.filter(
    (item) => item.transactionDate >= monthStart(anchor) && item.transactionDate < monthEnd(anchor)
  );
  const persistedRecurringKeys = useMemo(() => new Set([
    ...expenses.filter((item) => item.recurringId).map((item) => `${item.recurringId}:${dateKey(item.transactionDate)}`),
    ...incomes.filter((item) => item.recurringId).map((item) => `${item.recurringId}:${dateKey(item.transactionDate)}`),
  ]), [expenses, incomes]);
  const projectedMonth = useMemo<UpcomingMovement[]>(() => recurring
    .filter((rule) => rule.active)
    .flatMap((rule) => recurringDatesBetween(
      rule.nextRunDate,
      rule.frequency,
      monthStart(anchor),
      monthEnd(anchor)
    ).filter((date) => !persistedRecurringKeys.has(`${rule.id}:${dateKey(date)}`)).map((date) => ({
      id: `projection-${rule.id}-${dateKey(date)}`,
      kind: rule.kind,
      description: rule.description,
      amount: rule.amount,
      currency: rule.currency,
      date,
      categoryId: rule.categoryId,
      recurring: true,
      recurringId: rule.id,
    }))), [anchor, persistedRecurringKeys, recurring]);
  const projectedMonthExpenses = projectedMonth.filter((item) => item.kind === 'expense');
  const expenseTotal = sumConvertedAmounts(
    [...monthExpenses, ...projectedMonthExpenses],
    (item) => convertAmount(item.amount, item.currency)
  );
  const incomeTotal = sumConvertedAmounts(
    [...monthIncomes, ...projectedMonth.filter((item) => item.kind === 'income')],
    (item) => convertAmount(item.amount, item.currency)
  );
  const balance = incomeTotal === null || expenseTotal === null
    ? null
    : incomeTotal - expenseTotal;
  const savingsRate = balance === null || incomeTotal === null
    ? null
    : incomeTotal > 0 ? (balance / incomeTotal) * 100 : 0;
  const monthBudgets = budgets.filter((item) => sameMonth(item.monthStart, anchor));
  const recentIncomes = [...incomes].sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()).slice(0, 4);
  const upcoming = useMemo<UpcomingMovement[]>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const horizon = new Date(start);
    horizon.setFullYear(horizon.getFullYear() + 1);
    horizon.setDate(horizon.getDate() + 1);
    const plannedExpenses = expenses.filter((item) => item.status === 'planned');
    const plannedIncomes = incomes.filter((item) => item.status === 'planned');
    const projected = recurring
      .filter((rule) => rule.active)
      .flatMap((rule) => recurringDatesBetween(rule.nextRunDate, rule.frequency, start, horizon)
        .filter((date) => !persistedRecurringKeys.has(`${rule.id}:${dateKey(date)}`))
        .map((date) => ({
          id: `projection-${rule.id}-${dateKey(date)}`,
          kind: rule.kind,
          description: rule.description,
          amount: rule.amount,
          currency: rule.currency,
          date,
          categoryId: rule.categoryId,
          recurring: true,
          recurringId: rule.id,
        })));

    return [
    ...plannedExpenses.map((item) => ({
      id: item.id, kind: 'expense' as const, description: item.description,
      amount: item.amount, currency: item.currency, date: item.transactionDate,
      categoryId: item.categoryId, recurring: item.source === 'recurring', recurringId: item.recurringId,
    })),
    ...plannedIncomes.map((item) => ({
      id: item.id, kind: 'income' as const, description: item.description,
      amount: item.amount, currency: item.currency, date: item.transactionDate,
      categoryId: null, recurring: item.source === 'recurring', recurringId: item.recurringId,
    })),
    ...projected,
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [expenses, incomes, persistedRecurringKeys, recurring]);

  const budgetRows = useMemo(() => monthBudgets.map((budget) => {
    const spent = sumConvertedAmounts(
      [...monthExpenses, ...projectedMonthExpenses]
        .filter((expense) => budget.categoryId === null || expense.categoryId === budget.categoryId),
      (expense) => convertAmount(expense.amount, expense.currency)
    );
    const limit = convertAmount(budget.amount, budget.currency);
    const ratio = spent === null || limit === null ? null : limit > 0 ? spent / limit : 0;
    return { budget, spent, limit, ratio };
  }), [monthBudgets, monthExpenses, projectedMonthExpenses, convertAmount]);

  const formatAggregate = (value: number | null) =>
    value === null ? '—' : formatMoney(value, displayCurrency);

  function editUpcomingMovement(movement: UpcomingMovement) {
    setUpcomingVisible(false);
    if (movement.id.startsWith('projection-') && movement.recurringId) {
      const rule = recurring.find((item) => item.id === movement.recurringId);
      if (rule) {
        setEditingRecurring(rule);
        setRecurringVisible(true);
        return;
      }
    }
    if (movement.kind === 'expense') {
      setEditingExpense(expenses.find((item) => item.id === movement.id) ?? null);
    } else {
      setEditingIncome(incomes.find((item) => item.id === movement.id) ?? null);
    }
  }

  function editIncomeMovement(income: Income) {
    setEditingIncome(income);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <View style={styles.flex}>
            <Text style={styles.title}>{t('planning')}</Text>
            <Text style={styles.subtitle}>{t('planningSubtitle')}</Text>
          </View>
          <SettingsButton onPress={onOpenSettings} />
        </View>

        {setupRequired && (
          <View style={styles.setupCard}>
            <Ionicons name="construct-outline" size={23} color="#92400E" />
            <View style={styles.flex}>
              <Text style={styles.setupTitle}>{t('setupMissing')}</Text>
              <Text style={styles.setupText}>{t('setupPlanning')}</Text>
            </View>
          </View>
        )}

        {(expenseTotal === null || incomeTotal === null) && (
          <View style={styles.setupCard}>
            <Ionicons name="alert-circle-outline" size={23} color="#92400E" />
            <Text style={styles.setupText}>{t('rateUpdateError')}</Text>
          </View>
        )}

        <View style={styles.monthNavigator}>
          <TouchableOpacity onPress={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>
            <Ionicons name="chevron-back" size={22} color="#4F46E5" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{formatMonth(anchor, locale)}</Text>
          <TouchableOpacity onPress={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>
            <Ionicons name="chevron-forward" size={22} color="#4F46E5" />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('monthBalance')}</Text>
          <Text style={[styles.balanceAmount, balance !== null && balance < 0 && styles.negative]}>{formatAggregate(balance)}</Text>
          <View style={styles.balanceDetails}>
            <View><Text style={styles.detailLabel}>{t('incomes')}</Text><Text style={styles.incomeText}>{formatAggregate(incomeTotal)}</Text></View>
            <View><Text style={styles.detailLabel}>{t('totalExpenses')}</Text><Text style={styles.expenseText}>{formatAggregate(expenseTotal)}</Text></View>
            <View><Text style={styles.detailLabel}>{t('savings')}</Text><Text style={styles.detailValue}>{savingsRate === null ? '—' : `${Math.round(savingsRate)}%`}</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>{t('upcomingMovements')}</Text><Text style={styles.sectionHint}>{t('upcoming12Months')}</Text></View>
          {upcoming.length > 0 && <TouchableOpacity style={styles.viewAllButton} onPress={() => setUpcomingVisible(true)}><Text style={styles.viewAllText}>{t('viewAll')} ({upcoming.length})</Text><Ionicons name="chevron-forward" size={17} color="#4F46E5" /></TouchableOpacity>}
        </View>
        {upcoming.length === 0 ? <EmptyCard icon="calendar-outline" text={t('noUpcoming')} /> : upcoming.slice(0, 3).map((item) => {
          const category = item.categoryId ? getCategoryById(item.categoryId) : null;
          return <TouchableOpacity key={`${item.kind}-${item.id}`} activeOpacity={0.75} style={styles.listCard} onPress={() => editUpcomingMovement(item)}>
            <View style={[styles.iconBox, { backgroundColor: item.kind === 'income' ? '#ECFDF5' : `${category?.color ?? '#4F46E5'}18` }]}><Ionicons name={item.kind === 'income' ? 'arrow-down' : (category?.icon ?? 'arrow-up') as any} size={21} color={item.kind === 'income' ? '#059669' : category?.color ?? '#4F46E5'} /></View>
            <View style={styles.flex}><Text style={styles.cardTitle}>{item.description || (item.kind === 'income' ? t('income') : category?.name ?? t('expense'))}</Text><Text style={styles.cardMeta}>{formatDate(item.date, locale)}{item.recurring ? ` · ${t('recurring')}` : ` · ${t('planned')}`}</Text></View>
            <Text style={[styles.cardAmount, item.kind === 'income' ? styles.incomeText : styles.upcomingExpense]}>{item.kind === 'income' ? '+' : '−'}{formatCurrencyAmount(item.amount, item.currency, locale)}</Text>
          </TouchableOpacity>;
        })}

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>{t('budgets')}</Text><Text style={styles.sectionHint}>{t('monthLimits')}</Text></View>
          <TouchableOpacity style={styles.smallAdd} onPress={() => { setEditingBudget(null); setBudgetVisible(true); }} disabled={setupRequired}>
            <Ionicons name="add" size={21} color="#FFFFFF" /><Text style={styles.smallAddText}>{t('addAction')}</Text>
          </TouchableOpacity>
        </View>
        {budgetRows.length === 0 ? (
          <EmptyCard icon="speedometer-outline" text={t('createBudgetHint')} />
        ) : budgetRows.map(({ budget, spent, limit, ratio }) => {
          const category = budget.categoryId ? getCategoryById(budget.categoryId) : null;
          const color = ratio === null ? '#9CA3AF' : ratio >= 1 ? '#DC2626' : ratio >= 0.8 ? '#D97706' : category?.color ?? '#4F46E5';
          return (
            <TouchableOpacity key={budget.id} activeOpacity={0.75} style={styles.listCard} onPress={() => { setEditingBudget(budget); setBudgetVisible(true); }}>
              <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}><Ionicons name={(category?.icon ?? 'pie-chart-outline') as any} size={21} color={color} /></View>
              <View style={styles.flex}>
                <View style={styles.rowBetween}><Text style={styles.cardTitle}>{category?.name ?? t('totalBudget')}</Text><Text style={styles.cardAmount}>{formatAggregate(spent)} / {formatAggregate(limit)}</Text></View>
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${ratio === null ? 0 : Math.min(ratio * 100, 100)}%`, backgroundColor: color }]} /></View>
                <Text style={[styles.progressText, { color }]}>{ratio === null ? t('rateUpdateError') : `${Math.round(ratio * 100)}% ${t('used')} · ${t('tapToEdit')}`}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>{t('recurringPlural')}</Text><Text style={styles.sectionHint}>{t('recurringForecast')}</Text></View>
          <TouchableOpacity style={styles.smallAdd} onPress={() => setRecurringVisible(true)} disabled={setupRequired}>
            <Ionicons name="add" size={21} color="#FFFFFF" /><Text style={styles.smallAddText}>{t('addAction')}</Text>
          </TouchableOpacity>
        </View>
        {recurring.length === 0 ? (
          <EmptyCard icon="repeat-outline" text={t('recurringEmpty')} />
        ) : recurring.map((item) => {
          const category = item.categoryId ? getCategoryById(item.categoryId) : null;
          const color = item.kind === 'income' ? '#059669' : category?.color ?? '#4F46E5';
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.listCard}
              onPress={() => { setEditingRecurring(item); setRecurringVisible(true); }}
            >
              <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}><Ionicons name={item.kind === 'income' ? 'arrow-down' : 'repeat-outline'} size={21} color={color} /></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{item.description || (item.kind === 'income' ? t('income') : category?.name ?? t('expense'))}</Text>
                <Text style={styles.cardMeta}>{t(frequencyLabelKeys[item.frequency])} · {t('next')} {formatDate(item.nextRunDate, locale)} · {t('tapToEdit')}</Text>
              </View>
              <View style={styles.trailing}><Text style={[styles.cardAmount, item.kind === 'income' && styles.incomeText]}>{item.kind === 'income' ? '+' : '−'}{formatCurrencyAmount(item.amount, item.currency, locale)}</Text><Switch value={item.active} onValueChange={(active) => void toggleRecurring(item.id, active)} /></View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>{t('incomes')}</Text><Text style={styles.sectionHint}>{t('recentEntries')}</Text></View>
          <TouchableOpacity style={[styles.smallAdd, styles.incomeAdd]} onPress={onAddIncome} disabled={setupRequired}>
            <Ionicons name="add" size={21} color="#FFFFFF" /><Text style={styles.smallAddText}>{t('income')}</Text>
          </TouchableOpacity>
        </View>
        {recentIncomes.length === 0 ? <EmptyCard icon="wallet-outline" text={t('addIncomeHint')} /> : recentIncomes.map((income) => (
          <TouchableOpacity key={income.id} activeOpacity={0.75} style={styles.listCard} onPress={() => editIncomeMovement(income)}>
            <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}><Ionicons name="arrow-down" size={21} color="#059669" /></View>
            <View style={styles.flex}><Text style={styles.cardTitle}>{income.description || t('income')}</Text><Text style={styles.cardMeta}>{formatDate(income.transactionDate, locale)}{income.status === 'planned' ? ` · ${t('planned')}` : ''}</Text></View>
            <Text style={[styles.cardAmount, styles.incomeText]}>+{formatCurrencyAmount(income.amount, income.currency, locale)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <BudgetModal
        visible={budgetVisible}
        month={anchor}
        categories={categories}
        editing={editingBudget}
        onClose={() => { setBudgetVisible(false); setEditingBudget(null); }}
        onSave={saveBudget}
        onUpdate={updateBudget}
        onDelete={deleteBudget}
      />
      <RecurringModal
        visible={recurringVisible}
        editing={editingRecurring}
        onClose={() => { setRecurringVisible(false); setEditingRecurring(null); }}
        onSave={addRecurring}
        onUpdate={updateRecurring}
        onDelete={deleteRecurring}
      />
      <UpcomingMovementsModal visible={upcomingVisible} movements={upcoming} onEdit={editUpcomingMovement} onClose={() => setUpcomingVisible(false)} />
      <ExpenseEditorModal expense={editingExpense} onClose={() => setEditingExpense(null)} />
      <IncomeEditorModal income={editingIncome} onClose={() => setEditingIncome(null)} />
    </SafeAreaView>
  );
}

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  const styles = useAppStyles(lightStyles);
  return <View style={styles.emptyCard}><Ionicons name={icon as any} size={23} color="#818CF8" /><Text style={styles.emptyText}>{text}</Text></View>;
}

function UpcomingMovementsModal({ visible, movements, onEdit, onClose }: {
  visible: boolean;
  movements: UpcomingMovement[];
  onEdit: (movement: UpcomingMovement) => void;
  onClose: () => void;
}) {
  const styles = useAppStyles(lightStyles);
  const { getCategoryById } = useCategories();
  const { locale, t } = useAppSettings();
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.upcomingModalHeader}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}><Ionicons name="arrow-back" size={22} color="#374151" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.modalTitle}>{t('upcomingMovements')}</Text><Text style={styles.modalHint}>{movements.length} {t('planned').toLocaleLowerCase(locale)}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.upcomingList}>
        {movements.map((item) => {
          const category = item.categoryId ? getCategoryById(item.categoryId) : null;
          const color = item.kind === 'income' ? '#059669' : category?.color ?? '#4F46E5';
          return <TouchableOpacity key={`${item.kind}-${item.id}`} activeOpacity={0.75} style={styles.listCard} onPress={() => onEdit(item)}>
            <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}><Ionicons name={item.kind === 'income' ? 'arrow-down' : (category?.icon ?? 'arrow-up') as any} size={21} color={color} /></View>
            <View style={styles.flex}><Text style={styles.cardTitle}>{item.description || (item.kind === 'income' ? t('income') : category?.name ?? t('expense'))}</Text><Text style={styles.cardMeta}>{formatDate(item.date, locale)} · {item.kind === 'income' ? t('income') : category?.name ?? t('expense')}{item.recurring ? ` · ${t('recurring')}` : ''}</Text></View>
            <Text style={[styles.cardAmount, { color }]}>{item.kind === 'income' ? '+' : '−'}{formatCurrencyAmount(item.amount, item.currency, locale)}</Text>
          </TouchableOpacity>;
        })}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function BudgetModal({ visible, month, categories, editing, onClose, onSave, onUpdate, onDelete }: {
  visible: boolean;
  month: Date;
  categories: Category[];
  editing: Budget | null;
  onClose: () => void;
  onSave: (input: { categoryId: string | null; amount: number; currency: CurrencyCode; monthStart: Date }) => Promise<void>;
  onUpdate: (id: string, input: { categoryId: string | null; amount: number; currency: CurrencyCode; monthStart: Date }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const styles = useAppStyles(lightStyles);
  const { inputCurrency, locale, t } = useAppSettings();
  const { showFeedback } = useFeedback();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(inputCurrency);
  const [selectedMonth, setSelectedMonth] = useState(monthStart(month));
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [monthPicker, setMonthPicker] = useState(false);
  const category = categories.find((item) => item.id === categoryId);

  useEffect(() => {
    if (!visible) return;
    setCategoryId(editing?.categoryId ?? null);
    setAmount(editing ? String(editing.amount).replace('.', ',') : '');
    setCurrency(editing?.currency ?? inputCurrency);
    setSelectedMonth(monthStart(editing?.monthStart ?? month));
  }, [editing, inputCurrency, month, visible]);

  async function submit() {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return showFeedback(t('invalidLimit'), 'error');
    const input = { categoryId, amount: parsed, currency, monthStart: monthStart(selectedMonth) };
    try {
      if (editing) await onUpdate(editing.id, input);
      else await onSave(input);
      onClose();
      showFeedback(editing ? t('budgetUpdated') : t('budgetSaved'));
    } catch {
      showFeedback(t('budgetSaveError'), 'error');
    }
  }

  function confirmDelete() {
    if (!editing) return;
    Alert.alert(t('deleteBudget'), t('budgetDeleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await onDelete(editing.id);
            onClose();
            showFeedback(t('budgetDeleted'));
          } catch {
            showFeedback(t('budgetDeleteError'), 'error');
          }
        },
      },
    ]);
  }

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
    <ModalHeader title={editing ? t('editBudget') : t('newBudget')} onClose={onClose} />
    <Text style={styles.modalHint}>{t('budgetEditorHint')} {formatMonth(selectedMonth, locale)}.</Text>
    <Text style={styles.label}>{t('scope')}</Text>
    <TouchableOpacity style={styles.selector} onPress={() => setCategoryPicker(true)}><Text style={styles.selectorText}>{category?.name ?? t('allMonthlySpend')}</Text><Ionicons name="chevron-down" size={18} color="#6B7280" /></TouchableOpacity>
    <Text style={styles.label}>{t('limit')}</Text>
    <View style={styles.amountEditor}><TouchableOpacity onPress={() => setCurrencyPicker(true)}><Text style={styles.currencyEditor}>{currencyInfo(currency).symbol}</Text></TouchableOpacity><TextInput style={styles.modalInput} value={amount} onChangeText={setAmount} placeholder="0,00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" /></View>
    <Text style={styles.label}>{t('budgetMonth')}</Text>
    <TouchableOpacity style={styles.selector} onPress={() => setMonthPicker(true)}><Text style={styles.selectorText}>{formatMonth(selectedMonth, locale)}</Text><Ionicons name="calendar-outline" size={18} color="#6B7280" /></TouchableOpacity>
    <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()}><Text style={styles.primaryText}>{editing ? t('saveChanges') : t('saveBudget')}</Text></TouchableOpacity>
    {editing && <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}><Text style={styles.deleteText}>{t('deleteBudget')}</Text></TouchableOpacity>}
  </ScrollView>
  <CategoryPickerModal visible={categoryPicker} selectedCategoryId={categoryId} allowClear clearLabel={t('allMonthlySpend')} onClear={() => { setCategoryId(null); setCategoryPicker(false); }} onSelect={(id) => { setCategoryId(id); setCategoryPicker(false); }} onClose={() => setCategoryPicker(false)} />
  <CurrencyPickerModal visible={currencyPicker} selected={currency} onSelect={setCurrency} onClose={() => setCurrencyPicker(false)} />
  {monthPicker && <DateTimePicker value={selectedMonth} mode="date" presentation="dialog" onValueChange={(_event, value) => { setSelectedMonth(monthStart(value)); setMonthPicker(false); }} onDismiss={() => setMonthPicker(false)} />}
  </SafeAreaView></Modal>;
}

function RecurringModal({ visible, editing, onClose, onSave, onUpdate, onDelete }: any) {
  const styles = useAppStyles(lightStyles);
  const { inputCurrency, locale, t } = useAppSettings();
  const { getCategoryById } = useCategories();
  const { showFeedback } = useFeedback();
  const [kind, setKind] = useState<RecurringKind>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(inputCurrency);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [datePicker, setDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(editing?.kind ?? 'expense');
    setDescription(editing?.description ?? '');
    setAmount(editing ? String(editing.amount).replace('.', ',') : '');
    setCurrency(editing?.currency ?? inputCurrency);
    setFrequency(editing?.frequency ?? 'monthly');
    setCategoryId(editing?.categoryId ?? null);
    setDate(editing?.nextRunDate ? new Date(editing.nextRunDate) : new Date());
  }, [editing, inputCurrency, visible]);

  async function submit() {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return showFeedback('Introduce un importe válido.', 'error');
    if (kind === 'expense' && !categoryId) return showFeedback('Selecciona una categoría.', 'error');
    try {
      const input = { kind, categoryId: kind === 'expense' ? categoryId : null, description, amount: parsed, currency, frequency, nextRunDate: date, active: editing?.active ?? true };
      if (editing) await onUpdate(editing.id, input);
      else await onSave(input);
      setDescription(''); setAmount(''); onClose(); showFeedback(editing ? 'Recurrencia actualizada' : 'Recurrencia creada');
    } catch { showFeedback('No se pudo guardar la recurrencia.', 'error'); }
  }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modalSafe}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
    <ModalHeader title={editing ? t('editRecurring') : t('newRecurring')} onClose={onClose} />
    <View style={styles.kindRow}><TouchableOpacity style={[styles.kindChip, kind === 'expense' && styles.kindExpense]} onPress={() => setKind('expense')}><Text style={[styles.kindText, kind === 'expense' && styles.kindTextActive]}>{t('expense')}</Text></TouchableOpacity><TouchableOpacity style={[styles.kindChip, kind === 'income' && styles.kindIncome]} onPress={() => setKind('income')}><Text style={[styles.kindText, kind === 'income' && styles.kindTextActive]}>{t('income')}</Text></TouchableOpacity></View>
    <Text style={styles.label}>{t('concept')}</Text><TextInput style={styles.textInput} value={description} onChangeText={setDescription} placeholder={t('recurringPlaceholder')} placeholderTextColor="#9CA3AF" />
    <Text style={styles.label}>{t('amount')}</Text><View style={styles.amountEditor}><TouchableOpacity onPress={() => setCurrencyPicker(true)}><Text style={styles.currencyEditor}>{currencyInfo(currency).symbol}</Text></TouchableOpacity><TextInput style={styles.modalInput} value={amount} onChangeText={setAmount} placeholder="0,00" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad" /></View>
    {kind === 'expense' && <><Text style={styles.label}>{t('category')}</Text><TouchableOpacity style={styles.selector} onPress={() => setCategoryPicker(true)}><Text style={styles.selectorText}>{getCategoryById(categoryId)?.name ?? t('chooseCategory')}</Text><Ionicons name="chevron-down" size={18} color="#6B7280" /></TouchableOpacity></>}
    <Text style={styles.label}>{t('frequency')}</Text><View style={styles.frequencyRow}>{(['weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map((item) => <TouchableOpacity key={item} style={[styles.frequencyChip, frequency === item && styles.frequencyActive]} onPress={() => setFrequency(item)}><Text style={[styles.frequencyText, frequency === item && styles.frequencyTextActive]}>{t(frequencyLabelKeys[item])}</Text></TouchableOpacity>)}</View>
    <Text style={styles.label}>{t('nextDue')}</Text><TouchableOpacity style={styles.selector} onPress={() => setDatePicker(true)}><Text style={styles.selectorText}>{formatDate(date, locale)}</Text><Ionicons name="calendar-outline" size={18} color="#6B7280" /></TouchableOpacity>
    <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()}><Text style={styles.primaryText}>{editing ? t('saveChanges') : t('createRecurring')}</Text></TouchableOpacity>
    {editing && <TouchableOpacity style={styles.deleteButton} onPress={() => Alert.alert(t('deleteRecurring'), t('deleteConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: async () => { try { await onDelete(editing.id); onClose(); } catch { showFeedback(t('movementCompleteError'), 'error'); } } }])}><Text style={styles.deleteText}>{t('deleteRecurring')}</Text></TouchableOpacity>}
  </ScrollView>
  <CategoryPickerModal visible={categoryPicker} selectedCategoryId={categoryId} onSelect={(id) => { setCategoryId(id); setCategoryPicker(false); }} onClose={() => setCategoryPicker(false)} />
  <CurrencyPickerModal visible={currencyPicker} selected={currency} onSelect={setCurrency} onClose={() => setCurrencyPicker(false)} />
  {datePicker && <DateTimePicker value={date} mode="date" presentation="dialog" onValueChange={(_event, value) => { setDate(value); setDatePicker(false); }} onDismiss={() => setDatePicker(false)} />}
  </SafeAreaView></Modal>;
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const styles = useAppStyles(lightStyles);
  return <View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><TouchableOpacity style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={22} color="#6B7280" /></TouchableOpacity></View>;
}

const lightStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F9' }, content: { padding: 20, paddingBottom: 130 }, flex: { flex: 1 },
  pageHeader: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { fontSize: 30, fontWeight: '700', color: '#111827' }, subtitle: { marginTop: 5, fontSize: 14, color: '#6B7280' },
  setupCard: { marginTop: 18, padding: 15, borderRadius: 16, backgroundColor: '#FEF3C7', flexDirection: 'row', gap: 11 }, setupTitle: { color: '#92400E', fontWeight: '800' }, setupText: { marginTop: 3, color: '#A16207', fontSize: 12, lineHeight: 17 },
  monthNavigator: { marginTop: 20, minHeight: 48, paddingHorizontal: 16, borderRadius: 15, backgroundColor: '#EEF2FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthText: { color: '#4338CA', fontSize: 15, fontWeight: '800' },
  balanceCard: { marginTop: 14, padding: 20, borderRadius: 22, backgroundColor: '#111827' }, balanceLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '700' }, balanceAmount: { marginTop: 5, color: '#FFFFFF', fontSize: 34, fontWeight: '800' }, negative: { color: '#FCA5A5' }, balanceDetails: { marginTop: 20, paddingTop: 17, borderTopWidth: 1, borderTopColor: '#374151', flexDirection: 'row', justifyContent: 'space-between' }, detailLabel: { color: '#9CA3AF', fontSize: 11 }, detailValue: { marginTop: 3, color: '#FFFFFF', fontWeight: '800' }, incomeText: { color: '#059669' }, expenseText: { marginTop: 3, color: '#A5B4FC', fontWeight: '800' },
  sectionHeader: { marginTop: 28, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#111827', fontSize: 20, fontWeight: '800' }, sectionHint: { marginTop: 2, color: '#6B7280', fontSize: 12 },
  smallAdd: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#4F46E5', flexDirection: 'row', alignItems: 'center', gap: 4 }, incomeAdd: { backgroundColor: '#059669' }, smallAddText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  viewAllButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 11, backgroundColor: '#EEF2FF', flexDirection: 'row', alignItems: 'center', gap: 2 }, viewAllText: { color: '#4F46E5', fontSize: 11, fontWeight: '800' },
  listCard: { marginBottom: 9, padding: 13, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 11 }, iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, cardTitle: { flexShrink: 1, color: '#111827', fontSize: 14, fontWeight: '700' }, cardAmount: { color: '#111827', fontSize: 12, fontWeight: '800' }, cardMeta: { marginTop: 4, color: '#6B7280', fontSize: 11 }, trailing: { alignItems: 'flex-end', gap: 3 },
  upcomingExpense: { color: '#4F46E5' }, upcomingModalHeader: { padding: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, upcomingList: { paddingHorizontal: 20, paddingBottom: 50 },
  progressTrack: { marginTop: 9, height: 7, borderRadius: 4, backgroundColor: '#E5E7EB', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4 }, progressText: { marginTop: 5, fontSize: 10, fontWeight: '700' },
  emptyCard: { padding: 18, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7D2FE', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 }, emptyText: { flex: 1, color: '#6B7280', fontSize: 13 },
  modalSafe: { flex: 1, backgroundColor: '#F6F7F9' }, modalContent: { padding: 20, paddingBottom: 60 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, modalTitle: { color: '#111827', fontSize: 24, fontWeight: '800' }, closeButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }, modalHint: { marginBottom: 24, color: '#6B7280', fontSize: 13, lineHeight: 18 },
  label: { marginTop: 18, marginBottom: 8, color: '#374151', fontSize: 13, fontWeight: '700' }, selector: { minHeight: 52, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectorText: { color: '#111827', fontSize: 15, fontWeight: '600' },
  amountEditor: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center' }, currencyEditor: { paddingHorizontal: 17, color: '#4F46E5', fontSize: 18, fontWeight: '800' }, modalInput: { flex: 1, minHeight: 52, paddingRight: 16, textAlign: 'right', color: '#111827', fontSize: 17 }, textInput: { minHeight: 52, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#111827', fontSize: 15 },
  kindRow: { flexDirection: 'row', gap: 9, marginTop: 15 }, kindChip: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }, kindExpense: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }, kindIncome: { backgroundColor: '#059669', borderColor: '#059669' }, kindText: { color: '#4B5563', fontWeight: '800' }, kindTextActive: { color: '#FFFFFF' },
  frequencyRow: { flexDirection: 'row', gap: 7 }, frequencyChip: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }, frequencyActive: { backgroundColor: '#EEF2FF', borderColor: '#818CF8' }, frequencyText: { color: '#6B7280', fontSize: 12, fontWeight: '700' }, frequencyTextActive: { color: '#4F46E5' },
  primaryButton: { marginTop: 30, minHeight: 54, borderRadius: 16, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  deleteButton: { marginTop: 13, minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }, deleteText: { color: '#DC2626', fontSize: 14, fontWeight: '800' },
});
