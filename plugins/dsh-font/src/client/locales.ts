/** `settings.font` namespace dictionaries (the Font row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'font.title': '字体',
  'font.uiFont.label': '界面字体',
  'font.uiFont.default': '默认（跟随系统）',
  'font.outputFont.label': '输出文本字体',
  'font.outputFont.followUi': '跟随界面字体',
  'font.currentCustom': '当前字体（自定义）',
  'font.options.microsoftYahei': '微软雅黑',
  'font.options.pingfang': '苹方 / PingFang SC',
  'font.options.sourceHanSans': '思源黑体 / Source Han Sans SC',
  'font.options.notoSans': 'Noto Sans SC',
  'font.options.harmony': 'HarmonyOS Sans SC',
  'font.options.segoe': 'Segoe UI',
  'font.options.inter': 'Inter',
  'font.options.aria': '字体选项',
  'font.outputSize.label': '输出文本字号',
  'font.outputSize.placeholder': '默认',
  'font.outputSize.unit': 'px',
  'font.preview': '字体预览',
  'font.reset': '重置为默认',
} satisfies Record<string, string>

/** The settings.font namespace key union. */
export type FontKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'font.title': 'Font',
  'font.uiFont.label': 'Interface font',
  'font.uiFont.default': 'Default (follow the system)',
  'font.outputFont.label': 'Output text font',
  'font.outputFont.followUi': 'Follow the interface font',
  'font.currentCustom': 'Current font (custom)',
  'font.options.microsoftYahei': 'Microsoft YaHei',
  'font.options.pingfang': 'PingFang SC',
  'font.options.sourceHanSans': 'Source Han Sans SC',
  'font.options.notoSans': 'Noto Sans SC',
  'font.options.harmony': 'HarmonyOS Sans SC',
  'font.options.segoe': 'Segoe UI',
  'font.options.inter': 'Inter',
  'font.options.aria': 'Font options',
  'font.outputSize.label': 'Output text size',
  'font.outputSize.placeholder': 'Default',
  'font.outputSize.unit': 'px',
  'font.preview': 'Font preview',
  'font.reset': 'Reset to default',
} satisfies Record<FontKey, string>
