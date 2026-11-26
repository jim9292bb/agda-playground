/// <reference types="vitest/globals" />

import { escapeHtml, jsonLd, llmsTxt, noscriptHtml, rewritePage, robotsTxt, seoRoutes, siteUrlFromEnv, sitemapXml } from './seo'

const SITE = 'https://agda-playground.vercel.app'
const [playground, notebook, plfa] = seoRoutes
const context = { siteUrl: SITE, routes: seoRoutes, agdaVersions: ['2.8.0', '2.7.0.1'], environments: ['Standard Library v2.3 (ALS 2.8.0)'] }
const shell = '<!DOCTYPE html><html><head><title>Agda Playground</title>\n  </head><body><div></div><noscript>old</noscript></body></html>'

describe('siteUrlFromEnv', () => {
  it('prefers SITE_URL, trimmed of trailing slashes', () => {
    expect(siteUrlFromEnv({ SITE_URL: 'https://example.org/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe('https://example.org')
  })

  it("falls back to Vercel's production domain", () => {
    expect(siteUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'agda-playground.vercel.app' })).toBe(SITE)
  })

  it('is null with neither, or an empty SITE_URL (an unset repository variable)', () => {
    expect(siteUrlFromEnv({})).toBeNull()
    expect(siteUrlFromEnv({ SITE_URL: '' })).toBeNull()
  })
})

describe('rewritePage', () => {
  it("sets the page's own title, description, canonical URL and cards", () => {
    const html = rewritePage(shell, notebook, context)
    expect(html).toContain('<title>Agda Notebook</title>')
    expect(html).not.toContain('<title>Agda Playground</title>')
    expect(html).toContain(`<link rel="canonical" href="${SITE}/literate">`)
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og-image.png">`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toContain(`<meta name="description" content="${escapeHtml(notebook.description)}">`)
    expect(html.indexOf('application/ld+json')).toBeLessThan(html.indexOf('</head>'))
  })

  it("puts the home page's canonical URL at the site root", () => {
    expect(rewritePage(shell, playground, context)).toContain(`<link rel="canonical" href="${SITE}/">`)
  })

  it('leaves out every absolute URL without a site URL', () => {
    const html = rewritePage(shell, playground, { ...context, siteUrl: null })
    expect(html).not.toContain('canonical')
    expect(html).not.toContain('og:url')
    expect(html).not.toContain('og:image')
    expect(html).toContain('<meta name="twitter:card" content="summary">')
  })

  it('replaces the noscript text with a description of the page', () => {
    const html = rewritePage(shell, plfa, context)
    expect(html).not.toContain('<noscript>old</noscript>')
    expect(html).toContain('<h1>PLFA Notebook</h1>')
    expect(html).toContain('href="https://plfa.github.io/"')
  })

  it('marks a page noindex on request', () => {
    expect(rewritePage(shell, plfa, context, { noindex: true })).toContain('<meta name="robots" content="noindex">')
    expect(rewritePage(shell, plfa, context)).not.toContain('noindex')
  })
})

describe('jsonLd', () => {
  it('describes a free web application for Agda', () => {
    const data = JSON.parse(jsonLd(playground, context))
    expect(data['@type']).toBe('WebApplication')
    expect(data.url).toBe(`${SITE}/`)
    expect(data.offers.price).toBe('0')
    expect(data.softwareVersion).toBe('Agda 2.8.0, Agda 2.7.0.1')
  })

  it('credits PLFA on the PLFA page only', () => {
    expect(JSON.parse(jsonLd(plfa, context)).isBasedOn.url).toBe('https://plfa.github.io/')
    expect(JSON.parse(jsonLd(playground, context)).isBasedOn).toBeUndefined()
  })

  it("can't close its <script> element early", () => {
    expect(jsonLd({ ...playground, description: '</script><b>' }, context)).not.toContain('</script>')
  })
})

describe('noscriptHtml', () => {
  it('links the other apps relatively, so any base path works', () => {
    const html = noscriptHtml(notebook, context)
    expect(html).toContain('<a href="./">Agda Playground</a>')
    expect(html).toContain('<a href="./plfa">PLFA Notebook</a>')
    expect(html).not.toContain('<a href="./literate">')
  })

  it("leaves out an app this deployment doesn't serve", () => {
    expect(noscriptHtml(playground, { ...context, routes: [playground, notebook] })).not.toContain('PLFA')
  })
})

describe('robots.txt, sitemap.xml and llms.txt', () => {
  it('points robots.txt at the sitemap when there is a site URL', () => {
    expect(robotsTxt(SITE)).toContain(`Sitemap: ${SITE}/sitemap.xml`)
    expect(robotsTxt(null)).not.toContain('Sitemap')
  })

  it('lists one absolute URL per page in the sitemap', () => {
    const xml = sitemapXml(SITE, seoRoutes)
    expect(xml.match(/<loc>/g)).toHaveLength(3)
    expect(xml).toContain(`<loc>${SITE}/plfa</loc>`)
  })

  it('summarizes the apps and commands in llms.txt', () => {
    const text = llmsTxt(context, [{ label: 'Load', bindings: [{ label: 'Ctrl-c Ctrl-l' }] }])
    expect(text.startsWith('# Agda Playground\n\n> ')).toBe(true)
    expect(text).toContain(`- [Agda Notebook](${SITE}/literate): `)
    expect(text).toContain('- Load: Ctrl-c Ctrl-l')
  })
})
