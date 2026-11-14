import { StyleSheet, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kindle Tools</Text>

      <View style={styles.block}>
        <Text style={styles.heading}>Конвертер</Text>
        <Text style={styles.text}>
          EPUB и FB2 → TXT. Логика повторяет convert/epub_to_txt.py и convert/fb2_to_txt.py.
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.heading}>Сервер</Text>
        <Text style={styles.text}>
          HTTP-сервер на порту 8000 для раздачи файлов из uploads по локальной сети — аналог
          server/server.py для Kindle.
        </Text>
      </View>

      <Text style={styles.note}>
        Для сервера нужна нативная сборка (не Expo Go): npx expo run:android
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  block: {
    gap: 6,
  },
  heading: {
    fontSize: 17,
    fontWeight: '600',
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.85,
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    opacity: 0.7,
  },
});
