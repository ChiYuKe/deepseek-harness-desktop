import { clientBundle } from '../../packages/client/tsdown.client.ts'
import ts from 'typescript'

const lowerHostDecorators = {
  name: 'dsh-opencode-go-usage: lower decorators',
  transform(code: string, id: string) {
    if (!/\.[cm]?tsx?$/u.test(id) || !/@Remote\s*\(/u.test(code)) return
    const result = ts.transpileModule(code, {
      fileName: id,
      compilerOptions: {
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
      },
    })
    return {
      code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
      map: result.sourceMapText,
    }
  },
}

export default clientBundle('dsh-opencode-go-usage', ['src/index.ts', 'src/remote.ts'], {
  lib: { plugins: [lowerHostDecorators] },
})
