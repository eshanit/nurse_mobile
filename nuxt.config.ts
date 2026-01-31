// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath, URL } from 'node:url';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-zod-i18n',
    '@pinia/nuxt',
  ],
  css: ['~/assets/css/main.css'],
  alias: {
    '~': fileURLToPath(new URL('./app/', import.meta.url)),
    '@': fileURLToPath(new URL('./app/', import.meta.url)),
  },
  // @ts-ignore - i18n module types are loaded at runtime
  i18n: {
    locales: [
      { code: 'en', name: 'English' },
    ],
    defaultLocale: 'en',
    vueI18n: './i18n.config.ts'
  },
  ssr: false,
})