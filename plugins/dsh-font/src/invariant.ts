/**
 * Package-owned invariant companion for `dsh-font`.
 * @module dsh-font/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-font'

/** Cordis companion plugin name. */
export const name = 'dsh-font-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the settings scope validates and publishes the
 * durable font section, and the browser runtime applies its CSS variables
 * synchronously on every accepted snapshot. Apply-site sanitization and the
 * variable names are covered directly by this package's Host and runtime
 * behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
