import { readFileSync, existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headlineInject() {
  return {
    name: 'headline-inject',
    transformIndexHtml(html: string) {
      const p = 'public/news.json'
      if (!existsSync(p)) return html
      const data = JSON.parse(readFileSync(p, 'utf8'))
      const items = (data.items || []).slice(0, 24)
      const lis = items
        .map((it: { id: string; url: string; title: string; titleZh?: string; source: string }) => {
          const title = it.titleZh || it.title
          return `<li><a href="#/p/${escapeHtml(it.id)}">${escapeHtml(title)}</a> — ${escapeHtml(it.source)}</li>`
        })
        .join('')
      const block = `<noscript><section><h1>全球AI速递</h1><p>需要 JavaScript 以打开站内中文速读。以下为最新头条：</p><ol>${lis}</ol></section></noscript>`
      return html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${block}`)
    },
  }
}

export default defineConfig({
  base: '/global-ai-digest/',
  plugins: [react(), headlineInject()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
