import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { isValidTaskPublicAddress } from '../general/task-public-address'

describe('async task public address', () => {
  test('allows an empty fallback or an absolute HTTP(S) media base URL', () => {
    for (const value of [
      '',
      'https://media.example.com',
      'https://media.example.com/task-content',
      'http://127.0.0.1:8080/nginx/tasks',
      'http://localhost:3000/media',
    ]) {
      assert.equal(isValidTaskPublicAddress(value), true, value)
    }
  })

  test('rejects credentials, query parameters, fragments, and non-HTTP URLs', () => {
    for (const value of [
      'media.example.com/tasks',
      '/media/tasks',
      'ftp://media.example.com/tasks',
      'https://user:secret@media.example.com/tasks',
      'https://@media.example.com/tasks',
      'https://media.example.com/tasks?token=secret',
      'https://media.example.com/tasks#preview',
      ' https://media.example.com/tasks',
      'https://media.example.com/tasks\n',
      'https:\\\\media.example.com\\tasks',
      'https://',
    ]) {
      assert.equal(isValidTaskPublicAddress(value), false, value)
    }
  })
})
