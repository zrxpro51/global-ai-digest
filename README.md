# 全球AI速递

中文优先的全球人工智能新闻速览。构建时抓取公开 RSS/Atom，编译中文标题、总结与分析，静态部署到 GitHub Pages。

- 站点：https://zrxpro51.github.io/global-ai-digest/
- 点卡片进入站内中文速读；文末「阅读原文」才跳转源站
- 每 6 小时由 GitHub Actions 重新抓取、翻译并发布

## 本地

安装依赖后执行 `npm run build`（会先抓取订阅源、编译中文速读，再打包静态站点）。

本地化由 scripts/localize.mjs 在每次构建时运行（GitHub Actions 每 6 小时一次）。无 API key，使用 Google gtx；中文源不复译。
