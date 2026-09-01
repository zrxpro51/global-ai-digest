import { useEffect, useMemo, useState } from 'react'

type Category = '大模型' | '研究' | '产品' | '开源' | '业界'

type NewsItem = {
  id: string
  title: string
  titleOriginal?: string
  titleZh?: string
  source: string
  sourceId: string
  category: Category
  publishedAt: string
  summary: string
  summaryZh?: string
  blurbZh?: string
  analysisZh?: string[]
  url: string
  sourceUrl?: string
}

type NewsPayload = {
  generatedAt: string
  itemCount: number
  feedsOk: { id: string; name: string; count: number }[]
  feedsFailed: { id: string; name: string; error: string }[]
  items: NewsItem[]
}

type Route =
  | { name: 'home' }
  | { name: 'about' }
  | { name: 'article'; id: string }

const CATS: Array<'全部' | Category> = ['全部', '大模型', '研究', '产品', '开源', '业界']

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/'
  if (h.startsWith('/about')) return { name: 'about' }
  const m = h.match(/^\/p\/([^/?#]+)/)
  if (m) return { name: 'article', id: decodeURIComponent(m[1]) }
  return { name: 'home' }
}

function formatTime(iso: string) {
  const t = new Date(iso).getTime()
  if (!t) return '时间未知'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(t))
}

function mastheadDate() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date())
}

function displayTitle(it: NewsItem) {
  return it.titleZh || it.title
}

function displayBlurb(it: NewsItem) {
  if (it.blurbZh) return it.blurbZh
  const s = it.summaryZh || ''
  if (s.length <= 96) return s
  return s.slice(0, 96).replace(/\s+\S*$/, '') + '…'
}

function sourceLink(it: NewsItem) {
  return it.sourceUrl || it.url
}

