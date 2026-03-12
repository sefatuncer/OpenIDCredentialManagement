/**
 * App Navigator — Bottom tabs + stack navigation
 */

import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet } from 'react-native'

import { linking, RootStackParamList, MainTabParamList } from './linking'
import { colors, fontSize } from '../theme'

// Screens
import HomeScreen from '../screens/HomeScreen'
import CredentialsScreen from '../screens/CredentialsScreen'
import ScanScreen from '../screens/ScanScreen'
import DelegationsScreen from '../screens/DelegationsScreen'
import SettingsScreen from '../screens/SettingsScreen'
import PresentCredentialScreen from '../screens/PresentCredentialScreen'
import AgentScreen from '../screens/AgentScreen'
import TrustScreen from '../screens/TrustScreen'

const Tab = createBottomTabNavigator<MainTabParamList>()
const Stack = createNativeStackNavigator<RootStackParamList>()

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '\u2302',
    Credentials: '\u2b1a',
    Scan: '\u2b24',
    Delegations: '\u2194',
    Settings: '\u2699',
  }
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabIconText, focused && styles.tabIconFocused]}>
        {icons[label] || '\u25cf'}
      </Text>
    </View>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Credentials"
        component={CredentialsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Credentials" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Scan" focused={focused} />,
          tabBarLabel: 'Scan QR',
        }}
      />
      <Tab.Screen
        name="Delegations"
        component={DelegationsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Delegations" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: fontSize.lg },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PresentCredential"
          component={PresentCredentialScreen}
          options={{ title: 'Present Credential' }}
        />
        <Stack.Screen
          name="AgentDetail"
          component={AgentScreen}
          options={{ title: 'Agent Identity' }}
        />
        <Stack.Screen
          name="TrustManagement"
          component={TrustScreen}
          options={{ title: 'Trust Management' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: fontSize.xs,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  tabIconFocused: {
    color: colors.primary,
  },
})
