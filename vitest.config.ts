import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next.js build-time guard with no runtime package;
      // alias it to an empty module so server modules import cleanly under test.
      'server-only': path.resolve(__dirname, './tests/__mocks__/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
