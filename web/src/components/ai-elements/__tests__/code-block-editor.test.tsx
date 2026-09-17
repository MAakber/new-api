import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { CodeBlockEditor } from '../code-block'

afterEach(() => {
  cleanup()
})

function editorTree(value: string) {
  // A fresh inline onKeyDown per call mirrors PlaygroundMessageEditor, which
  // recreates its handler on every keystroke-driven render.
  return (
    <CodeBlockEditor
      ariaLabel='Edit message'
      language='markdown'
      onChange={() => undefined}
      onKeyDown={() => undefined}
      value={value}
    />
  )
}

describe('CodeBlockEditor', () => {
  test('keeps the same editor instance when value and onKeyDown change on rerender', () => {
    const { rerender } = render(editorTree('h'))

    const contentBefore = document.querySelector('.cm-content')
    expect(contentBefore).not.toBeNull()

    rerender(editorTree('hi'))

    const contentAfter = document.querySelector('.cm-content')
    // If the EditorView were torn down and rebuilt, the content node would be
    // replaced and the cursor would reset to the document start, making typed
    // characters pile up at the beginning (text appears right-to-left).
    expect(contentAfter).toBe(contentBefore)
    expect(contentAfter?.textContent).toContain('hi')
  })
})
