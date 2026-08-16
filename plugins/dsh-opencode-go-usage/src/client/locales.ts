export const zh = {
  title: 'OpenCode Go 用量',
  description: '读取 OpenCode Go 订阅的滚动、每周和每月用量。',
  rolling: '滚动 5 小时',
  weekly: '每周',
  monthly: '每月',
  reset: '重置',
  refresh: '刷新',
  refreshing: '刷新中…',
  updated: '更新于',
  notConfigured: '未找到 OpenCode Go API Key，请先在模型配置中配置 OpenCode Go。',
  unauthorized: 'OpenCode Go API Key 无效，或当前账号没有有效的 Go 订阅。',
  unavailable: 'OpenCode Go 官方用量接口暂时不可用。',
  error: '读取 OpenCode Go 用量失败。',
  stale: '显示的是上一次成功读取的数据。',
  noData: '暂无用量数据。',
} as const

export const en = {
  title: 'OpenCode Go usage',
  description: 'View rolling, weekly, and monthly usage for your OpenCode Go subscription.',
  rolling: 'Rolling 5 hours',
  weekly: 'Weekly',
  monthly: 'Monthly',
  reset: 'Reset',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  updated: 'Updated',
  notConfigured: 'No OpenCode Go API key was found. Configure OpenCode Go in Models first.',
  unauthorized: 'The OpenCode Go API key is invalid or the account has no active Go subscription.',
  unavailable: 'The official OpenCode Go usage endpoint is temporarily unavailable.',
  error: 'Failed to read OpenCode Go usage.',
  stale: 'Showing the last successfully fetched data.',
  noData: 'No usage data yet.',
} as const

export type GoUsageLocaleKey = keyof typeof zh
