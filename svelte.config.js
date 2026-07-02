import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    warningFilter(warning) {
      const ignored = [
        'a11y_click_events_have_key_events',
        'a11y_no_static_element_interactions',
      ]
      // add keys in `configuration.svelte.plugin.svelte.compilerWarnings`
      // like: "a11y_...": "ignore"
      return !ignored.includes(warning.code)
    },
  },
  kit: {
    adapter: adapter({ precompress: false }),
    paths: {
      base: process.env.GITHUB_ACTIONS ? '/agda-playground' : '',
    }
  }
}

export default config
