import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import playgroundConfig from './vitest.playground.config.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Preserve fixtures that own their DOM and responsive tests that use Happy DOM
// while running every suite through the same Vitest entry point.
const files = fs
  .readdirSync(path.join(__dirname, 'src'), { recursive: true })
  .filter((file) => /\.(test|spec)\.tsx?$/.test(String(file)))
  .map((file) => `src/${String(file).replaceAll('\\', '/')}`)
const isolatedDOM: string[] = []
const responsive: string[] = []
const playground = ['src/features/playground/**/*.{test,spec}.{ts,tsx}']
for (const file of files) {
  if (file.startsWith('src/features/playground/')) continue
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8')
  if (/new Window\(/.test(source) && source.includes("from 'happy-dom'")) {
    isolatedDOM.push(file)
  } else if (source.includes('happyDOM')) {
    responsive.push(file)
  }
}
const resolve = { alias: { '@': path.resolve(__dirname, './src') } }
const server = {
  deps: { inline: [/@lobehub\/icons/, /@lobehub\/ui/, /@emoji-mart\/data/] },
}

export default defineConfig({
  resolve,
  test: {
    maxWorkers: 4,
    projects: [
      {
        resolve,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          clearMocks: true,
          restoreMocks: true,
          server,
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...isolatedDOM, ...responsive, ...playground],
        },
      },
      {
        ...playgroundConfig,
        test: {
          ...playgroundConfig.test,
          name: 'playground',
          server,
          include: playground,
        },
      },
      {
        resolve,
        test: {
          name: 'responsive',
          environment: 'happy-dom',
          setupFiles: [
            './src/features/channels/__tests__/channel-test-setup.ts',
          ],
          restoreMocks: true,
          server,
          include: responsive,
        },
      },
      {
        resolve,
        test: {
          name: 'isolated-dom',
          environment: 'node',
          server,
          include: isolatedDOM,
        },
      },
    ],
  },
})
