import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SQLite does not only write the database file. For every database it keeps up
 * to three extra files next to it:
 *
 *   <db>-wal      write-ahead log
 *   <db>-shm      shared memory index
 *   <db>-journal  rollback journal (used by older journal modes)
 *
 * They are recreated on every connection, so leaving them out of `.gitignore`
 * means `git status` is permanently dirty and test artefacts end up committed.
 * A pattern such as `*.db` does *not* cover `app.db-wal`, therefore each side
 * extension has to be ignored explicitly.
 *
 * These tests read the repository `.gitignore` and assert that databases *and*
 * their sidecars are ignored, using a small gitignore matcher instead of
 * substring checks, so that any equivalent spelling of the rules passes
 * (`*.db-*`, `/data/*.db-wal`, `**\/*.sqlite?-shm`, ...).
 */

const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'] as const;
const SIDE_EXTENSIONS = ['-wal', '-shm', '-journal'] as const;

/** Repository relative paths that must never show up in `git status`. */
function buildArtefacts(): string[] {
  const artefacts: string[] = [];
  for (const dir of ['', 'data/', 'data/nested/', 'var/']) {
    for (const extension of DB_EXTENSIONS) {
      artefacts.push(`${dir}app${extension}`);
      for (const side of SIDE_EXTENSIONS) {
        artefacts.push(`${dir}app${extension}${side}`);
      }
    }
  }
  return artefacts;
}

const ARTEFACTS = buildArtefacts();

interface IgnoreRule {
  /** The original line, kept for readable failure messages. */
  source: string;
  negated: boolean;
  regex: RegExp;
}

function startDir(): string {
  // `__dirname` exists when this file is executed as CommonJS (jest);
  // under ESM (vitest) the process is started from the project root.
  return typeof __dirname === 'string' ? __dirname : process.cwd();
}

/** Nearest ancestor of `from` that holds a `.gitignore`. */
function findGitignore(from: string = startDir()): string {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, '.gitignore');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Nothing found: return the expected location so the failure is explicit.
  return path.join(from, '.gitignore');
}

function globToRegExp(glob: string, anchored: boolean): RegExp {
  let body = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          body += '(?:[^/]+/)*';
          i += 2;
        } else {
          body += '.*';
          i += 1;
        }
      } else {
        body += '[^/]*';
      }
    } else if (char === '?') {
      body += '[^/]';
    } else if (char === '[') {
      const close = glob.indexOf(']', i + 1);
      if (close === -1) {
        body += '\\[';
      } else {
        body += glob.slice(i, close + 1);
        i = close;
      }
    } else {
      body += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  // A pattern without a slash matches at any depth; one with a slash (or a
  // leading slash) is anchored to the directory holding the .gitignore.
  const prefix = anchored ? '' : '(?:[^/]+/)*';
  return new RegExp(`^${prefix}${body}$`);
}

function parseGitignore(contents: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.replace(/[ \t]+$/, '');
    if (line === '' || line.startsWith('#')) continue;

    const negated = line.startsWith('!');
    let pattern = negated ? line.slice(1) : line;

    const leadingSlash = pattern.startsWith('/');
    if (leadingSlash) pattern = pattern.slice(1);
    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) pattern = pattern.slice(0, -1);
    if (pattern === '') continue;

    const anchored = leadingSlash || pattern.includes('/');
    const body = directoryOnly ? `${pattern}/**` : pattern;

    rules.push({ source: line, negated, regex: globToRegExp(body, anchored) });
  }
  return rules;
}

let cache: { file: string; rules: IgnoreRule[] } | undefined;

function gitignore(): { file: string; rules: IgnoreRule[] } {
  if (!cache) {
    const file = findGitignore();
    cache = { file, rules: parseGitignore(readFileSync(file, 'utf8')) };
  }
  return cache;
}

/** Git honours the last matching rule, so later rules win. */
function matchingRule(file: string): IgnoreRule | undefined {
  let found: IgnoreRule | undefined;
  for (const rule of gitignore().rules) {
    if (rule.regex.test(file)) found = rule;
  }
  return found;
}

function isIgnored(file: string): boolean {
  const rule = matchingRule(file);
  return rule !== undefined && !rule.negated;
}

describe('.gitignore SQLite sidecars', () => {
  it('is found at the repository root and contains ignore rules', () => {
    const { file, rules } = gitignore();
    expect(existsSync(file), `missing .gitignore at ${file}`).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('ignores SQLite databases and their -wal/-shm/-journal sidecars', () => {
    const notIgnored = ARTEFACTS.filter((file) => !isIgnored(file));
    expect(notIgnored).toEqual([]);
  });

  it('never re-includes a SQLite artefact through a negated rule', () => {
    const reIncluded = ARTEFACTS.filter((file) => matchingRule(file)?.negated === true);
    expect(reIncluded).toEqual([]);
  });

  it('covers the sidecars explicitly, not only through the database pattern', () => {
    // `*.db` must not be relied upon for `app.db-wal`: if a single rule matched
    // both, the sidecar would only be ignored by accident of a broader pattern.
    const database = 'app.db';
    const sidecar = 'app.db-wal';
    const rules = gitignore().rules;
    const matchesDatabase = rules.filter((rule) => rule.regex.test(database));
    expect(matchesDatabase.length).toBeGreaterThan(0);
    expect(matchesDatabase.some((rule) => rule.regex.test(sidecar))).toBe(false);
    expect(rules.some((rule) => rule.regex.test(sidecar))).toBe(true);
  });
});
