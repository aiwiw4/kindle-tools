import { Modal, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

import ActionButton from '@/components/action-button';
import { getColors } from '@/constants/theme';
import { sanitizeFileName } from '@/lib/filesystem';

type RenameModalProps = {
  visible: boolean;
  currentName: string;
  value: string;
  nextNumber: number;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onUseNextNumber: () => void;
};

export default function RenameModal({
  visible,
  currentName,
  value,
  nextNumber,
  onChange,
  onCancel,
  onConfirm,
  onUseNextNumber,
}: RenameModalProps) {
  const scheme = useColorScheme();
  const colors = getColors(scheme);
  const isDark = scheme === 'dark';
  const cardBackground = isDark ? '#161616' : '#f7f9fc';
  const borderColor = isDark ? '#3d4657' : '#c5d4e8';
  const inputBackground = isDark ? '#0f0f0f' : '#fff';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
          <Text style={[styles.title, { color: colors.text }]}>Переименовать</Text>
          <Text style={[styles.subtitle, { color: colors.text }]} numberOfLines={2}>
            {currentName}
          </Text>
          <View style={styles.counterRow}>
            <ActionButton
              title={`№ ${nextNumber}`}
              onPress={onUseNextNumber}
              variant="secondary"
              style={styles.counterBtn}
            />
          </View>
          <TextInput
            value={value}
            onChangeText={(text) => onChange(sanitizeFileName(text, false))}
            placeholder="Новое имя файла"
            placeholderTextColor={isDark ? '#888' : '#999'}
            autoFocus
            selectTextOnFocus
            style={[
              styles.input,
              { color: colors.text, backgroundColor: inputBackground, borderColor },
            ]}
          />
          <View style={styles.actions}>
            <ActionButton
              title="Отмена"
              onPress={onCancel}
              variant="secondary"
              style={styles.btn}
            />
            <ActionButton
              title="Сохранить"
              onPress={onConfirm}
              disabled={!value.trim() || value.trim() === currentName}
              style={styles.btn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.75,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  counterBtn: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    minHeight: 44,
  },
});
