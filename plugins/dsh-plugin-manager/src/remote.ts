interface Schema<T = unknown> { parse(value: unknown): T }

function schema<T>(parse: (value: unknown) => T): Schema<T> {
  return { parse }
}

const stringSchema = schema<string>((value) => {
  if (typeof value !== 'string') throw new TypeError('expected string')
  return value
})
const booleanSchema = schema<boolean>((value) => {
  if (typeof value !== 'boolean') throw new TypeError('expected boolean')
  return value
})
const snapshot = schema((value) => {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { entries?: unknown }).entries)) {
    throw new TypeError('expected plugin manager snapshot')
  }
  return value
})

const TYPERT_REMOTE = {
  package: 'dsh-plugin-manager',
  descriptors: [
    {
      id: 'dsh-plugin-manager#pluginManager/list',
      service: 'pluginManager',
      namespace: 'pluginManager',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-plugin-manager#PluginManagerSnapshot',
        schema: snapshot,
      },
    },
    {
      id: 'dsh-plugin-manager#pluginManager/setEnabled',
      service: 'pluginManager',
      namespace: 'pluginManager',
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'entryId',
          wire: 'entryId',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-plugin-manager#PluginEntryId', schema: stringSchema },
        },
        {
          name: 'enabled',
          wire: 'enabled',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-plugin-manager#Enabled', schema: booleanSchema },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-plugin-manager#PluginManagerSnapshot',
        schema: snapshot,
      },
    },
  ],
}

export default TYPERT_REMOTE
