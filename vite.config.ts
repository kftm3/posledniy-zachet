import { defineConfig, type Plugin } from 'vite'

const repositoryBase = '/posledniy-zachet/'

function fixGitHubPagesPublicPaths(): Plugin {
  const fixPaths = (content: string): string =>
    content.replace(
      /(["'`(])\/(assets|audio|video|fonts)\//g,
      (_match, prefix: string, folder: string) =>
        `${prefix}${repositoryBase}${folder}/`,
    )

  return {
    name: 'fix-github-pages-public-paths',
    apply: 'build',

    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          output.code = fixPaths(output.code)
        } else if (typeof output.source === 'string') {
          output.source = fixPaths(output.source)
        }
      }
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : '/posledniy-zachet/',

  plugins: [fixGitHubPagesPublicPaths()],
}))