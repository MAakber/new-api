import { describe, expect, test } from 'vitest'

import {
  modelGroupSelectorLayoutClasses,
  scrollSelectedOptionIntoView,
} from '../layout'

describe('model group selector layout', () => {
  test('keeps group options at a fixed height and aligned to the top', () => {
    const groupScrollClasses =
      modelGroupSelectorLayoutClasses.groupScroll.split(' ')

    expect(groupScrollClasses.includes('auto-rows-[2rem]')).toBeTruthy()
    expect(groupScrollClasses.includes('content-start')).toBeTruthy()
  })

  test('centers the selected group inside its own scroll container', () => {
    const scrollCalls: ScrollToOptions[] = []
    const selectedOption = {
      offsetHeight: 32,
      offsetTop: 160,
      scrollIntoView() {},
    }
    const scrollContainer = {
      clientHeight: 200,
      scrollTop: 0,
      scrollTo(options: ScrollToOptions) {
        scrollCalls.push(options)
      },
    }

    scrollSelectedOptionIntoView(selectedOption, scrollContainer)

    expect(scrollCalls).toEqual([{ top: 76, behavior: 'auto' }])
  })

  test('falls back to scrollIntoView when no group container is provided', () => {
    const scrollCalls: ScrollIntoViewOptions[] = []
    const selectedOption = {
      scrollIntoView(options?: ScrollIntoViewOptions) {
        scrollCalls.push(options ?? {})
      },
    }

    scrollSelectedOptionIntoView(selectedOption)

    expect(scrollCalls).toEqual([{ block: 'center', inline: 'nearest' }])
  })
})
