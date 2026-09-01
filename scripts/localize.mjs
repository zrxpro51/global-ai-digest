/**
 * Build-time Chinese localization for 全球AI速递.
 * No API keys: Google gtx translate, plus native-Chinese templates.
 * Skips double-translation when the source is already CJK (e.g. 量子位).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const newsPath = join(root, 'public', 'news.json')
const metaPath = join(root, 'news-meta.json')

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/g
const GTX =
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q='

const cache = new Map()
const failures = []

function cjkCount(s) {
  return (String(s || '').match(CJK_RE) || []).length
}

function isMostlyChinese(s) {
  const str = String(s || '')
  const cjk = cjkCount(str)
  if (cjk < 4) return false
  const letters = (str.match(/[A-Za-z]/g) || []).length
  return cjk >= letters * 0.55 || cjk / Math.max(str.replace(/\s/g, '').length, 1) >= 0.28
}

function polishZh(s) {
  return String(s || '')
    .replace(/Failed to fetch[^.。]*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/被指控被指控/g, '被指控')
    .replace(/的的/g, '的')
    .replace(/\s+([，。！？；：、])/g, '$1')
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。.]{2,}/g, '。')
    .replace(/^[，。、\s]+/, '')
    .trim()
}

function clip(s, n) {
  const t = String(s || '').trim()
  if (t.length <= n) return t
  return t.slice(0, n).replace(/\s+\S*$/, '').replace(/[，,、；;：:\s]+$/, '') + '…'
}

function firstSentences(s, max = 2) {
  const parts = String(s || '')
    .split(/(?<=[。])\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!parts.length) return String(s || '').trim()
  return parts.slice(0, max).join('')
}

function accordingTo(source) {
  return /[A-Za-z]/.test(String(source || '')) ? `据 ${source} 公开信息` : `据${source}公开信息`
}

function prepEnglish(s) {
  return String(s || '')
    .replace(/Jeopardy!/g, '《危险边缘》')
    .replace(/\bJeopardy\b/g, '《危险边缘》')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function translateOnce(text) {
  const src = String(text || '').trim()
  if (!src) return { ok: false, text: '', reason: 'empty' }
  if (isMostlyChinese(src)) return { ok: true, text: polishZh(src), skipped: true }
  if (cache.has(src)) return { ok: true, text: cache.get(src) }

  const q = prepEnglish(src).slice(0, 1400)
  const url = GTX + encodeURIComponent(q)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'GlobalAIDigest/1.0 (+https://github.com/zrxpro51/global-ai-digest)',
        Accept: 'application/json, text/plain, */*',
      },
    })
    if (!res.ok) return { ok: false, text: '', reason: `HTTP ${res.status}` }
    const json = await res.json()
    const chunks = Array.isArray(json?.[0]) ? json[0] : []
    const out = polishZh(chunks.map((c) => c?.[0] || '').join(''))
    if (!out || !cjkCount(out)) {
      return { ok: false, text: '', reason: 'no-cjk-result' }
    }
    cache.set(src, out)
    return { ok: true, text: out }
  } catch (err) {
    const reason =
      err?.name === 'AbortError' ? 'timeout' : String(err?.message || err)
    return { ok: false, text: '', reason }
  } finally {
    clearTimeout(timer)
  }
}

async function translate(text, { retries = 2 } = {}) {
  let last = { ok: false, text: '', reason: 'unknown' }
  for (let i = 0; i <= retries; i++) {
    last = await translateOnce(text)
    if (last.ok) return last
    await sleep(250 * (i + 1))
  }
  return last
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
      await sleep(90)
    }
  }
  const n = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: n }, worker))
  return out
}

const WHO = {
  openai: 'OpenAI 的产品、研究与商业团队，以及把 GPT / ChatGPT / Codex 接到自己系统里的开发者和客户',
  deepmind: 'Google DeepMind 与 Gemini 生态的研究者、开发者和合作机构',
  'google-ai': '使用 Google 搜索、Workspace 或 Gemini 产品的用户与开发者',
  huggingface: '在 Hugging Face 上发模型、做评测或搭推理服务的开源社区',
  'arxiv-ai': '人工智能方向的研究者，以及跟进预印本的工程师',
  'arxiv-cl': '自然语言处理与计算语言学方向的研究者',
  techcrunch: '关注融资、产品和产业竞争的创业与投资读者',
  verge: '消费科技与平台政策的一般读者',
  github: '在 GitHub 上写代码、用 Copilot 或维护仓库的开发者',
  mittr: '关心技术社会影响、政策与长期风险的读者',
  qbitai: '跟进国内产业、模型和资本节奏的中文科技读者',
  anthropic: 'Anthropic / Claude 生态的客户与安全研究者',
  jiqizhixin: '中文 AI 产业与研究读者',
  '36kr': '国内创投与产业观察者',
}

