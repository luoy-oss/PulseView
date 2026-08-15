import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// 构建时注入版本信息：package.json 版本号 + 当前 git commit + 构建时间戳，
// 便于部署后直接在页面上确认版本是否已更新
function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
    )
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function getCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
    __APP_COMMIT__: JSON.stringify(getCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
