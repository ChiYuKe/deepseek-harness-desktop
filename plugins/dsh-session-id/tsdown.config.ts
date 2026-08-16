import { clientBundle } from '../../packages/client/tsdown.client.ts'

export default clientBundle('dsh-session-id', ['src/index.ts'], {
  lib: {
    deps: {
      alwaysBundle: ['@deepseek-ai/dsh-session-reference'],
    },
  },
})
