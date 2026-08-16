# dsh-codex-reasoning

一个 DeepSeek Harness（DSH）组合包。安装后，它会监听 `llm-pi-ai` 设置：

- 对 `codex` 提供方下的 GPT-5 文本模型补齐官方推理档位；
- GPT-5.6 提供 `off`（发送 `none`）、`low`、`medium`、`high`、`xhigh`、`max`；
- 其他 GPT-5/Codex 模型默认提供 `low`、`medium`、`high`、`xhigh`；
- 仅在路由使用 `openai-completions` 时声明 OpenAI 的 `reasoning_effort` 能力和 `openai` 推理格式；
- 如果路由使用 `openai-responses`，只写入模型推理目录，不添加 Chat Completions 专用字段；
- 当 Codex 路由从 `openai-completions` 切换到 `openai-responses` 时，自动清理遗留的 Chat Completions 专用字段；
- 为 Codex 的 `pwsh`、`bash`、`write` 和 `edit` 工具增加权限参数兼容保护：空理由、孤立理由和不比当前策略更宽的权限申请会被移除，不会伪造审批理由或扩大权限；
- 在模型请求中补充权限调用规则；真正需要更宽权限时仍由 DSH 原生沙箱拒绝与审批流程处理；
- 保留已有的模型映射、协议设置和用户明确的禁用项；
- 不修改 DSH 核心源码，也不处理 `gpt-image-2`。

安装到 Web profile：

```powershell
pnpm dsh plugin --profile web add .\plugins\dsh-codex-reasoning
```

验证组合配置：

```powershell
pnpm dsh --profile web --dump-config
```

插件会在 DSH 运行时把缺失的模型推理声明写回 `$DSH_HOME/settings.yaml`，因此模型设置页会自动出现推理强度选项。

权限兼容保护只处理明显不合法或不可能成功的工具参数：它不会替模型填写审批理由，也不会把权限请求升级到更高等级。若命令确实需要更高权限，插件会保留合法的升权请求，让 DSH 按原生审批策略处理。

注意：插件不能把只支持 Chat Completions 的代理转换成 Responses API，也不能修复代理返回不完整流的问题。使用私有 OpenAI 兼容网关时，`baseURL` 应填写网关实际的 API 前缀（通常包含 `/v1`），协议应与网关实际支持的接口一致。

Codex GPT-5.6 推荐使用 `api: openai-responses`，请求入口应显示为 `/v1/responses`；只有确认网关不支持 Responses API 时，才使用 `openai-completions`。
