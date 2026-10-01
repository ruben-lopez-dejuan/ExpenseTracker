import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SettingsButton from '../settings-button';

import {
  Category,
  useCategories,
} from '../../context/categories-context';
import { useAppSettings } from '../../context/app-settings-context';
import { useAppStyles } from '../../lib/themed-styles';

const COLORS = [
  '#EF4444',
  '#DC2626',
  '#F43F5E',
  '#E11D48',
  '#EC4899',
  '#DB2777',
  '#F472B6',
  '#F97316',
  '#EA580C',
  '#FB923C',
  '#F59E0B',
  '#EAB308',
  '#FACC15',
  '#84CC16',
  '#22C55E',
  '#16A34A',
  '#10B981',
  '#059669',
  '#14B8A6',
  '#0D9488',
  '#06B6D4',
  '#38BDF8',
  '#0EA5E9',
  '#0284C7',
  '#3B82F6',
  '#2563EB',
  '#1D4ED8',
  '#6366F1',
  '#4F46E5',
  '#4338CA',
  '#8B5CF6',
  '#7C3AED',
  '#6D28D9',
  '#A855F7',
  '#C026D3',
  '#D946EF',
  '#78716C',
  '#64748B',
  '#475569',
  '#6B7280',
  '#94A3B8',
  '#374151',
];

const ICONS = [
  // General
  'pricetag-outline',
  'bookmark-outline',
  'star-outline',
  'heart-outline',
  'sparkles-outline',
  'ellipsis-horizontal-circle-outline',

  // Comida y bebida
  'restaurant-outline',
  'fast-food-outline',
  'cafe-outline',
  'beer-outline',
  'wine-outline',
  'nutrition-outline',
  'basket-outline',
  'cart-outline',

  // Transporte y viajes
  'car-outline',
  'bus-outline',
  'train-outline',
  'subway-outline',
  'airplane-outline',
  'bicycle-outline',
  'walk-outline',
  'navigate-outline',
  'map-outline',
  'location-outline',

  // Casa
  'home-outline',
  'bed-outline',
  'bulb-outline',
  'water-outline',
  'flame-outline',
  'key-outline',
  'construct-outline',

  // Tecnología
  'laptop-outline',
  'desktop-outline',
  'phone-portrait-outline',
  'headset-outline',
  'game-controller-outline',
  'camera-outline',
  'wifi-outline',
  'cloud-outline',

  // Dinero
  'card-outline',
  'cash-outline',
  'wallet-outline',
  'receipt-outline',
  'calculator-outline',
  'trending-up-outline',
  'trending-down-outline',

  // Compras
  'shirt-outline',
  'bag-outline',
  'gift-outline',
  'diamond-outline',

  // Salud y deporte
  'medkit-outline',
  'medical-outline',
  'fitness-outline',
  'barbell-outline',
  'body-outline',
  'football-outline',
  'basketball-outline',
  'tennisball-outline',

  // Trabajo y estudios
  'briefcase-outline',
  'school-outline',
  'book-outline',
  'library-outline',
  'document-text-outline',
  'pencil-outline',

  // Ocio y cultura
  'musical-notes-outline',
  'film-outline',
  'ticket-outline',
  'color-palette-outline',
  'mic-outline',

  // Personas
  'people-outline',
  'person-outline',
  'happy-outline',

  // Otros
  'cube-outline',
  'cut-outline',
  'paw-outline',
  'leaf-outline',
  'flower-outline',
  'earth-outline',
  'calendar-outline',
  'time-outline',
  'repeat-outline',
] as const;

