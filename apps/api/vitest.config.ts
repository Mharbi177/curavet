import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // `env.ts` validates the whole environment at import time, so the test
    // runner must supply a complete (fake) set of variables.
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      HOST: '127.0.0.1',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
      JWT_SECRET: 'unit-test-jwt-secret-value',
      CREDENTIALS_ENCRYPTION_KEY: 'unit-test-encryption-key',
      META_VERIFY_TOKEN: 'unit-test-verify-token',
      QUEUE_ENABLED: 'false',
      DOCS_ENABLED: 'true',
      LOG_LEVEL: 'error',
    },
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/services/**/*.ts', 'src/ai/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/services/test-*.ts'],
    },
  },
});
