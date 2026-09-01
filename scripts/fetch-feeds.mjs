/**
 * Build-time RSS/Atom aggregator for 全球AI速递.
 * Failed feeds are skipped; the rest still ship.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const UA =
  'GlobalAIDigest/1.0 (+https://github.com/zrxpro51/global-ai-digest; news aggregator)'

const FEEDS = [
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', limit: 12 },
  { id: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', limit: 12 },
  { id: 'google-ai', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', limit: 10 },
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', limit: 10 },
  { id: 'arxiv-ai', name: 'arXiv cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI', limit: 8 },
  { id: 'arxiv-cl', name: 'arXiv cs.CL', url: 'https://rss.arxiv.org/rss/cs.CL', limit: 8 },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', limit: 10 },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', limit: 10 },
  { id: 'github', name: 'GitHub Blog', url: 'https://github.blog/ai-and-ml/feed/', limit: 8 },
  { id: 'mittr', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', limit: 8 },
  { id: 'qbitai', name: '量子位', url: 'https://www.qbitai.com/feed', limit: 12 },
  { id: 'anthropic', name: 'Anthropic', url: 'https://www.anthropic.com/news/rss.xml', limit: 8 },
  { id: 'jiqizhixin', name: '机器之心', url: 'https://www.jiqizhixin.com/rss', limit: 10 },
  { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', limit: 8 },
]

const CATEGORIES = ['大模型', '研究', '产品', '开源', '业界']

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
}

function stripHtml(s) {
  return decodeEntities(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inner(block, names) {
  for (const name of names) {
    const re = new RegExp(
      `<(?:[\\w]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${name}>`,
      'i',
    )
    const m = block.match(re)
    if (m) return decodeEntities(m[1]).trim()
  }
  return ''
}

function attrTag(block, tagName, attrName) {
  const re = new RegExp(
    `<(?:[\\w]+:)?${tagName}\\b([^>]*?)\\/?>`,
    'gi',
  )
  let m
  const hrefs = []
  while ((m = re.exec(block))) {
    const attrs = m[1] || ''
    const rel = (attrs.match(/rel=["']([^"']+)["']/i) || [])[1] || ''
    const href = (attrs.match(new RegExp(`${attrName}=["']([^"']+)["']`, 'i')) ||
      [])[1]
    if (href) hrefs.push({ rel, href: decodeEntities(href) })
  }
  const alt = hrefs.find((h) => /alternate/i.test(h.rel))
  return (alt || hrefs[0] || {}).href || ''
}

function summarize(text, max = 160) {
  const clean = stripHtml(text)
    .replace(/^arXiv:\S+\s+Announce Type:\s+\w+\s*/i, '')
    .replace(/^Abstract:\s*/i, '')
  if (!clean) return ''
  if (clean.length <= max) return clean
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

function categorize(feedId, title, summary, cats) {
  const blob = `${feedId} ${title} ${summary} ${cats}`.toLowerCase()
  if (
    /arxiv|paper|研究|论文|abstract|benchmark|dataset|transformer|alignment|reasoning|evaluation/.test(
      blob,
    ) &&
    (feedId.startsWith('arxiv') ||
      /paper|arxiv|研究|论文|benchmark|preprint/.test(blob))
  ) {
    return '研究'
  }
  if (
    /open.?source|huggingface|github|gemma|llama|oss|开源|weights|model card/.test(
      blob,
    )
  ) {
    return '开源'
  }
  if (
    /gpt|claude|gemini|llm|大模型|foundation model|omni|chatgpt/.test(blob)
  ) {
    return '大模型'
  }
  if (
    /launch|product|app|release|api|feature|产品|发布|ads|cursor|codex/.test(
      blob,
    )
  ) {
    return '产品'
  }
  if (feedId.startsWith('arxiv')) return '研究'
  if (feedId === 'huggingface' || feedId === 'github') return '开源'
  if (feedId === 'openai' || feedId === 'deepmind' || feedId === 'anthropic')
    return '大模型'
  return '业界'
}

