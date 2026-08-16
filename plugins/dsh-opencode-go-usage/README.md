# dsh-opencode-go-usage

在 DeepSeek Harness 的“设置 → 通用设置”中显示 OpenCode Go 的滚动 5 小时、每周和每月用量，以及各窗口的重置倒计时。

## 数据来源

插件调用 OpenCode 官方接口：

```text
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <OpenCode Go API Key>
```

API Key 不会进入浏览器。插件会优先读取 `llm-pi-ai` 中指向 OpenCode Go 的 `apiKeyEnv`，再尝试 `OPENCODE_GO_API_KEY` 和 `OPENCODE_API_KEY`；实际密钥只在 Host 侧通过 DSH 凭据服务解析。

官方 Go 文档公开了用量上限和 Console 入口，但没有把完整响应字段写入文档；插件对 `rolling`/`rolling5h`、`percent`/`usagePercent`、`resetsAt`/`resetInSec` 都做了兼容处理。

## 使用

1. 在模型配置中配置 OpenCode Go，并保存 API Key。
2. 在插件管理器中启用“opencode-go-usage”。
3. 打开“设置 → 通用设置”，查看三段用量；插件每 5 分钟自动刷新，也可以手动点击“刷新”。

如果 API Key 无效、没有 Go 订阅或官方接口暂时不可用，界面会显示对应状态；已有成功数据时会保留并标记为旧数据。
