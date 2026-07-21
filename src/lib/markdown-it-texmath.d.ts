// markdown-it-texmath ships no type declarations of its own and there is no
// @types package for it -- this is a minimal ambient declaration covering
// only how this project actually uses it (`md.use(texmath, options)`).
declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  import type katex from 'katex'

  interface TexmathOptions {
    engine: typeof katex
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown'
    katexOptions?: Record<string, unknown>
  }

  function texmath(md: MarkdownIt, options: TexmathOptions): void

  export default texmath
}
