import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      // VitePWA disabled temporarily due to build memory limits in this environment
      /*
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Panel de Cirugías ITEO',
          short_name: 'ITEO Quirófanos',
          description: 'Gestión Inteligente de Quirófanos y Enfermería',
          theme_color: '#d97706',
          icons: []
        }
      })
      */
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version || '1.1.23')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      sourcemap: false,
      emptyOutDir: true,
    },
  };
});