function analysisParagraphs({ source, sourceId, category, titleZh, hasExcerpt }) {
  const who = WHO[sourceId] || `${source} 的读者，以及正在跟进「${category}」方向的从业者`
  const mean = {
    大模型: `意味着什么：大模型能力、开放范围或商业化节奏又有新的公开口径。${source} 把消息落在「${titleZh}」，说明相关实验室或产品团队希望外界按这个叙事理解进展，而不是把它当成一条普通功能更新。`,
    研究: `意味着什么：这是研究向信号，未必立刻改写产品，却会影响评测标准、方法路线和下一批工作的问题意识。对做${category}的人来说，价值在于方向，而不是把摘要当成可上线的说明书。`,
    产品: `意味着什么：${source} 披露了与产品、功能或公司运营相关的公开信息，焦点是「${titleZh}」。对用户和从业者，这有助于判断相关工具或公司在做什么，但不等于功能已经全面上线，也不等于调查或交易已经有定论。`,
    开源: `意味着什么：权重、工具链或工作流出现了可复用的新选项。维护者可以评估要不要接入现有流水线，但许可证、依赖和真实评测比标题热度更重要。`,
    业界: `意味着什么：这是产业、资本或政策语境里的动态，不一定带来新模型，却可能改写谁能用、谁付钱、谁被限制。采购、监管和竞争格局的观察者应把它当作环境变化，而不是单条产品发布。`,
  }
  const watch = hasExcerpt
    ? `该注意什么：RSS 标题和摘要不是完整报道，宣传稿更会强调进展、淡化限制。凡是标题或摘要里没有出现的数字、引语、排期，本站一律不写进分析。要核对方法、条款或原话，请自行打开「阅读原文」。`
    : `该注意什么：订阅源几乎没有提供摘要，目前只能从标题判断主题。不要把标题推演成已证实的规格、财务数字或上线承诺，细节以原文为准。`

  return [
    mean[category] || mean.业界,
    `和谁有关：首先是${who}。标题里点到的机构、产品或研究方向，是这条消息的直接利益相关方；相邻赛道的人则可以把它当作对照样本。`,
    watch,
  ]
}

function fallbackTitle(item) {
  return `${item.source}的${item.category}速读`
}

function buildSummaryZh({ source, category, titleZh, excerptZh, titleOriginal, usedTranslate, chineseSource }) {
  const head = `${accordingTo(source)}，这则${category}消息的核心是：${titleZh}。`
  let body = excerptZh && excerptZh !== titleZh ? firstSentences(excerptZh, 2) : ''
  if (body && !/[。！？…]$/.test(body)) body += '。'
  if (!body) {
    body = chineseSource
      ? '源站摘要较短，主体信息已体现在标题里，完整细节见原文。'
      : '订阅源没有给出可用的独立摘要，目前只能从标题判断主题，完整说明见原文。'
  }
  const tail = usedTranslate
    ? '本站根据标题与摘要做中文速读，不添加原文未出现的数字、引语或结论。'
    : `自动翻译暂不可用，以上根据英文事实用中文转述。原标题为「${titleOriginal}」。`
  return `${head}${body}${tail}`
}

function buildBlurb(titleZh, excerptZh, summaryZh) {
  if (excerptZh) {
    const stripped = excerptZh.split(titleZh).join(' ').replace(/\s+/g, ' ').trim()
    const text = stripped.length > 18 ? stripped : excerptZh
    return clip(text, 92)
  }
  return clip(summaryZh || titleZh, 92)
}

async function localizeItem(item) {
  const titleOriginal = item.titleOriginal || item.title
  const sourceUrl = item.sourceUrl || item.url
  const excerpt = String(item.summary || '').replace(/Failed to fetch[^.。]*/gi, '').trim()
  const chineseSource = isMostlyChinese(titleOriginal)

  let titleZh = chineseSource ? polishZh(titleOriginal) : ''
  let excerptZh = isMostlyChinese(excerpt) ? polishZh(excerpt) : ''
  let usedTranslate = chineseSource
  let failReason = ''

  if (!titleZh) {
    const tr = await translate(titleOriginal)
    if (tr.ok) {
      titleZh = tr.text
      usedTranslate = true
    } else {
      failReason = tr.reason
      titleZh = fallbackTitle(item)
    }
  }

  if (excerpt && !excerptZh) {
    const tr = await translate(excerpt)
    if (tr.ok) {
      excerptZh = tr.text
      usedTranslate = true
    } else if (!failReason) {
      failReason = tr.reason
    }
  }

  if (failReason) {
    failures.push({ id: item.id, title: titleOriginal, reason: failReason })
  }

  const summaryZh = buildSummaryZh({
    source: item.source,
    category: item.category,
    titleZh,
    excerptZh:
      excerptZh ||
      (excerpt && !usedTranslate
        ? `公开摘要原文提到：${clip(excerpt, 180)}`
        : ''),
    titleOriginal,
    usedTranslate: usedTranslate && !failReason,
    chineseSource,
  })

  const analysisZh = analysisParagraphs({
    source: item.source,
    sourceId: item.sourceId,
    category: item.category,
    titleZh,
    hasExcerpt: Boolean(excerpt || excerptZh),
  })

  return {
    ...item,
    titleOriginal,
    sourceUrl,
    titleZh,
    summaryZh,
    blurbZh: buildBlurb(titleZh, excerptZh, summaryZh),
    analysisZh,
  }
}

async function main() {
  const raw = await readFile(newsPath, 'utf8')
  const payload = JSON.parse(raw)
  const items = payload.items || []
  console.log(`Localizing ${items.length} items…`)

  const localized = await mapPool(items, 4, localizeItem)

  payload.items = localized
  payload.localizedAt = new Date().toISOString()
  payload.localize = {
    total: localized.length,
    withTitleZh: localized.filter((x) => x.titleZh && cjkCount(x.titleZh) >= 2).length,
    failed: failures.length,
    failures: failures.slice(0, 40),
  }

  await writeFile(newsPath, JSON.stringify(payload))

  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    meta.localize = payload.localize
    meta.localizedAt = payload.localizedAt
    await writeFile(metaPath, JSON.stringify(meta, null, 2))
  } catch {
    /* meta is optional */
  }

  const missing = localized.filter((x) => !x.titleZh || !x.summaryZh || !x.analysisZh?.length)
  if (missing.length) {
    console.warn(`Missing Zh fields on ${missing.length} items`)
  }
  console.log(
    `Localized ${localized.length}. Translate failures: ${failures.length}. Cache size: ${cache.size}`,
  )
  for (const f of failures.slice(0, 12)) {
    console.warn(`[translate-fail] ${f.id}: ${f.reason}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
