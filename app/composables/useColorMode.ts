/**
 * Color Mode Composable
 * 
 * Provides reactive dark mode management with localStorage persistence
 */

import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface UseColorModeOptions {
  defaultValue?: 'light' | 'dark' | 'system'
  localStorage?: boolean
}

export interface UseColorModeReturn {
  mode: Ref<'light' | 'dark' | 'system'>
  preferredMode: Ref<'light' | 'dark'>
  system: Ref<'light' | 'dark'>
  isDark: Ref<boolean>
  isLight: Ref<boolean>
  toggle: () => void
  setMode: (mode: 'light' | 'dark' | 'system') => void
}

/**
 * Reactive color mode composable with persistence
 * 
 * @param options - Configuration options
 * @returns Color mode functionality
 */
export function useColorMode(options: UseColorModeOptions = {}): UseColorModeReturn {
  const {
    defaultValue = 'system',
    localStorage: enableStorage = true
  } = options

  // Use localStorage for persistence if enabled
  const storageKey = 'color-mode'
  const storedMode = enableStorage 
    ? useLocalStorage(storageKey, defaultValue)
    : ref(defaultValue)

  // System preference detection
  const system = ref<'light' | 'dark'>('light')
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    system.value = mediaQuery.matches ? 'dark' : 'light'
    
    mediaQuery.addEventListener('change', () => {
      system.value = mediaQuery.matches ? 'dark' : 'light'
    })
  }

  // Current mode
  const mode = computed(() => storedMode.value as 'light' | 'dark' | 'system')

  // Preferred mode (without system fallback)
  const preferredMode = computed(() => {
    const current = mode.value
    return current === 'system' ? system.value : current
  })

  // Dark/Light computed values
  const isDark = computed(() => preferredMode.value === 'dark')
  const isLight = computed(() => preferredMode.value === 'light')

  const toggle = () => {
    const nextMode = storedMode.value === 'dark' ? 'light' : 
                     storedMode.value === 'light' ? 'dark' : 
                     system.value === 'dark' ? 'light' : 'dark'
    storedMode.value = nextMode
  }

  const setMode = (newMode: 'light' | 'dark' | 'system') => {
    storedMode.value = newMode
  }

  return {
    mode,
    preferredMode,
    system,
    isDark,
    isLight,
    toggle,
    setMode
  }
}

/**
 * Get current color mode class for HTML element
 * 
 * @param mode - Color mode
 * @returns CSS class string
 */
export function getColorModeClass(mode: 'light' | 'dark' | 'system'): string {
  if (mode === 'system') {
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? 'dark' 
      : 'light'
  }
  return mode
}

/**
 * Apply color mode to document root
 * 
 * @param mode - Color mode to apply
 */
export function applyColorMode(mode: 'light' | 'dark' | 'system'): void {
  const colorClass = getColorModeClass(mode)
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(colorClass)
}