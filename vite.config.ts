import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import wyw from '@wyw-in-js/vite'
import { defineConfig, type Plugin, searchForWorkspaceRoot } from 'vite'
import checker from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'

const fixSourceMaps = (): Plugin => {
  let interval: ReturnType<typeof setInterval> | null = null
  return {
    name: 'fix-source-map',
    enforce: 'post' as const,
    transform: (source) => {
      if (interval) {
        return
      }
      interval = setInterval(() => {
        const nodeModulesPath = path.join(__dirname, 'node_modules', '.vite', 'deps')
        if (fs.existsSync(nodeModulesPath)) {
          clearInterval(interval ?? 0)
          const files = fs.readdirSync(nodeModulesPath)
          for (const file of files) {
            const mapFile = `${file}.map`
            const mapPath = path.join(nodeModulesPath, mapFile)
            if (fs.existsSync(mapPath)) {
              const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as {
                sources?: unknown[]
                [k: string]: unknown
              }
              if (!('sources' in mapData) || mapData.sources?.length === 0) {
                mapData.sources = [path.relative(mapPath, path.join(nodeModulesPath, file))]
                fs.writeFileSync(mapPath, JSON.stringify(mapData), 'utf8')
              }
            }
          }
        }
      }, 100)
      return source
    },
    buildEnd: () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    },
    closeBundle: () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    tsconfigPaths(),
    wyw({
      include: ['**/*.{ts,tsx}'],
      babelOptions: {
        presets: ['@babel/preset-typescript', '@babel/preset-react'],
      },
    }),
    react(),
    checker({ overlay: { initialIsOpen: false, position: 'br' }, typescript: true, biome: false }),
    fixSourceMaps(),
    //mkcert()
  ],
  build: {
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: 'oxc',
    assetsInlineLimit: 0,
    terserOptions: process.env.NODE_ENV === 'development' ? {} : undefined,
  },
  define: {
    VITE_APP_VERSION: JSON.stringify(process.env.npm_package_version),
    VITE_BUILD_TIME: JSON.stringify(new Date().toISOString()),
    // Ensure consistent runtime behavior between dev and preview by disabling React StrictMode unless explicitly overridden
    VITE_BUILD_WITHOUT_STRICT: process.env.VITE_BUILD_WITHOUT_STRICT ?? true,
  },
  server: {
    fs: {
      allow: [
        // search up for workspace root
        searchForWorkspaceRoot(process.cwd()),
      ],
    },
  },
})