function analysisList(it: NewsItem): string[] {
  if (Array.isArray(it.analysisZh) && it.analysisZh.length) return it.analysisZh
  if (typeof it.analysisZh === 'string' && (it.analysisZh as string).trim()) {
    return (it.analysisZh as string).split(/\n{2,}/).filter(Boolean)
  }
  return []
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute())
  const [menuOpen, setMenuOpen] = useState(false)
  const [data, setData] = useState<NewsPayload | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'全部' | Category>('全部')

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute())
      setMenuOpen(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}news.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`news.json ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const article = useMemo(() => {
    if (route.name !== 'article' || !data) return null
    return data.items.find((it) => it.id === route.id) || null
  }, [route, data])

  useEffect(() => {
    if (route.name === 'article' && article) {
      document.title = `${displayTitle(article)} — 全球AI速递`
    } else if (route.name === 'about') {
      document.title = '关于 — 全球AI速递'
    } else {
      document.title = '全球AI速递 — 一分钟看完全球人工智能新闻'
    }
  }, [route, article])

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    const query = q.trim().toLowerCase()
    return items.filter((it) => {
      if (cat !== '全部' && it.category !== cat) return false
      if (!query) return true
      const hay = [
        it.titleZh,
        it.summaryZh,
        it.blurbZh,
        ...(it.analysisZh || []),
        it.titleOriginal,
        it.title,
        it.summary,
        it.source,
        it.category,
      ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase()
      return hay.includes(query)
    })
  }, [data, q, cat])

  const featured = filtered[0]
  const rest = filtered.slice(1)
  const page = route.name

  return (
    <>
      <a className="skip" href="#main">
        跳到正文
      </a>
      <header className="site-header">
        <div className="shell header-row">
          <a className="brand" href="#/">
            <span className="mark" aria-hidden>
              速
            </span>
            <span>
              <span className="brand-name">全球AI速递</span>
              <span className="brand-sub">NIGHT GAZETTE</span>
            </span>
          </a>
          <button
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-label="打开导航"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '关闭' : '菜单'}
          </button>
          <nav className={`nav ${menuOpen ? 'open' : ''}`} aria-label="主导航">
            <a className={page === 'home' ? 'active' : ''} href="#/">
              头条
            </a>
            <a className={page === 'about' ? 'active' : ''} href="#/about">
              关于
            </a>
            <a href="https://github.com/zrxpro51/global-ai-digest" target="_blank" rel="noreferrer">
              源码
            </a>
          </nav>
        </div>
      </header>

      <main id="main" className="shell">
        {page === 'about' ? (
          <About data={data} />
        ) : page === 'article' ? (
          <ArticleView
            item={article}
            loading={!data && !error}
            error={error}
            notFound={Boolean(data && !article)}
          />
        ) : (
          <>
            <section className="masthead">
              <p className="kicker">全球人工智能晚报</p>
              <h1>一分钟看完今天的 AI</h1>
              <p className="lede">
                从实验室到产品一线：OpenAI、DeepMind、Hugging Face、arXiv 与中文科技媒体的公开头条。点卡片看本站中文速读；原文自行打开。
              </p>
              <div className="meta-line">
                <span>{mastheadDate()}</span>
                <span>
                  {data
                    ? `本轮收录 ${data.itemCount} 条 · ${data.feedsOk.length} 个来源`
                    : '正在载入头条…'}
                </span>
              </div>
            </section>

            <div className="toolbar">
              <label className="search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索中文标题、总结、分析或来源"
                  aria-label="搜索新闻"
                />
              </label>
              <div className="chips" role="toolbar" aria-label="分类筛选">
                {CATS.map((c) => (
                  <button
                    key={c}
                    className="chip"
                    aria-pressed={cat === c}
                    onClick={() => setCat(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="empty">无法载入新闻：{error}</p>}
            {!error && !data && <p className="empty">正在汇集全球头条…</p>}
            {data && filtered.length === 0 && (
              <p className="empty">没有匹配的条目，换个关键词或分类试试。</p>
            )}

            {featured && (
              <section className="featured" aria-label="头条">
                <article className="hero hero-story">
                  <div className="row-meta">
                    <span className={`cat ${featured.category}`}>{featured.category}</span>
                    <span>{featured.source}</span>
                    <time dateTime={featured.publishedAt}>{formatTime(featured.publishedAt)}</time>
                  </div>
                  <h2>
                    <a href={`#/p/${featured.id}`}>{displayTitle(featured)}</a>
                  </h2>
                  <p className="summary">{displayBlurb(featured)}</p>
                </article>
                <aside className="hero">
                  <p className="kicker">速览</p>
                  <h2 style={{ fontSize: '1.25rem' }}>点卡片看本站中文速读</h2>
                  <p className="summary">
                    每张卡片进入站内整理：中文标题、总结与分析。想核对原话或完整报道，再到文末自行打开「阅读原文」。
                  </p>
                  <p className="summary">
                    当前筛选 {filtered.length} 条
                    {cat !== '全部' ? ` · ${cat}` : ''}
                    {q ? ` · 「${q}」` : ''}
                  </p>
                </aside>
              </section>
            )}

            {rest.length > 0 && (
              <section className="grid" aria-label="新闻列表">
                {rest.map((it) => (
                  <article className="card" key={it.id}>
                    <div className="row-meta">
                      <span className={`cat ${it.category}`}>{it.category}</span>
                      <span>{it.source}</span>
                      <time dateTime={it.publishedAt}>{formatTime(it.publishedAt)}</time>
                    </div>
                    <h3>
                      <a href={`#/p/${it.id}`}>{displayTitle(it)}</a>
                    </h3>
                    <p className="summary">{displayBlurb(it)}</p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="shell">
          全球AI速递是非官方聚合站点，仅用于个人阅读与信息索引。点卡片看本站中文速读；原文自行打开。
          {' '}
          <a href="#/about">免责声明</a>
        </div>
      </footer>
    </>
  )
}

function ArticleView({
  item,
  loading,
  error,
  notFound,
}: {
  item: NewsItem | null
  loading: boolean
  error: string
  notFound: boolean
}) {
  if (error) return <p className="empty">无法载入新闻：{error}</p>
  if (loading) return <p className="empty">正在打开速读…</p>
  if (notFound || !item) {
    return (
      <section className="article">
        <a className="back-link" href="#/">
          ← 返回头条
        </a>
        <h1>找不到这篇速读</h1>
        <p>可能已在最近一次刷新中更新。请回到头条重新打开。</p>
      </section>
    )
  }

  const original = item.titleOriginal || item.title
  const zh = displayTitle(item)
  const showOriginal = original && original !== zh
  const paras = analysisList(item)
  const href = sourceLink(item)

  return (
    <article className="article">
      <a className="back-link" href="#/">
        ← 返回头条
      </a>
      <p className="kicker">站内速读</p>
      <div className="row-meta">
        <span className={`cat ${item.category}`}>{item.category}</span>
        <span>{item.source}</span>
        <time dateTime={item.publishedAt}>{formatTime(item.publishedAt)}</time>
      </div>
      <h1>{zh}</h1>
      {showOriginal && <p className="orig-title">原标题 · {original}</p>}

      <section className="article-section" aria-labelledby="sec-summary">
        <h2 id="sec-summary">总结</h2>
        <p>{item.summaryZh || '订阅源未提供可用摘要，请直接阅读原文。'}</p>
      </section>

      <section className="article-section" aria-labelledby="sec-analysis">
        <h2 id="sec-analysis">分析</h2>
        {paras.length ? paras.map((p, i) => <p key={i}>{p}</p>) : <p>分析整理中。</p>}
      </section>

      <p className="origin-wrap">
        <a className="read-origin ext" href={href} target="_blank" rel="noreferrer">
          阅读原文
        </a>
        <span className="origin-hint">在新标签页打开 {item.source}</span>
      </p>
    </article>
  )
}

function About({ data }: { data: NewsPayload | null }) {
  return (
    <section className="about">
      <p className="kicker">ABOUT</p>
      <h1>关于全球AI速递</h1>
      <p>
        这是一份中文优先的全球人工智能新闻速览。目标很简单：打开页面，一分钟内跟上实验室、开源社区和产业前线正在发生的事。
      </p>
      <p>
        点卡片看本站中文速读（总结 + 分析）；原文自行打开。本站在构建时抓取公开 RSS / Atom 源，生成静态 JSON，再部署到 GitHub Pages。没有登录，没有推荐算法，也没有发明出来的阅读量。
      </p>
      <h2>免责声明</h2>
      <ul>
        <li>本站是聚合器，不是原创新闻机构；版权归各媒体与作者所有。</li>
        <li>中文标题、总结与分析根据公开订阅源的标题与摘要编译，可能不完整，也不替代原文。</li>
        <li>卡片进入本站速读页；需要原话与完整报道时，请点击文末「阅读原文」。</li>
        <li>部分源站可能暂时无法访问（防火墙、RSS 下线等），构建时会跳过失败源。</li>
      </ul>
      <h2>本轮来源</h2>
      <ul>
        {(data?.feedsOk ?? []).map((f) => (
          <li key={f.id}>
            {f.name}（{f.count} 条）
          </li>
        ))}
      </ul>
      {!!data?.feedsFailed?.length && (
        <>
          <h2>本轮未能抓取</h2>
          <ul>
            {data.feedsFailed.map((f) => (
              <li key={f.id}>
                {f.name}：{f.error}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        源码与定时刷新工作流：
        <a href="https://github.com/zrxpro51/global-ai-digest" target="_blank" rel="noreferrer">
          github.com/zrxpro51/global-ai-digest
        </a>
      </p>
    </section>
  )
}
