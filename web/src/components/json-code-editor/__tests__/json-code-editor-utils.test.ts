import { describe, expect, test } from 'vitest'

import {
  applyJsonSmartEnter,
  createScrollLayerSynchronizer,
  formatJsonDraft,
  getCursorLocation,
  getJsonValidationState,
} from '../json-code-editor-utils'

describe('json code editor utils', () => {
  test('treats empty drafts as valid editable JSON drafts', () => {
    expect(getJsonValidationState('  \n')).toEqual({
      isValid: true,
      messageKey: 'JSON',
    })
  })

  test('reports invalid JSON without throwing away the draft', () => {
    expect(getJsonValidationState('{"model": }')).toEqual({
      isValid: false,
      messageKey: 'Invalid JSON',
    })
  })

  test('formats valid JSON with stable two-space indentation', () => {
    expect(formatJsonDraft('{"model":{"ratio":2}}')).toEqual({
      didFormat: true,
      value: '{\n  "model": {\n    "ratio": 2\n  }\n}',
    })
  })

  test('keeps invalid JSON drafts unchanged when formatting is requested', () => {
    expect(formatJsonDraft('{"model": }')).toEqual({
      didFormat: false,
      value: '{"model": }',
    })
  })

  test('derives the one-based cursor line and column from text offsets', () => {
    expect(getCursorLocation('{\n  "model": 1\n}', 5)).toEqual({
      line: 2,
      column: 4,
    })
  })

  test('expands paired JSON brackets with a nested indentation line', () => {
    expect(applyJsonSmartEnter('{}', 1, 1)).toEqual({
      value: '{\n  \n}',
      selectionStart: 4,
      selectionEnd: 4,
    })
  })

  test('coalesces scroll updates while keeping line numbers horizontally fixed', () => {
    const source = { scrollLeft: 12, scrollTop: 40 }
    const contentLayer = { style: { transform: '' } }
    const lineNumberLayer = { style: { transform: '' } }
    const queuedFrames: Array<() => void> = []
    const synchronizer = createScrollLayerSynchronizer(
      source,
      { contentLayer, lineNumberLayer },
      (callback) => {
        queuedFrames.push(callback)
        return queuedFrames.length
      }
    )

    synchronizer.sync()
    source.scrollLeft = 24
    source.scrollTop = 80
    synchronizer.sync()

    expect(queuedFrames.length).toBe(1)

    queuedFrames[0]()

    expect(contentLayer.style.transform).toBe('translate3d(-24px, -80px, 0)')
    expect(lineNumberLayer.style.transform).toBe('translate3d(0, -80px, 0)')
  })
})
