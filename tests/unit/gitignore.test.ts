import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../..')
const gitignorePath = resolve(repoRoot, '.gitignore')

const readGitignore = (): string => readFileSync(gitignorePath, 'utf8')

const hasEntry = (content: string, entry: string): boolean => {
  const normalized = entry.endsWith('/') ? entry : `${entry}/`
  return content
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line === entry || line === normalized)
}

describe('.gitignore', () => {
  it('exists at the repository root', () => {
    expect(existsSync(gitignorePath)).toBe(true)
  })

  it('ignores node_modules directories', () => {
    expect(hasEntry(readGitignore(), 'node_modules')).toBe(true)
  })

  it('ignores build and cache output directories', () => {
    const content = readGitignore()
    for (const entry of ['.next', 'dist', 'build', 'coverage', '.turbo']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores env files and private keys', () => {
    const content = readGitignore()
    for (const entry of ['.env', '.env.local', '*.pem', '*.key']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores local database files', () => {
    const content = readGitignore()
    for (const entry of ['*.db', '*.db-journal', '*.sqlite', '*.sqlite3']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores OS artifacts', () => {
    const content = readGitignore()
    for (const entry of ['.DS_Store', 'Thumbs.db', 'Desktop.ini']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores log files', () => {
    const content = readGitignore()
    for (const entry of ['logs', '*.log', 'yarn-error.log*']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores typescript and linter caches', () => {
    const content = readGitignore()
    for (const entry of ['*.tsbuildinfo', '.eslintcache', '.stylelintcache']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores playwright artifacts', () => {
    const content = readGitignore()
    for (const entry of ['test-results', 'playwright-report']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores IDE directories', () => {
    const content = readGitignore()
    for (const entry of ['.vscode', '.idea']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('ignores the self-hosted plane setup', () => {
    expect(hasEntry(readGitignore(), 'plane-selfhosted')).toBe(true)
  })

  it('ignores local agent and assistant working files', () => {
    const content = readGitignore()
    for (const entry of ['.claude', '.cursor', 'specs']) {
      expect(hasEntry(content, entry)).toBe(true)
    }
  })

  it('keeps tracked yarn assets un-ignored', () => {
    const content = readGitignore()
    for (const entry of [
      '!.yarn/patches',
      '!.yarn/plugins',
      '!.yarn/releases',
      '!.yarn/versions',
    ]) {
      expect(content.split('\n').map((l) => l.trim())).toContain(entry)
    }
  })

  it('keeps the opencode skills and commands out of the ignore list', () => {
    const content = readGitignore()
    const ignoringEverything = content
      .split('\n')
      .map((line) => line.trim())
      .some((line) => line === '.opencode/' || line === '.opencode')
    expect(ignoringEverything).toBe(false)
  })

  it('ends with a trailing newline', () => {
    expect(readGitignore().endsWith('\n')).toBe(true)
  })
})
