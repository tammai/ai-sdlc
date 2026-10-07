import { describe, expect, it } from 'vitest'
import { mediaUrl } from '../../app/utils/media'

describe('mediaUrl', () => {
  it('turns a key into a /media path', () => {
    expect(mediaUrl('blog/cover.svg')).toBe('/media/blog/cover.svg')
  })

  it('accepts a key that already starts with / or media/', () => {
    expect(mediaUrl('/blog/cover.svg')).toBe('/media/blog/cover.svg')
    expect(mediaUrl('media/blog/cover.svg')).toBe('/media/blog/cover.svg')
  })

  it.each(['', 'a b.png', '../secret', 'a/../b', 'a//b', 'a/./b', 'https://example.com/a.png', 'a?x=1', 'Ünï.png'])('rejects %j', (key) => {
    expect(() => mediaUrl(key)).toThrow(/Invalid media key/)
  })
})
