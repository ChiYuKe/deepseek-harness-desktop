export type ReviewFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface ReviewFile {
  readonly path: string
  readonly oldPath?: string
  readonly status: ReviewFileStatus
  readonly additions: number
  readonly deletions: number
  readonly binary: boolean
}

export interface ReviewSnapshot {
  readonly root: string
  readonly branch: string
  readonly files: readonly ReviewFile[]
  readonly additions: number
  readonly deletions: number
  readonly fetchedAt: string
}

export interface ReviewDiff {
  readonly path: string
  readonly diff: string
}
