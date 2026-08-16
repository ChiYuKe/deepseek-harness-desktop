const SETTINGS_NAMESPACE = 'llm-pi-ai'
const CODEX_PROVIDER = 'codex'
const STANDARD_CODEX_EFFORTS = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
}

// GPT-5.6 adds the official `none` and `max` levels. DSH exposes the former
// as the canonical `off` selector while preserving its wire spelling.
const GPT56_EFFORTS = {
  off: 'none',
  ...STANDARD_CODEX_EFFORTS,
  max: 'max',
}

// These are the file-effect tools whose escalation arguments are validated by
// the shared DSH sandbox seam. The guard is deliberately limited to Codex
// requests and these tools; it must not rewrite arbitrary model JSON.
const CODEX_SANDBOX_TOOLS = new Set(['pwsh', 'bash', 'write', 'edit'])
const SANDBOX_MODE_RANK = {
  'read-only': 0,
  'workspace-write': 1,
  'danger-full-access': 2,
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCodexReasoningModel(model) {
  const id = typeof model?.id === 'string' ? model.id : ''
  return /^gpt-5(?:[.-]|$)/i.test(id) && !/image/i.test(id)
}

export function reasoningEffortsForModel(model) {
  const id = typeof model?.id === 'string' ? model.id : ''
  return /^gpt-5\.6(?:[.-]|$)/i.test(id)
    ? GPT56_EFFORTS
    : STANDARD_CODEX_EFFORTS
}

/**
 * Remove malformed or non-widening sandbox arguments from a Codex tool call.
 *
 * Removing the pair is intentional: it lets DSH execute the command under the
 * current policy. If the command really needs more access, DSH returns its
 * normal denial/escalation hint and the model can retry with a real reason.
 * The guard never invents an approval reason and never widens permissions.
 */
export function normalizeCodexToolArguments(toolName, rawArguments, currentMode) {
  if (!CODEX_SANDBOX_TOOLS.has(toolName) || typeof rawArguments !== 'string') {
    return { arguments: rawArguments, changed: false }
  }

  let args
  try {
    args = JSON.parse(rawArguments)
  } catch {
    return { arguments: rawArguments, changed: false }
  }
  if (!isObject(args)) return { arguments: rawArguments, changed: false }

  const hasPermission = Object.prototype.hasOwnProperty.call(args, 'sandbox_permissions')
  const hasJustification = Object.prototype.hasOwnProperty.call(args, 'justification')
  if (!hasPermission && !hasJustification) return { arguments: rawArguments, changed: false }

  const permission = args.sandbox_permissions
  const justification = args.justification
  const emptyJustification = !hasJustification
    || typeof justification !== 'string'
    || justification.trim().length === 0
  const currentRank = SANDBOX_MODE_RANK[currentMode]
  const requestedRank = SANDBOX_MODE_RANK[permission]
  const isNotWider = currentRank !== undefined
    && requestedRank !== undefined
    && requestedRank <= currentRank

  // A justification without a permission is invalid too. Treat all malformed
  // pairs alike so the model gets one predictable retry path.
  if (!hasPermission || emptyJustification || isNotWider) {
    const normalized = { ...args }
    delete normalized.sandbox_permissions
    delete normalized.justification
    return { arguments: JSON.stringify(normalized), changed: true }
  }

  return { arguments: rawArguments, changed: false }
}

/**
 * Normalize tool-call arguments in the model stream while preserving all
 * non-tool chunks. Tool-call lanes are buffered until block-end because DSH
 * treats the block-end payload as authoritative.
 */
export async function* normalizeCodexToolCallStream(source, currentMode) {
  const pending = new Map()

  for await (const chunk of source) {
    if (chunk?.type === 'block-start' && chunk.blockType === 'tool-call') {
      pending.set(chunk.index, { chunks: [chunk], name: undefined, id: undefined })
      continue
    }

    if (chunk?.type === 'tool-call-delta') {
      const state = pending.get(chunk.index)
      if (state === undefined) {
        yield chunk
      } else {
        state.chunks.push(chunk)
        if (state.name === undefined && chunk.name !== undefined) state.name = chunk.name
        if (state.id === undefined && chunk.id !== undefined) state.id = chunk.id
      }
      continue
    }

    if (chunk?.type === 'block-end' && chunk.block?.type === 'tool-call') {
      const state = pending.get(chunk.index)
      if (state === undefined) {
        yield chunk
        continue
      }

      pending.delete(chunk.index)
      state.chunks.push(chunk)
      const toolName = chunk.block.name || state.name || ''
      const normalized = normalizeCodexToolArguments(toolName, chunk.block.arguments, currentMode)
      if (!normalized.changed) {
        for (const buffered of state.chunks) yield buffered
        continue
      }

      yield state.chunks[0]
      const delta = state.chunks.find(item => item.type === 'tool-call-delta')
      yield {
        ...(delta ?? {}),
        type: 'tool-call-delta',
        index: chunk.index,
        id: chunk.block.id ?? state.id ?? '',
        ...(toolName === '' ? {} : { name: toolName }),
        argumentsDelta: normalized.arguments,
      }
      yield { ...chunk, block: { ...chunk.block, arguments: normalized.arguments } }
      continue
    }

    yield chunk
  }

  // A truncated/malformed provider stream should not lose the buffered data.
  for (const state of pending.values()) {
    for (const chunk of state.chunks) yield chunk
  }
}

/**
 * Add only missing Codex reasoning declarations, preserving user overrides.
 * Models with reasoningEfforts=false or supportsReasoningEffort=false are
 * explicit opt-outs and are left unchanged.
 */
export function normalizeCodexModels(models, options = {}) {
  if (!Array.isArray(models)) return { models, changed: false }

  let changed = false
  const nextModels = models.map(model => {
    if (!isObject(model) || !isCodexReasoningModel(model)) return model
    if (model.reasoningEfforts === false) return model
    if (isObject(model.compat) && model.compat.supportsReasoningEffort === false) return model
    if (options.routeSupportsReasoningEffort === false) return model

    let modelChanged = false
    const reasoningEfforts = isObject(model.reasoningEfforts)
      ? { ...model.reasoningEfforts }
      : {}
    for (const [level, wireValue] of Object.entries(reasoningEffortsForModel(model))) {
      if (!(level in reasoningEfforts)) {
        reasoningEfforts[level] = wireValue
        modelChanged = true
        changed = true
      }
    }

    const compat = isObject(model.compat) ? { ...model.compat } : {}
    // These switches are valid only for OpenAI Chat Completions. Responses
    // carries reasoning.effort in the protocol itself, so remove stale
    // completions fields when a route is moved back to Responses.
    if (options.api === 'openai-completions') {
      if (!('thinkingFormat' in compat)) {
        compat.thinkingFormat = 'openai'
        modelChanged = true
        changed = true
      }
      if (!('supportsReasoningEffort' in compat)) {
        compat.supportsReasoningEffort = true
        modelChanged = true
        changed = true
      }
    } else if (options.api === 'openai-responses') {
      for (const field of ['thinkingFormat', 'supportsReasoningEffort']) {
        if (field in compat) {
          delete compat[field]
          modelChanged = true
          changed = true
        }
      }
    }

    if (!modelChanged) return model

    const normalizedModel = { ...model, reasoningEfforts }
    if (Object.keys(compat).length > 0) {
      normalizedModel.compat = compat
    } else {
      delete normalizedModel.compat
    }
    return normalizedModel
  })

  return { models: nextModels, changed }
}

export const name = 'dsh-codex-reasoning'
export const inject = ['settings']

export function apply(ctx) {
  ctx.inject(['settings'], settingsCtx => {
    let closed = false
    let retryTimer
    let retries = 0
    let queue = Promise.resolve()

    const logFailure = error => {
      settingsCtx.logger?.warn?.(`dsh-codex-reasoning: ${String(error)}`)
    }

    const ensure = async () => {
      if (closed) return

      const section = settingsCtx.settings.get(SETTINGS_NAMESPACE)
      if (!isObject(section)) {
        if (retries < 100) {
          retries += 1
          retryTimer = setTimeout(() => {
            retryTimer = undefined
            queue = queue.then(ensure).catch(logFailure)
          }, 100)
        }
        return
      }

      retries = 0
      const providers = section.providers
      const codex = isObject(providers) ? providers[CODEX_PROVIDER] : undefined
      if (!isObject(codex) || !Array.isArray(codex.models)) return

      const routeCompat = isObject(codex.compat) ? codex.compat : undefined
      const normalized = normalizeCodexModels(codex.models, {
        api: codex.api,
        routeSupportsReasoningEffort: routeCompat?.supportsReasoningEffort,
      })
      if (!normalized.changed) return

      await settingsCtx.settings.update(SETTINGS_NAMESPACE, {
        providers: {
          [CODEX_PROVIDER]: {
            models: normalized.models,
          },
        },
      })
    }

    const schedule = () => {
      queue = queue.then(ensure).catch(logFailure)
    }

    const stopUpdated = settingsCtx.on('settings/updated', namespace => {
      if (String(namespace) === SETTINGS_NAMESPACE) schedule()
    })

    settingsCtx.effect(() => {
      schedule()
      return () => {
        closed = true
        stopUpdated()
        if (retryTimer !== undefined) clearTimeout(retryTimer)
      }
    })

    const systemPrompt = ctx.get('systemPrompt')
    systemPrompt?.section({
      name: 'dsh-codex-reasoning:tool-compat',
      order: 106,
      text: 'For pwsh, bash, write, and edit: do not send sandbox_permissions unless retrying the exact command or operation that DSH just denied. Every sandbox_permissions retry must include a non-empty one-sentence justification. If the current DSH file policy is danger-full-access, do not send sandbox_permissions at all.',
    })

    ctx.on('llm/stream', (options, next) => {
      if (options.provider !== CODEX_PROVIDER) return next()

      const session = options.sessionId === undefined
        ? undefined
        : ctx.get('sessions')?.get(options.sessionId)
      const currentMode = session === undefined
        ? undefined
        : ctx.get('sandboxPolicy')?.resolve({ session }).mode
      return normalizeCodexToolCallStream(next(), currentMode)
    })
  })
}
