/**
 * SSI Mobile Wallet — Entry Point
 */

import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import AppNavigator from './src/navigation/AppNavigator'
import BiometricGate from './src/components/BiometricGate'
import {
  addNotificationListener,
  addNotificationResponseListener,
} from './src/services/notification.service'

export default function App() {
  useEffect(() => {
    // Listen for incoming notifications
    const notifSub = addNotificationListener((notification) => {
      console.log('Notification received:', notification.request.content.title)
    })

    // Listen for notification taps
    const responseSub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data
      console.log('Notification tapped:', data)
    })

    return () => {
      notifSub.remove()
      responseSub.remove()
    }
  }, [])

  return (
    <SafeAreaProvider>
      <BiometricGate>
        <AppNavigator />
      </BiometricGate>
      <StatusBar style="light" />
    </SafeAreaProvider>
  )
}
