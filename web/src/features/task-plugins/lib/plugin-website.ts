/** Accept only explicit HTTPS links; never let URL repair malformed input. */
export function getPluginWebsite(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const website = value.trim()
  if (!/^https:\/\/[^/?#]+/i.test(website) || /[\s\p{Cc}\\]/u.test(website)) {
    return undefined
  }
  const authority = website.slice(8).split(/[/?#]/, 1)[0]
  if (
    /[@%]/.test(authority) ||
    [...authority].some((character) => character.charCodeAt(0) > 127)
  ) {
    return undefined
  }
  try {
    const url = new URL(website)
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return undefined
    }
    const host = url.hostname.replace(/\.$/, '')
    if (
      !host.startsWith('[') &&
      (host.length > 253 ||
        !host
          .split('.')
          .every((label) =>
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
          ))
    ) {
      return undefined
    }
    return website
  } catch {
    return undefined
  }
}
