#!/usr/bin/env node
// Runs after `vite build` (the "postbuild" npm script). The app renders
// client-side only, so the prerendered pages have no content for crawlers;
// this writes each page's metadata and a static description into it, and
// robots.txt, sitemap.xml and llms.txt into the build. See src/lib/seo.js.
//
// The public origin comes from SITE_URL, or on Vercel from the production
// domain; without one, the tags that need an absolute URL (canonical, og:url,
// og:image) and sitemap.xml are left out.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmsTxt, robotsTxt, rewritePage, seoRoutes, siteUrlFromEnv, sitemapXml } from '../src/lib/seo.js'
import { agdaShortcutRegistry } from '../src/lib/agda/shortcuts.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')

/** @type {{ profiles?: { label?: string, als?: string, plfa?: boolean }[] }} */
let config = {}
try {
  config = JSON.parse(readFileSync(join(root, 'deploy.config.json'), 'utf8'))
} catch {
  // No deploy config: describe the site without environments.
}
const profiles = config.profiles ?? []
const plfaEnabled = profiles.some(profile => profile.plfa === true)
const routes = seoRoutes.filter(route => route.id !== 'plfa' || plfaEnabled)
const context = {
  siteUrl: siteUrlFromEnv(process.env),
  routes,
  agdaVersions: [...new Set(profiles.map(profile => profile.als).filter(v => typeof v === 'string'))],
  environments: profiles.map(profile => profile.label).filter(label => typeof label === 'string'),
}

for (const route of seoRoutes) {
  const file = join(buildDir, route.file)
  if (!existsSync(file)) {
    console.warn(`seo: ${route.file} not found in build/, skipped`)
    continue
  }
  // /plfa is still built without a PLFA profile (an empty chapter list):
  // keep it out of search results then.
  const noindex = !routes.includes(route)
  writeFileSync(file, rewritePage(readFileSync(file, 'utf8'), route, context, { noindex }))
}

writeFileSync(join(buildDir, 'robots.txt'), robotsTxt(context.siteUrl))
if (context.siteUrl) writeFileSync(join(buildDir, 'sitemap.xml'), sitemapXml(context.siteUrl, routes))
writeFileSync(join(buildDir, 'llms.txt'), llmsTxt(context, agdaShortcutRegistry))

console.log(`seo: ${routes.length} pages described, site URL ${context.siteUrl ?? '(none: canonical URLs and sitemap skipped)'}`)
