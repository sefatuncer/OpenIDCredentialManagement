import { useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastId = 0;

const listeners: Set<(toast: Toast) => void> = new Set();
const dismissListeners: Set<(id: string) => void> = new Set();

export function showToast(type: ToastType, message: string, duration = 4000) {
  const toast: Toast = {
    id: `toast-${++toastId}`,
    type,
    message,
    duration,
  };
  listeners.forEach((listener) => listener(toast));
  return toast.id;
}

export function dismissToast(id: string) {
  dismissListeners.forEach((listener) => listener(id));
}

export const toast = {
  success: (message: string, duration?: number) => showToast('success', message, duration),
  error: (message: string, duration?: number) => showToast('error', message, duration),
  warning: (message: string, duration?: number) => showToast('warning', message, duration),
  info: (message: string, duration?: number) => showToast('info', message, duration),
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((newToast: Toast) => {
    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register listeners
  useEffect(() => {
    listeners.add(addToast);
    dismissListeners.add(removeToast);
    return () => {
      listeners.delete(addToast);
      dismissListeners.delete(removeToast);
    };
  }, [addToast, removeToast]);

  return { toasts, removeToast };
}
