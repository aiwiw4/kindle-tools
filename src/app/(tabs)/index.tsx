import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActionButton from '@/components/action-button';
import { getColors } from '@/constants/theme';
import { convertFile, pickBookFile, shareTextFile, type PickedBook } from '@/lib/files';
import type { TextStats } from '@/lib/filesystem';

export default function ConverterScreen() {
  const scheme = useColorScheme();
  const colors = getColors(scheme);
  const isDark = scheme === 'dark';
  const heroBackground = isDark ? '#161616' : '#f7f9fc';
  const borderColor = isDark ? '#2d2d2d' : '#dbe4f0';

  const [file, setFile] = useState<PickedBook | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stats, setStats] = useState<TextStats | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Выберите файл');

  const handlePick = async () => {
    try {
      setMessage('Открываем выбор файла...');
      const result = await pickBookFile();
      if (result.type === 'canceled') {
        setMessage('Выбор файла отменён');
        return;
      }
      if (result.type === 'unsupported') {
        Alert.alert(
          'Неподдерживаемый формат',
          `Файл «${result.name}» не распознан. Нужен .epub, .fb2 или .docx`
        );
        setMessage('Формат не поддерживается');
        return;
      }
      setFile(result.file);
      setStats(null);
      setPreview(null);
      setOutputPath(null);
      setMessage(`Выбран: ${result.file.name}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Не удалось выбрать файл';
      Alert.alert('Ошибка', text);
      setMessage(text);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      return;
    }
    setLoading(true);
    setMessage('Конвертация...');
    try {
      const result = await convertFile(file);
      setPreview(result.text);
      setStats(result.stats);
      setOutputPath(result.outputPath);
      setMessage(`Готово: ${result.outputName}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Неизвестная ошибка';
      Alert.alert('Ошибка конвертации', text);
      setMessage(`Ошибка: ${text}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!outputPath) {
      return;
    }
    try {
      const status = await shareTextFile(outputPath);
      if (status === 'unavailable') {
        Alert.alert('Недоступно', 'Sharing недоступен на этом устройстве');
      }
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось поделиться'
      );
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: heroBackground, borderColor }]}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Конвертер книг</Text>
        </View>

        <View style={[styles.statusBar, { backgroundColor: heroBackground, borderColor }]}>
          <Text style={[styles.statusText, { color: colors.text }]}>{message}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: heroBackground, borderColor }]}>
          <Text style={[styles.label, { color: colors.text }]}>Исходный файл</Text>
          <Text style={[styles.fileName, { color: colors.text }]}>
            {file?.name ?? 'Файл не выбран'}
          </Text>
          <ActionButton title="Выбрать EPUB / FB2 / DOCX" onPress={handlePick} variant="secondary" />
        </View>

        <ActionButton
          title="Конвертировать в TXT"
          onPress={handleConvert}
          disabled={!file}
          loading={loading}
        />

        {stats ? (
          <View style={[styles.card, { backgroundColor: heroBackground, borderColor }]}>
            <Text style={[styles.label, { color: colors.text }]}>Результат</Text>
            <Text style={[styles.statLine, { color: colors.text }]}>
              {`Абзацев: ${stats.paragraphs} · Строк: ${stats.lines} · Слов: ${stats.words}`}
            </Text>
            {outputPath ? (
              <Text style={[styles.path, { color: colors.text }]}>
                {`Сохранено: ${outputPath.split('/').pop()}`}
              </Text>
            ) : null}
            <View style={styles.row}>
              <ActionButton
                title="Поделиться"
                onPress={handleShare}
                variant="secondary"
                style={styles.flex}
              />
            </View>
            {preview ? (
              <Text style={[styles.preview, { color: colors.text }]} numberOfLines={8}>
                {preview}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  statusBar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  statusText: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
  },
  statLine: {
    fontSize: 14,
  },
  path: {
    fontSize: 13,
    opacity: 0.75,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
});