function parseFeed(xml) {
  if (!xml || !xml.includes('<')) return []
  if (!/<(rss|feed|rdf:RDF)\b/i.test(xml.slice(0, 800))) return []

  const items = []
  const itemRe = /<item\b[\s\S]*?<\/item>/gi
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi
  const blocks = xml.match(itemRe) || xml.match(entryRe) || []

  for (const block of blocks) {
    const title = stripHtml(inner(block, ['title']))
    let link =
      stripHtml(inner(block, ['link', 'id'])) ||
      attrTag(block, 'link', 'href')
    if (link && !/^https?:/i.test(link)) {
      const href = attrTag(block, 'link', 'href')
      if (href) link = href
    }
    const guid = stripHtml(inner(block, ['guid', 'id']))
    const dateRaw =
      inner(block, [
        'pubDate',
        'published',
        'updated',
        'dc:date',
        'date',
      ]) || ''
    const desc =
      inner(block, [
        'description',
        'summary',
        'content:encoded',
        'content',
        'arxiv:comment',
      ]) || ''
    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter(Boolean)
      .join(' ')

    if (!title || !link) continue
    const publishedAt = dateRaw ? new Date(dateRaw) : new Date(0)
    items.push({
      title,
      link: link.trim(),
      guid: guid || link,
      publishedAt: Number.isNaN(publishedAt.getTime())
        ? new Date(0).toISOString()
        : publishedAt.toISOString(),
      summary: summarize(desc || title),
      extraCats: categories,
    })
  }
  return items
}

async function fetchOne(feed) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 18000)
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      return { feed, ok: false, error: `HTTP ${res.status}`, items: [] }
    }
    const xml = await res.text()
    const parsed = parseFeed(xml).slice(0, feed.limit)
    if (!parsed.length) {
      return { feed, ok: false, error: 'no items (not RSS/Atom?)', items: [] }
    }
    return { feed, ok: true, error: null, items: parsed }
  } catch (err) {
    return {
      feed,
      ok: false,
      error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err),
      items: [],
    }
  } finally {
    clearTimeout(timer)
  }
}

function hashId(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

async function main() {
  const results = await Promise.all(FEEDS.map(fetchOne))
  const failed = []
  const succeeded = []
  const seen = new Set()
  const items = []

  for (const r of results) {
    if (!r.ok) {
      failed.push({ id: r.feed.id, name: r.feed.name, url: r.feed.url, error: r.error })
      console.warn(`[skip] ${r.feed.name}: ${r.error}`)
      continue
    }
    succeeded.push({ id: r.feed.id, name: r.feed.name, count: r.items.length })
    console.log(`[ok] ${r.feed.name}: ${r.items.length} items`)
    for (const it of r.items) {
      const key = (it.link || it.guid).split('?')[0].replace(/\/$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const category = categorize(
        r.feed.id,
        it.title,
        it.summary,
        it.extraCats,
      )
      items.push({
        id: hashId(key),
        title: it.title,
        source: r.feed.name,
        sourceId: r.feed.id,
        category: CATEGORIES.includes(category) ? category : '业界',
        publishedAt: it.publishedAt,
        summary: it.summary,
        url: it.link,
      })
    }
  }

  items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  const payload = {
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    feedsOk: succeeded,
    feedsFailed: failed,
    items,
  }

  const outDir = join(root, 'public')
  await mkdir(outDir, { recursive: true })
  const json = JSON.stringify(payload)
  await writeFile(join(outDir, 'news.json'), json)
  await writeFile(join(root, 'news-meta.json'), JSON.stringify({
    generatedAt: payload.generatedAt,
    itemCount: payload.itemCount,
    feedsOk: succeeded,
    feedsFailed: failed,
  }, null, 2))
  console.log(`Wrote ${items.length} items. Failed feeds: ${failed.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
