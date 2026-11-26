/**
 * Search-engine and AI-crawler metadata for the prerendered pages.
 *
 * The app renders client-side only (`ssr = false`), so the HTML a crawler
 * fetches has an empty body. scripts/seo.mjs runs after `vite build` and uses
 * these pure helpers to write each page's title, description, canonical URL,
 * Open Graph / Twitter tags and JSON-LD into its <head>, a static description
 * into its <noscript>, and robots.txt, sitemap.xml and llms.txt next to them.
 */

/**
 * @typedef SeoRoute
 * @prop {'playground' | 'notebook' | 'plfa'} id
 * @prop {string} path - URL path, '/'-rooted, no trailing slash except '/'
 * @prop {string} file - prerendered HTML file in the build directory
 * @prop {string} title
 * @prop {string} description - one or two sentences, for <meta> and cards
 * @prop {string} intro - the opening paragraph of the <noscript> text
 * @prop {string[]} features
 */

/** @type {readonly SeoRoute[]} */
export const seoRoutes = Object.freeze([
  {
    id: 'playground',
    path: '/',
    file: 'index.html',
    title: 'Agda Playground',
    description: 'Write, type-check and interact with Agda in your browser, with nothing to install: Agda and its language server run locally through WebAssembly.',
    intro: 'Agda Playground is a single-file Agda editor that runs entirely in your browser. Agda and the Agda Language Server are compiled to WebAssembly and run on your own machine, so there is nothing to install and no server checks your code.',
    features: [
      'Load a file and work with its goals: give, refine, case split, auto, and goal type and context, with the usual Emacs-mode key bindings (C-c C-l, C-c C-SPC, C-c C-c, ...).',
      'Unicode input as in Emacs: type \\to for →, \\bN for ℕ, \\== for ≡.',
      'The standard library and other libraries, ready to import.',
      'Examples to start from, and Open / Export for your own .agda files.',
    ],
  },
  {
    id: 'notebook',
    path: '/literate',
    file: 'literate.html',
    title: 'Agda Notebook',
    description: 'A Jupyter-style notebook for Agda in your browser: interleave Markdown and Agda cells, type-check them in place, and import or export a .lagda.md file.',
    intro: 'Agda Notebook is a Jupyter-style notebook for literate Agda, running entirely in your browser. A document is a sequence of Markdown and Agda cells; running a command in a code cell checks everything up to and including that cell.',
    features: [
      'Markdown cells with math, and Agda code cells with goals and highlighting.',
      'Import and export a whole .lagda.md file.',
      'The same Agda commands and key bindings as Agda Playground.',
    ],
  },
  {
    id: 'plfa',
    path: '/plfa',
    file: 'plfa.html',
    title: 'PLFA Notebook',
    description: 'Read and work through Programming Language Foundations in Agda (PLFA) chapter by chapter in your browser, with every exercise type-checked live.',
    intro: 'PLFA Notebook opens the chapters of Programming Language Foundations in Agda, by Philip Wadler, Wen Kokke and Jeremy G. Siek, as interactive Agda notebooks. Each chapter loads with the rest of the book available, so you can do the exercises and type-check them without installing Agda.',
    features: [
      'Every chapter of PLFA, with its prose and its Agda code.',
      'Precompiled library: the first load of a chapter takes seconds, not minutes.',
      'The book itself, and its license, are at plfa.github.io.',
    ],
  },
])

const SOURCE_URL = 'https://github.com/jim9292bb/agda-playground'
const AGDA_URL = 'https://agda.readthedocs.io/'
const PLFA_URL = 'https://plfa.github.io/'

/**
 * The site's public origin, or null when none is known (then canonical URLs,
 * og:url, og:image and the sitemap are left out). SITE_URL wins; on Vercel
 * the production domain is used.
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function siteUrlFromEnv(env) {
  const explicit = env.SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  return null
}

/** @param {string} text */
export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * @param {string | null} siteUrl
 * @param {string} path
 */
function absolute(siteUrl, path) {
  return siteUrl ? siteUrl + (path === '/' ? '/' : path) : null
}

/**
 * A link from one prerendered page to another, relative so it works under
 * any base path (e.g. GitHub Pages' /agda-playground).
 * @param {string} path
 */
function relativeHref(path) {
  return path === '/' ? './' : `.${path}`
}

/**
 * @typedef SeoContext
 * @prop {string | null} siteUrl
 * @prop {readonly SeoRoute[]} routes - the routes this deployment serves
 * @prop {string[]} agdaVersions
 * @prop {string[]} environments - human-readable environment labels
 */

/**
 * The tags to add to a page's <head> (its <title> is replaced separately).
 * @param {SeoRoute} route
 * @param {SeoContext} context
 */
export function headTags(route, context) {
  const url = absolute(context.siteUrl, route.path)
  const image = absolute(context.siteUrl, '/og-image.png')
  const tags = [
    `<meta name="description" content="${escapeHtml(route.description)}">`,
    url && `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Agda Playground">`,
    `<meta property="og:title" content="${escapeHtml(route.title)}">`,
    `<meta property="og:description" content="${escapeHtml(route.description)}">`,
    url && `<meta property="og:url" content="${escapeHtml(url)}">`,
    image && `<meta property="og:image" content="${escapeHtml(image)}">`,
    image && `<meta property="og:image:width" content="1200">`,
    image && `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}">`,
    image && `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<script type="application/ld+json">${jsonLd(route, context)}</script>`,
  ]
  return tags.filter(Boolean).join('\n    ')
}