export default function CategoriesScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const styles = useAppStyles(lightStyles);
  const { t } = useAppSettings();
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useCategories();

  const [editing, setEditing] =
    useState<Category | null>(null);

  const [modalVisible, setModalVisible] =
    useState(false);

  const [name, setName] =
    useState('');

  const [description, setDescription] =
    useState('');

  const [icon, setIcon] =
    useState<string>(
      'pricetag-outline'
    );

  const [color, setColor] =
    useState('#6366F1');

  const [saving, setSaving] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();

  const normalizedSearch = normalize(search);

  const filteredCategories =
    categories
      .map((category, index) => {
        const nameValue = normalize(category.name);
        const descriptionValue = normalize(category.description);
        const score = !normalizedSearch ? 0
          : nameValue === normalizedSearch ? 0
            : nameValue.startsWith(normalizedSearch) ? 1
              : nameValue.includes(normalizedSearch) ? 2
                : descriptionValue.includes(normalizedSearch) ? 3 : 99;
        return { category, index, score };
      })
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((item) => item.category);

  function openNew() {
    setEditing(null);
    setName('');
    setDescription('');
    setIcon(
      'pricetag-outline'
    );
    setColor('#6366F1');
    setModalVisible(true);
  }

  function openEdit(
    category: Category
  ) {
    setEditing(category);
    setName(category.name);
    setDescription(
      category.description
    );
    setIcon(category.icon);
    setColor(category.color);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert(
        'Falta el nombre',
        'Introduce un nombre.'
      );
      return;
    }

    if (!description.trim()) {
      Alert.alert(
        'Falta la descripción',
        'Describe qué gastos pertenecen a esta categoría.'
      );
      return;
    }

    try {
      setSaving(true);

      if (editing) {
        await updateCategory(
          editing.id,
          {
            name,
            description,
            icon,
            color,
          }
        );
      } else {
        await addCategory(
          name,
          description,
          icon,
          color
        );
      }

      setModalVisible(false);
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Error',
        'No se pudo guardar la categoría.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!editing) {
      return;
    }

    Alert.alert(
      'Eliminar categoría',
      'Solo podrás eliminarla si no tiene gastos asociados.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(
                editing.id
              );

              setModalVisible(
                false
              );
            } catch {
              Alert.alert(
                'No se puede eliminar',
                'Esta categoría tiene gastos asociados.'
              );
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {t('categories')}
          </Text>

          <Text
            style={styles.subtitle}
          >
            {t('categoriesSubtitle')}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <SettingsButton onPress={onOpenSettings} />
          <TouchableOpacity
            style={styles.newButton}
            onPress={openNew}
          >
            <Ionicons
              name="add"
              size={21}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.list
        }
      >
        {filteredCategories.map(
          (category) => (
            <TouchableOpacity
              key={category.id}
              style={
                styles.categoryCard
              }
              onPress={() =>
                openEdit(category)
              }
            >
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      `${category.color}20`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    category.icon as any
                  }
                  size={24}
                  color={
                    category.color
                  }
                />
              </View>

              <View
                style={{ flex: 1 }}
              >
                <Text
                  style={
                    styles.categoryName
                  }
                >
                  {category.name}
                </Text>

                <Text
                  style={
                    styles.categoryDescription
                  }
                  numberOfLines={2}
                >
                  {
                    category.description
                  }
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setModalVisible(false)
        }
      >
        <SafeAreaView
          style={styles.modalSafe}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : 'height'
            }
          >
            <ScrollView
              contentContainerStyle={
                styles.modalContent
              }
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={
                  styles.modalHeader
                }
              >
                <TouchableOpacity
                  onPress={() =>
                    setModalVisible(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.cancelText
                    }
                  >
                    {t('cancel')}
                  </Text>
                </TouchableOpacity>

                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  {editing
                    ? t('editCategory')
                    : t('newCategory')}
                </Text>

                <View
                  style={{ width: 60 }}
                />
              </View>

              <View
                style={
                  styles.preview
                }
              >
                <View
                  style={[
                    styles.previewIcon,
                    {
                      backgroundColor:
                        `${color}20`,
                    },
                  ]}
                >
                  <Ionicons
                    name={icon as any}
                    size={34}
                    color={color}
                  />
                </View>

                <Text
                  style={
                    styles.previewName
                  }
                >
                  {name ||
                    t('category')}
                </Text>
              </View>

              <Text style={styles.label}>
                {t('name')}
              </Text>

              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('categoryNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>
                {t('description')}
              </Text>

              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={
                  setDescription
                }
                multiline
                textAlignVertical="top"
                placeholder={t('categoryDescriptionPlaceholder')}
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>
                {t('icon')}
              </Text>

              <View
                style={
                  styles.iconGrid
                }
              >
                {ICONS.map(
                  (item) => {
                    const selected =
                      item === icon;

                    return (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.iconOption,
                          selected && {
                            borderColor:
                              color,
                            backgroundColor:
                              `${color}15`,
                          },
                        ]}
                        onPress={() =>
                          setIcon(
                            item
                          )
                        }
                      >
                        <Ionicons
                          name={item}
                          size={25}
                          color={
                            selected
                              ? color
                              : '#6B7280'
                          }
                        />
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>

              <Text style={styles.label}>
                {t('color')}
              </Text>

              <View
                style={
                  styles.colorGrid
                }
              >
                {COLORS.map(
                  (item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.colorCircle,
                        {
                          backgroundColor:
                            item,
                        },
                        item ===
                          color &&
                          styles.colorSelected,
                      ]}
                      onPress={() =>
                        setColor(item)
                      }
                    >
                      {item ===
                        color && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color="#FFFFFF"
                        />
                      )}
                    </TouchableOpacity>
                  )
                )}
              </View>

              <TouchableOpacity
                style={
                  styles.saveButton
                }
                disabled={saving}
                onPress={() => {
                  void handleSave();
                }}
              >
                <Text
                  style={
                    styles.saveButtonText
                  }
                >
                  {saving
                    ? t('saving')
                    : t('saveChanges')}
                </Text>
              </TouchableOpacity>

              {editing && (
                <TouchableOpacity
                  style={
                    styles.deleteButton
                  }
                  onPress={
                    confirmDelete
                  }
                >
                  <Text
                    style={
                      styles.deleteText
                    }
                  >
                    {t('deleteCategory')}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const lightStyles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        '#F6F7F9',
    },

    header: {
      paddingHorizontal: 20,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },

    title: {
      fontSize: 30,
      fontWeight: '700',
      color: '#111827',
    },

    subtitle: {
      marginTop: 5,
      fontSize: 14,
      color: '#6B7280',
    },

    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    expenseButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },

    expenseButtonPlus: {
      position: 'absolute',
      right: 7,
      bottom: 6,
    },

    newButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor:
        '#111827',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    searchContainer: {
      marginHorizontal: 20,
      marginTop: 18,
      height: 48,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    searchInput: {
      flex: 1,
      height: '100%',
      fontSize: 15,
      color: '#111827',
    },

    list: {
      padding: 20,
      paddingBottom: 120,
      gap: 10,
    },

    categoryCard: {
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 17,
      backgroundColor:
        '#FFFFFF',
    },

    iconCircle: {
      width: 50,
      height: 50,
      marginRight: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    categoryName: {
      fontSize: 17,
      fontWeight: '600',
      color: '#111827',
    },

    categoryDescription: {
      marginTop: 4,
      paddingRight: 10,
      fontSize: 13,
      lineHeight: 18,
      color: '#6B7280',
    },

    modalSafe: {
      flex: 1,
      backgroundColor:
        '#F6F7F9',
    },

    modalContent: {
      padding: 20,
      paddingBottom: 60,
    },

    modalHeader: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
      marginBottom: 26,
    },

    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#111827',
    },

    cancelText: {
      width: 60,
      color: '#6366F1',
    },

    preview: {
      alignItems: 'center',
      marginBottom: 30,
    },

    previewIcon: {
      width: 76,
      height: 76,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    previewName: {
      marginTop: 10,
      fontSize: 20,
      fontWeight: '700',
      color: '#111827',
    },

    label: {
      marginTop: 16,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
    },

    input: {
      padding: 16,
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
      fontSize: 16,
      color: '#111827',
    },

    textArea: {
      minHeight: 110,
      padding: 16,
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
      fontSize: 16,
      color: '#111827',
    },

    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },

    iconOption: {
      width: 48,
      height: 48,
      borderWidth: 2,
      borderColor:
        'transparent',
      borderRadius: 15,
      backgroundColor:
        '#FFFFFF',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },

    colorCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    colorSelected: {
      borderWidth: 3,
      borderColor:
        '#111827',
    },

    saveButton: {
      marginTop: 30,
      paddingVertical: 16,
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor:
        '#111827',
    },

    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },

    deleteButton: {
      marginTop: 14,
      paddingVertical: 15,
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        '#FCA5A5',
    },

    deleteText: {
      color: '#DC2626',
      fontWeight: '600',
    },
  });














