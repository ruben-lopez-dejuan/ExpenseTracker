import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
} from 'react-native-svg';

import { CurrencyCode, useAppSettings } from '../context/app-settings-context';
import { useAppStyles } from '../lib/themed-styles';

type DonutItem = {
  value: number;
  color: string;
};

type Props = {
  items: DonutItem[];
  total: number | null;
  currency: CurrencyCode;
};

const SIZE = 210;
const STROKE = 28;
const RADIUS =
  (SIZE - STROKE) / 2;

const CIRCUMFERENCE =
  2 * Math.PI * RADIUS;

export default function ExpenseDonut({
  items,
  total,
  currency,
}: Props) {
  const styles = useAppStyles(lightStyles);
  const { locale, t } = useAppSettings();
  let cumulative = 0;

  return (
    <View style={styles.container}>
      <Svg
        width={SIZE}
        height={SIZE}
        style={{
          transform: [
            {
              rotate:
                '-90deg',
            },
          ],
        }}
      >
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="#E5E7EB"
          strokeWidth={STROKE}
          fill="none"
        />

        {total !== null && total > 0 &&
          items.map(
            (
              item,
              index
            ) => {
              const percentage =
                item.value /
                total;

              const length =
                percentage *
                CIRCUMFERENCE;

              const offset =
                -cumulative *
                CIRCUMFERENCE;

              cumulative +=
                percentage;

              return (
                <Circle
                  key={index}
                  cx={
                    SIZE / 2
                  }
                  cy={
                    SIZE / 2
                  }
                  r={RADIUS}
                  stroke={
                    item.color
                  }
                  strokeWidth={
                    STROKE
                  }
                  fill="none"
                  strokeLinecap="butt"
                  strokeDasharray={`${length} ${
                    CIRCUMFERENCE -
                    length
                  }`}
                  strokeDashoffset={
                    offset
                  }
                />
              );
            }
          )}
      </Svg>

      <View
        style={styles.center}
      >
        <Text
          style={styles.total}
        >
          {total === null
            ? '—'
            : new Intl.NumberFormat(
                locale,
                {
                  style: 'currency',
                  currency,
                }
              ).format(total)}
        </Text>

        <Text
          style={styles.label}
        >
          {t('spent')}
        </Text>
      </View>
    </View>
  );
}

const lightStyles =
  StyleSheet.create({
    container: {
      width: SIZE,
      height: SIZE,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    center: {
      position:
        'absolute',
      alignItems:
        'center',
    },

    total: {
      fontSize: 22,
      fontWeight: '700',
      color: '#111827',
    },

    label: {
      marginTop: 3,
      fontSize: 13,
      color: '#9CA3AF',
    },
  });
