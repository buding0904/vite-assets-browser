module.exports = {
  git: {
    commitMessage: 'chore: release v${version}',
    tagName: 'v${version}',
  },
  github: {
    release: true,
    releaseNotes: 'toJSON(changelog)',
  },
  npm: {
    publish: true,
  },
  hooks: {
    'before:init': 'pnpm run build',
  },
  plugins: {
    '@release-it/conventional-changelog': {
      preset: { name: 'angular' },
      infile: 'CHANGELOG.md',
      writerOpts: {
        transform(commit) {
          // 过滤掉不符合 conventional commits 规范的 commit
          if (!commit.type) return null
          // 过滤掉 release 自动产生的 chore commit
          if (commit.type === 'chore' && /^release/.test(commit.subject)) return null
          // 过滤掉 merge commit
          if (/^Merge /.test(commit.header)) return null
          return commit
        },
      },
    },
  },
}
