import { defineConfig } from 'vite';

const isGitHubActions = Boolean(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GITHUB_ACTIONS,
);

export default defineConfig({
  base: isGitHubActions ? '/train/' : '/',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
