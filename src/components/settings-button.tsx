import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { useAppSettings } from '../context/app-settings-context';
import { useAppStyles } from '../lib/themed-styles';

export default function SettingsButton({ onPress }: { onPress: () => void }) {
  const styles = useAppStyles(lightStyles);
  const { isDark, t } = useAppSettings();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('openSettings')}
      style={styles.button}
      onPress={onPress}
    >
      <Ionicons
        name="settings-outline"
        size={21}
        color={isDark ? '#F9FAFB' : '#374151'}
      />
    </TouchableOpacity>
  );
}

const lightStyles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
