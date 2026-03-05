import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  ssr: false,
  srcDir: 'app',
  compatibilityDate: '2025-12-16',

  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
  ],

  css: ['~/assets/css/main.css'],

  vite: {
    // @ts-expect-error Vite plugin type mismatch between @tailwindcss/vite and Nuxt's bundled Vite version
    plugins: [tailwindcss()],
  },

  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', file: 'de.json', name: 'Deutsch' },
      { code: 'en', language: 'en-US', file: 'en.json', name: 'English' },
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    langDir: '../i18n/locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },

  devServer: {
    port: Number(process.env.CODEBASE_INDEXER_PORT) || 3030,
  },

  runtimeConfig: {
    indexerWorkspacePath: process.env.CODEBASE_INDEXER_WORKSPACE_PATH || '',
    indexerEmbeddingApiKey: process.env.CODE_INDEX_EMBEDDING_API_KEY || '',
    indexerEmbeddingProvider: process.env.CODE_INDEX_EMBEDDING_PROVIDER || 'openrouter',
    indexerEmbeddingModel: process.env.CODE_INDEX_EMBEDDING_MODEL || '',
    indexerEmbeddingBaseUrl: process.env.CODE_INDEX_EMBEDDING_BASE_URL || '',
    indexerEmbeddingDimensions: process.env.CODE_INDEX_EMBEDDING_DIMENSIONS || '1536',
    public: {
      apiBase: '',
    },
  },
});
