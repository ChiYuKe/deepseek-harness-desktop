export const zh = {
  title: '背景',
  description: '选择一张图片作为 Harness 背景，设置会保存到 DSH 配置。',
  choose: '选择图片',
  change: '更换图片',
  clear: '清除',
  enabled: '启用背景',
  opacity: '图片强度',
  mask: '暗色遮罩',
  blur: '背景模糊',
  fit: '显示方式',
  cover: '铺满窗口',
  contain: '完整显示',
  noImage: '还没有选择图片',
  fileTooLarge: '图片不能超过 8 MB。',
  invalidFile: '请选择有效的图片文件。',
  readFailed: '图片读取失败，请重试。',
} as const

export const en = {
  title: 'Background',
  description: 'Choose an image for the Harness background. Settings are saved by DSH.',
  choose: 'Choose image',
  change: 'Change image',
  clear: 'Clear',
  enabled: 'Enable background',
  opacity: 'Image strength',
  mask: 'Dark overlay',
  blur: 'Background blur',
  fit: 'Display mode',
  cover: 'Fill window',
  contain: 'Show whole image',
  noImage: 'No image selected',
  fileTooLarge: 'Images must be 8 MB or smaller.',
  invalidFile: 'Please choose a valid image file.',
  readFailed: 'The image could not be read. Try again.',
} satisfies Record<keyof typeof zh, string>

export type BackgroundLocaleKey = keyof typeof zh
