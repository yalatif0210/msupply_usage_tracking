import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // Les tests d'intégration rafraîchissent toute la chaîne des vues de
    // piliers (plusieurs secondes par gel sur une base éphémère) : le délai
    // par défaut de 5 s tranchait les tests qui gèlent deux fois.
    testTimeout: 30_000,
  },
});
