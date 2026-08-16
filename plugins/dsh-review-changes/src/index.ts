import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { lstat, readFile, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ReviewDiff, ReviewFile, ReviewFileStatus, ReviewSnapshot } from './types.ts'

const execFileAsync = promisify(execFile)
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024
const MAX_UNTRACKED_READ_BYTES = 4 * 1024 * 1024

interface CommandError extends Error {
  readonly code?: number | string
  readonly stdout?: string | Buffer
  readonly stderr?: string | Buffer
}

interface StatusEntry {
  readonly xy: string
  readonly path: string
  readonly oldPath?: string
}

function text(value: string | Buffer | undefined): string {
  return value === undefined ? '' : String(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function git(cwd: string, args: readonly string[], allowedExitCodes: readonly number[] = [0]): Promise<string> {
  try {
    const result = await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: MAX_OUTPUT_BYTES,
    })
    return text(result.stdout as string | Buffer | undefined)
  } catch (error: unknown) {
    const failure = error as CommandError
    const code = typeof failure.code === 'number' ? failure.code : Number(failure.code)
    if (Number.isFinite(code) && allowedExitCodes.includes(code)) return text(failure.stdout)
    const detail = text(failure.stderr) || messageOf(error)
    throw new Error(`git ${args.join(' ')} failed: ${detail.trim()}`)
  }
}

function parseStatus(value: string): StatusEntry[] {
  const tokens = value.split('\0').filter(token => token.length > 0)
  const entries: StatusEntry[] = []
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index++]!
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    if (xy.includes('R') || xy.includes('C')) {
      const oldPath = tokens[index++]
      entries.push(oldPath === undefined ? { xy, path } : { xy, path, oldPath })
    } else {
      entries.push({ xy, path })
    }
  }
  return entries
}

function statusOf(xy: string): ReviewFileStatus {
  if (xy === '??') return 'untracked'
  if (xy.includes('R')) return 'renamed'
  if (xy.includes('D')) return 'deleted'
  if (xy.includes('A')) return 'added'
  return 'modified'
}

function parseNumstat(value: string): Pick<ReviewFile, 'additions' | 'deletions' | 'binary'> {
  const line = value.split(/\r?\n/u).find(item => item.length > 0)
  if (line === undefined) return { additions: 0, deletions: 0, binary: false }
  const [added, removed] = line.split('\t')
  if (added === '-' || removed === '-') return { additions: 0, deletions: 0, binary: true }
  const additions = Number(added)
  const deletions = Number(removed)
  return {
    additions: Number.isFinite(additions) ? additions : 0,
    deletions: Number.isFinite(deletions) ? deletions : 0,
    binary: false,
  }
}

function lineCount(value: Buffer): number {
  if (value.length === 0) return 0
  const textValue = value.toString('utf8')
  return textValue.split(/\r?\n/u).length - (textValue.endsWith('\n') ? 1 : 0)
}

function safePath(root: string, path: string): string {
  if (path.length === 0 || isAbsolute(path)) throw new Error('invalid review path')
  const absolute = resolve(root, path)
  const escaped = relative(root, absolute)
  if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    throw new Error('review path is outside the session workspace')
  }
  return absolute
}

/** Host service behind the DSH review panel. It only executes fixed git commands. */
export class ReviewChangesGateway extends TypertRemoteService {
  static inject = ['sessions']

  constructor(ctx: Context) {
    super(ctx, 'reviewChanges')
  }

  @Remote('list')
  async list(sessionId: string): Promise<ReviewSnapshot> {
    const root = await this.repositoryRoot(sessionId)
    const status = parseStatus(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']))
    const files = await Promise.all(status.map(entry => this.describeFile(root, entry)))
    const branch = (await git(root, ['branch', '--show-current'])).trim() || 'HEAD'
    return {
      root,
      branch,
      files,
      additions: files.reduce((total, file) => total + file.additions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
      fetchedAt: new Date().toISOString(),
    }
  }

  @Remote('diff')
  async diff(sessionId: string, path: string): Promise<ReviewDiff> {
    const root = await this.repositoryRoot(sessionId)
    const snapshot = await this.list(sessionId)
    const file = snapshot.files.find(item => item.path === path)
    if (file === undefined) throw new Error(`file is not in the current review: ${path}`)
    const absolute = safePath(root, path)
    if (file.status === 'untracked') {
      const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
      return { path, diff: await git(root, ['diff', '--no-index', '--', nullDevice, absolute], [0, 1]) }
    }
    return { path, diff: await git(root, ['diff', 'HEAD', '--', path]) }
  }

  @Remote('discard')
  async discard(sessionId: string, path: string): Promise<ReviewSnapshot> {
    const root = await this.repositoryRoot(sessionId)
    const snapshot = await this.list(sessionId)
    const file = snapshot.files.find(item => item.path === path)
    if (file === undefined) throw new Error(`file is not in the current review: ${path}`)
    const absolute = safePath(root, path)
    if (file.status === 'untracked') {
      const stats = await lstat(absolute)
      if (stats.isDirectory()) throw new Error('refusing to remove an untracked directory')
      await rm(absolute, { force: true })
    } else {
      await git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', path])
    }
    return this.list(sessionId)
  }

  private async repositoryRoot(sessionId: string): Promise<string> {
    const cwd = this.ctx.sessions.get(sessionId as SessionId)?.header.cwd ?? process.cwd()
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  }

  private async describeFile(root: string, entry: StatusEntry): Promise<ReviewFile> {
    const status = statusOf(entry.xy)
    if (status !== 'untracked') {
      return {
        path: entry.path,
        ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath }),
        status,
        ...parseNumstat(await git(root, ['diff', '--numstat', 'HEAD', '--', entry.path])),
      }
    }

    const absolute = safePath(root, entry.path)
    const value = await readFile(absolute)
    const binary = value.subarray(0, Math.min(value.length, MAX_UNTRACKED_READ_BYTES)).includes(0)
    return {
      path: entry.path,
      status,
      additions: binary ? 0 : lineCount(value),
      deletions: 0,
      binary,
    }
  }
}

export default ReviewChangesGateway
