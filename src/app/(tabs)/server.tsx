import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActionButton from '@/components/action-button';
import RenameModal from '@/components/rename-modal';
import { getColors } from '@/constants/theme';
import { shareTextFile } from '@/lib/files';
import {
  bumpCounterForName,
  getNextNumber,
  renumberTxtFiles,
  syncCounterWithFiles,
} from '@/lib/counter';
import {
  SERVER_PORT,
  copyToUploads,
  formatBytes,
  isTxtFile,
  listUploadFiles,
  renameUploadFile,
  type UploadFile,
} from '@/lib/filesystem';
import {
  getServerInstance,
  getServerOrigin,
  hasTcpModule,
  isExpoGo,
  isServerSupported,
  startFileServer,
  stopFileServer,
} from '@/lib/server';

export default function ServerScreen() {
  const scheme = useColorScheme();
  const colors = getColors(scheme);
  const isDark = scheme === 'dark';
  const cardBackground = isDark ? '#161616' : '#f7f9fc';
  const borderColor = isDark ? '#2d2d2d' : '#dbe4f0';

  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ip, setIp] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [renameTarget, setRenameTarget] = useState<UploadFile | null>(null);
  const [renameName, setRenameName] = useState('');
  const [nextNumber, setNextNumber] = useState(1);

  const refresh = useCallback(async () => {
    try {
      setFiles(await listUploadFiles());
    } catch {
      setFiles([]);
    }
    try {
      setNextNumber(await syncCounterWithFiles());
    } catch {}
  }, []);

  const loadIp = useCallback(async () => {
    try {
      setIp(await Network.getIpAddressAsync());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    loadIp();
  }, [refresh, loadIp]);

  useEffect(() => {
    return () => {
      if (getServerInstance()) {
        stopFileServer().catch(() => {});
      }
    };
  }, []);

  const refreshWithSpin = async () => {
    setRefreshing(true);
    await refresh();
    await loadIp();
    setRefreshing(false);
  };

  const toggleServer = async () => {
    if (!isServerSupported()) {
      const needsNativeBuild = isExpoGo() || !hasTcpModule();
      Alert.alert(
        needsNativeBuild ? 'Не работает в Expo Go' : 'Только мобильные платформы',
        needsNativeBuild
          ? 'HTTP-сервер требует нативную сборку:\nnpx expo run:android\n\nКонвертер при этом работает в Expo Go.'
          : 'HTTP-сервер для Kindle работает на Android и iOS.'
      );
      return;
    }
    setBusy(true);
    try {
      if (!running) {
        await startFileServer();
        await loadIp();
        setRunning(true);
      } else {
        await stopFileServer();
        setRunning(false);
      }
    } catch (error) {
      Alert.alert(
        'Ошибка сервера',
        error instanceof Error ? error.message : 'Не удалось запустить сервер'
      );
    } finally {
      setBusy(false);
    }
  };

  const getKindleUrl = () => {
    if (!running || !ip) {
      return '';
    }
    return `http://${ip}:${SERVER_PORT}`;
  };

  const copyKindleUrl = async () => {
    const url = getKindleUrl();
    if (!url) {
      return;
    }
    await Clipboard.setStringAsync(url);
    Alert.alert('Скопировано', url);
  };

  const addFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: '*/*',
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets?.[0];
      if (!asset) {
        return;
      }
      await copyToUploads(asset.uri, asset.name ?? `file-${Date.now()}.txt`);
      await refresh();
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось добавить файл'
      );
    }
  };

  const shareFile = async (file: UploadFile) => {
    try {
      const status = await shareTextFile(file.uri);
      if (status === 'unavailable') {
        Alert.alert('Недоступно', 'Sharing недоступен');
      }
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось поделиться'
      );
    }
  };

  const deleteFile = (file: UploadFile) => {
    Alert.alert('Удалить файл?', file.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await FileSystem.deleteAsync(file.uri, { idempotent: true });
          await refresh();
        },
      },
    ]);
  };

  const openRename = (file: UploadFile) => {
    setRenameTarget(file);
    setRenameName(file.name);
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameName('');
  };

  const useNextNumber = () => {
    const extension = renameTarget?.name.match(/\.[^.]+$/)?.[0] ?? '.txt';
    setRenameName(`${nextNumber}${extension}`);
  };

  const confirmRename = async () => {
    if (!renameTarget) {
      return;
    }
    try {
      await renameUploadFile(renameTarget.uri, renameName);
      await bumpCounterForName(renameName);
      setNextNumber(await getNextNumber());
      closeRename();
      await refresh();
    } catch (error) {
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось переименовать'
      );
    }
  };

  const renumberAll = () => {
    const txtFiles = files.filter((file) => isTxtFile(file.name));
    const pending = txtFiles.filter((file) => !/^\d+\.txt$/i.test(file.name)).length;
    if (pending === 0) {
      Alert.alert('Нечего нумеровать', 'Все TXT файлы уже пронумерованы.');
      return;
    }
    Alert.alert(
      'Пронумеровать TXT?',
      `${pending} файл(ов) получат номера, начиная с ${nextNumber}.txt`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Пронумеровать',
          onPress: async () => {
            try {
              const renamed = await renumberTxtFiles();
              setNextNumber(await getNextNumber());
              await refresh();
              Alert.alert('Готово', `Переименовано: ${renamed}`);
            } catch (error) {
              Alert.alert(
                'Ошибка',
                error instanceof Error ? error.message : 'Не удалось переименовать'
              );
            }
          },
        },
      ]
    );
  };

  const origin = getServerOrigin();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <RenameModal
        visible={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        value={renameName}
        nextNumber={nextNumber}
        onChange={setRenameName}
        onCancel={closeRename}
        onConfirm={confirmRename}
        onUseNextNumber={useNextNumber}
      />
      <FlatList
        data={files}
        keyExtractor={(item) => item.uri}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshWithSpin} />
        }
        ListHeaderComponent={
          <>
            <View style={[styles.hero, { backgroundColor: cardBackground, borderColor }]}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Kindle-сервер</Text>
            </View>

            <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
              <Text
                style={[
                  styles.status,
                  { color: running ? '#2ecc71' : colors.text },
                ]}
              >
                {running ? '● Запущен' : '○ Остановлен'}
              </Text>
              {running ? (
                <>
                  <Text style={[styles.url, { color: colors.text }]}>
                    {`Kindle: ${getKindleUrl() || 'Определяем IP...'}`}
                  </Text>
                  {origin ? (
                    <Text style={[styles.meta, { color: colors.text }]}>
                      {`Origin: ${origin}`}
                    </Text>
                  ) : null}
                  <ActionButton
                    title="Скопировать ссылку для Kindle"
                    onPress={copyKindleUrl}
                    variant="secondary"
                  />
                </>
              ) : null}
              <ActionButton
                title={running ? 'Остановить сервер' : 'Запустить сервер'}
                onPress={toggleServer}
                loading={busy}
                variant={running ? 'danger' : 'primary'}
              />
            </View>

            <View style={styles.headerRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Файлы
              </Text>
              <ActionButton
                title="+ Добавить"
                onPress={addFile}
                variant="secondary"
                style={styles.addBtn}
              />
            </View>
            <ActionButton
              title={`№ с ${nextNumber}.txt`}
              onPress={renumberAll}
              variant="secondary"
              style={styles.renumberBtn}
            />
          </>
        }
        ListEmptyComponent={
          <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
            <Text style={[styles.empty, { color: colors.text }]}>
              Пусто
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.fileRow, { backgroundColor: cardBackground, borderColor }]}>
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.fileMeta, { color: colors.text }]}>
                {formatBytes(item.size)}
              </Text>
            </View>
            <View style={styles.fileActions}>
              <ActionButton
                title="Отправить"
                onPress={() => shareFile(item)}
                variant="secondary"
                style={styles.smallBtn}
              />
              <ActionButton
                title="Имя"
                onPress={() => openRename(item)}
                variant="secondary"
                style={styles.smallBtn}
              />
              <ActionButton
                title="Удалить"
                onPress={() => deleteFile(item)}
                variant="danger"
                style={styles.smallBtn}
              />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 12,
    paddingBottom: 40,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  status: {
    fontSize: 18,
    fontWeight: '600',
  },
  url: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  addBtn: {
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  renumberBtn: {
    minHeight: 42,
    paddingVertical: 10,
    marginBottom: 4,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.8,
  },
  fileRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 8,
  },
  fileInfo: {
    gap: 6,
  },
  fileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 13,
    opacity: 0.7,
  },
  smallBtn: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
});
