import { useEffect, useMemo, useState } from 'react'

type Category = '大模型' | '研究' | '产品' | '开源' | '业界'

type NewsItem = {
  id: string
  title: string
  source: string
  sourceId: string
  category: Category
  publishedAt: string
  summary: string
  url: string
}

type NewsPayload = {
  generatedAt: string
  itemCount: number
  feedsOk: { id: string; name: string; count: number }[]
  feedsFailed: { id: string; name: string; error: string }[]
  items: NewsItem[]
}

const CATS: Array<'全部' | Category> = ['全部', '大模型', '研究', '产品', '开源', '业界']

function route(): 'home' | 'about' {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/about') ? 'about' : 'home'
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

export default function App() {
  const [page, setPage] = useState<'home' | 'about'>(route())
  const [menuOpen, setMenuOpen] = useState(false)
  const [data, setData] = useState<NewsPayload | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'全部' | Category>('全部')

  useEffect(() => {
    const onHash = () => {
      setPage(route())
      setMenuOpen(false)
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

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    const query = q.trim().toLowerCase()
    return items.filter((it) => {
      if (cat !== '全部' && it.category !== cat) return false
      if (!query) return true
      return (
        it.title.toLowerCase().includes(query) ||
        it.summary.toLowerCase().includes(query) ||
        it.source.toLowerCase().includes(query)
      )
    })
  }, [data, q, cat])

  const featured = filtered[0]
  const rest = filtered.slice(1)

  return (
    <>
      <a className="skip" href="#main">
        跳到正文
      </a>
      <header className="site-header">
        <div className="shell header-row">
          <a className="brand" href="#/" onClick={() => setPage('home')}>
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
        ) : (
          <>
            <section className="masthead">
              <p className="kicker">全球人工智能晚报</p>
              <h1>一分钟看完今天的 AI</h1>
              <p className="lede">
                从实验室到产品一线：OpenAI、DeepMind、Hugging Face、arXiv 与中文科技媒体的公开头条，杂志式速览，点标题直达原文。
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
                  placeholder="搜索标题、来源或摘要"
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
                <article className="hero">
                  <div className="row-meta">
                    <span className={`cat ${featured.category}`}>{featured.category}</span>
                    <span>{featured.source}</span>
                    <time dateTime={featured.publishedAt}>{formatTime(featured.publishedAt)}</time>
                  </div>
                  <h2>
                    <a className="ext" href={featured.url} target="_blank" rel="noreferrer">
                      {featured.title}
                    </a>
                  </h2>
                  <p className="summary">{featured.summary}</p>
                </article>
                <aside className="hero">
                  <p className="kicker">速览</p>
                  <h2 style={{ fontSize: '1.25rem' }}>不必翻完时间线</h2>
                  <p className="summary">
                    构建时抓取公开 RSS/Atom，静态托管。每 6 小时自动刷新。本站是聚合器，版权归原媒体。
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
                      <a className="ext" href={it.url} target="_blank" rel="noreferrer">
                        {it.title}
                      </a>
                    </h3>
                    <p className="summary">{it.summary}</p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="shell">
          全球AI速递是非官方聚合站点，仅用于个人阅读与信息索引。所有标题与摘要来自公开订阅源，点击跳转原文。
          {' '}
          <a href="#/about">免责声明</a>
        </div>
      </footer>
    </>
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
        本站在构建时抓取公开 RSS / Atom 源，生成静态 JSON，再部署到 GitHub Pages。没有登录，没有推荐算法，也没有发明出来的阅读量。
      </p>
      <h2>免责声明</h2>
      <ul>
        <li>本站是聚合器，不是原创新闻机构；版权归各媒体与作者所有。</li>
        <li>摘要尽量取自源站提供的 description / abstract，可能不完整。</li>
        <li>链接一律指向原文。请以原站内容为准。</li>
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