/**
 * schema.org WebApplication data for a page, as JSON safe to inline in a
 * <script> element.
 * @param {SeoRoute} route
 * @param {SeoContext} context
 */
export function jsonLd(route, context) {
  /** @type {Record<string, unknown>} */
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: route.title,
    description: route.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any (runs in a web browser)',
    browserRequirements: 'Requires JavaScript and WebAssembly',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    about: { '@type': 'ComputerLanguage', name: 'Agda', url: AGDA_URL },
  }
  const url = absolute(context.siteUrl, route.path)
  if (url) data.url = url
  if (context.agdaVersions.length > 0) data.softwareVersion = context.agdaVersions.map(v => `Agda ${v}`).join(', ')
  if (route.id === 'plfa') {
    data.isBasedOn = {
      '@type': 'Book',
      name: 'Programming Language Foundations in Agda',
      url: PLFA_URL,
      author: ['Philip Wadler', 'Wen Kokke', 'Jeremy G. Siek'].map(name => ({ '@type': 'Person', name })),
    }
  }
  // `<` can't end the script early once escaped; JSON stays valid.
  return JSON.stringify(data).replaceAll('<', '\\u003c')
}

/**
 * The static text a crawler (or a browser without JavaScript) sees in place
 * of the app: what the page is, what it does, and links to the other apps.
 * @param {SeoRoute} route
 * @param {SeoContext} context
 */
export function noscriptHtml(route, context) {
  const others = context.routes.filter(other => other.id !== route.id)
  const parts = [
    `<h1>${escapeHtml(route.title)}</h1>`,
    `<p>${escapeHtml(route.intro)}</p>`,
    `<ul>${route.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>`,
  ]
  if (context.environments.length > 0) {
    parts.push(`<p>Available environments: ${context.environments.map(escapeHtml).join('; ')}.</p>`)
  }
  if (route.id === 'plfa') {
    parts.push(`<p>The book: <a href="${PLFA_URL}">Programming Language Foundations in Agda</a>.</p>`)
  }
  if (others.length > 0) {
    parts.push(`<p>Also here: ${others.map(other => `<a href="${relativeHref(other.path)}">${escapeHtml(other.title)}</a>`).join(', ')}.</p>`)
  }
  parts.push(`<p>This page needs JavaScript and WebAssembly to run Agda. Source code: <a href="${SOURCE_URL}">${SOURCE_URL.replace('https://', '')}</a>.</p>`)
  return `<noscript>${parts.join('')}</noscript>`
}

/** @param {string | null} siteUrl */
export function robotsTxt(siteUrl) {
  return ['User-agent: *', 'Allow: /', ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : [])].join('\n') + '\n'
}

/**
 * @param {string} siteUrl
 * @param {readonly SeoRoute[]} routes
 */
export function sitemapXml(siteUrl, routes) {
  const urls = routes.map(route => `  <url><loc>${escapeHtml(/** @type {string} */ (absolute(siteUrl, route.path)))}</loc></url>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>'].join('\n') + '\n'
}

/**
 * llms.txt (https://llmstxt.org): a Markdown summary of the site for AI tools.
 * @param {SeoContext} context
 * @param {{ label: string, bindings: { label: string }[] }[]} commands
 */
export function llmsTxt(context, commands) {
  const link = (/** @type {string} */ path) => absolute(context.siteUrl, path) ?? path
  const lines = [
    '# Agda Playground',
    '',
    '> Agda in the browser, with nothing to install: Agda and the Agda Language Server are compiled to WebAssembly and run locally. A single-file playground, a Jupyter-style notebook for literate Agda, and an interactive edition of Programming Language Foundations in Agda (PLFA).',
    '',
    'It is meant for demonstrations, learning and practice: one file (or one notebook) at a time, not multi-file projects. Code is checked in the browser; nothing is sent to a server.',
    '',
    '## Apps',
    '',
    ...context.routes.map(route => `- [${route.title}](${link(route.path)}): ${route.description}`),
    '',
  ]
  if (context.environments.length > 0) {
    lines.push('## Environments', '', ...context.environments.map(label => `- ${label}`), '')
  }
  if (commands.length > 0) {
    lines.push(
      '## Agda commands',
      '',
      'The usual Agda Emacs-mode commands and key bindings, also listed in the Commands menu:',
      '',
      ...commands.map(command => `- ${command.label}${command.bindings.length ? `: ${command.bindings.map(b => b.label).join(', ')}` : ''}`),
      '',
    )
  }
  lines.push(
    '## Links',
    '',
    `- [Source code](${SOURCE_URL}): forked from agda-web/als-demo`,
    `- [Agda documentation](${AGDA_URL})`,
    `- [Programming Language Foundations in Agda](${PLFA_URL})`,
    '',
  )
  return lines.join('\n')
}

/**
 * Rewrites one prerendered page: its <title>, the tags before </head>, and
 * its <noscript>.
 * @param {string} html
 * @param {SeoRoute} route
 * @param {SeoContext} context
 * @param {{ noindex?: boolean }} [options]
 */
export function rewritePage(html, route, context, options = {}) {
  const head = [headTags(route, context), options.noindex ? '<meta name="robots" content="noindex">' : ''].filter(Boolean).join('\n    ')
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
  out = out.replace('</head>', `    ${head}\n  </head>`)
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/, noscriptHtml(route, context))
  return out
}
