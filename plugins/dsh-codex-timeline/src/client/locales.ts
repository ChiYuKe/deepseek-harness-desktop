export const zh = {
  navigation: '消息导航',
  navigationOn: '隐藏消息导航',
  navigationOff: '显示消息导航',
  aria: '会话消息导航',
  message: '消息',
  contextInjection: '上下文注入',
  contextRecall: '上下文召回',
  noPreview: '暂无消息摘要',
} as const

export const en = {
  navigation: 'Message map',
  navigationOn: 'Hide message map',
  navigationOff: 'Show message map',
  aria: 'Conversation message map',
  message: 'Message',
  contextInjection: 'Context injection',
  contextRecall: 'Context recall',
  noPreview: 'No message preview',
} as const

export type TimelineLocaleKey = keyof typeof zh
