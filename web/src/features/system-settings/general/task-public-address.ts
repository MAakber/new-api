export function isValidTaskPublicAddress(value: string): boolean {
  if (value === '') return true
  if (
    value !== value.trim() ||
    !/^https?:\/\//i.test(value) ||
    value.includes('?') ||
    value.includes('#')
  ) {
    return false
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f || character === '\\') {
      return false
    }
  }

  try {
    const url = new URL(value)
    const authorityStart = value.indexOf('//') + 2
    const pathStart = value.indexOf('/', authorityStart)
    const authority = value.slice(
      authorityStart,
      pathStart === -1 ? value.length : pathStart
    )
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname.length > 0 &&
      !authority.includes('@') &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}
