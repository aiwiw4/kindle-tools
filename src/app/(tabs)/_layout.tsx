import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { getColors } from '@/constants/theme';

export default function TabLayout() {
  const colors = getColors(useColorScheme());

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Конвертер',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="description" size={26} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="server"
        options={{
          title: 'Сервер',
          tabBarIcon: ({ color }) => <MaterialIcons name="wifi" size={26} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
