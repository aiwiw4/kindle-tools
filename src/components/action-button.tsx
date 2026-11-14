import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import { getColors } from '@/constants/theme';

type ActionButtonProps = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: any;
};

export default function ActionButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: ActionButtonProps) {
  const colors = getColors(useColorScheme());

  const backgroundColor =
    variant === 'primary'
      ? colors.tint
      : variant === 'danger'
        ? '#d64545'
        : colors.buttonSecondaryBg;
  const textColor = variant === 'secondary' ? colors.buttonSecondaryText : '#fff';
  const borderColor = variant === 'secondary' ? colors.buttonSecondaryBorder : 'transparent';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: disabled || loading ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
