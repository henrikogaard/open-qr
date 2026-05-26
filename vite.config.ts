import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig } from 'vite';

type VitestUserConfig = UserConfig & {
  test: {
    include: string[];
    fileParallelism: boolean;
    setupFiles: string[];
  };
};

export default defineConfig(({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    fileParallelism: false,
    setupFiles: ['src/lib/db/test-setup.ts']
  }
}) as VitestUserConfig);
