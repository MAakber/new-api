/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { generateKeyPairSync, privateDecrypt, webcrypto } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { login } from '../api'
import { clearPasswordEncryptionCache } from '../lib/password-encryption'

const originalAdapter = api.defaults.adapter
const originalBaseURL = api.defaults.baseURL
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

beforeEach(() => {
  clearPasswordEncryptionCache()
  api.defaults.baseURL = '/local-proxy'
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  api.defaults.baseURL = originalBaseURL
  clearPasswordEncryptionCache()
  vi.unstubAllGlobals()
})

describe('password login transport', () => {
  it('keeps the ordinary login request when encryption is disabled', async () => {
    const requests: string[] = []
    api.defaults.adapter = async (config) => {
      requests.push(config.url ?? '')
      expect(config.baseURL).toBe('/local-proxy')
      expect(JSON.parse(config.data)).toEqual({
        username: 'fixture-user',
        password: 'fixture-password',
      })
      expect(config.skipAuthRefresh).toBe(true)
      return {
        data: { success: true },
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
      }
    }
    await expect(
      login({
        username: 'fixture-user',
        password: 'fixture-password',
        turnstile: 'solved-token',
      })
    ).resolves.toEqual({ success: true })
    expect(requests).toEqual(['/api/user/login?turnstile=solved-token'])
  })

  it.each([
    { name: 'Web Crypto', crypto: webcrypto },
    { name: 'HTTP fallback', crypto: undefined },
  ])(
    'sends only ciphertext using $name through the configured API proxy',
    async ({ crypto }) => {
      vi.stubGlobal('crypto', crypto)
      const requests: string[] = []
      api.defaults.adapter = async (config) => {
        requests.push(config.url ?? '')
        expect(config.baseURL).toBe('/local-proxy')
        let data: object
        if (config.method === 'get') {
          data = {
            success: true,
            data: {
              enabled: true,
              kid: 'fixture-key',
              public_key: keys.publicKey,
            },
          }
        } else {
          const body = JSON.parse(config.data)
          expect(Object.keys(body).sort()).toEqual([
            'encryption_key_id',
            'password_encrypted',
            'username',
          ])
          expect(body.username).toBe('fixture-user')
          expect(body.encryption_key_id).toBe('fixture-key')
          expect(
            privateDecrypt(
              { key: keys.privateKey, oaepHash: 'sha256' },
              Buffer.from(body.password_encrypted, 'base64')
            ).toString()
          ).toBe('密码-🔐')
          expect(config.skipAuthRefresh).toBe(true)
          data = { success: true }
        }
        return { data, config, status: 200, statusText: 'OK', headers: {} }
      }
      await login({
        username: 'fixture-user',
        password: '密码-🔐',
        passwordEncryptionEnabled: true,
        turnstile: 'solved-token',
      })
      expect(requests).toEqual([
        '/api/user/login/encryption-key',
        '/api/user/login?turnstile=solved-token',
      ])
    }
  )

  it('fails closed when the server key is unavailable and retries with a fresh key', async () => {
    vi.stubGlobal('crypto', webcrypto)
    let available = false
    const requests: string[] = []
    api.defaults.adapter = async (config) => {
      requests.push(config.url ?? '')
      let data: object = { success: true }
      if (config.method === 'get') {
        data = available
          ? {
              success: true,
              data: { kid: 'fixture-key', public_key: keys.publicKey },
            }
          : { success: false }
      }
      return { data, config, status: 200, statusText: 'OK', headers: {} }
    }
    const payload = {
      username: 'fixture-user',
      password: 'fixture-password',
      passwordEncryptionEnabled: true,
    }
    await expect(login(payload)).rejects.toThrow()
    expect(requests).toEqual(['/api/user/login/encryption-key'])
    available = true
    await expect(login(payload)).resolves.toEqual({ success: true })
    expect(requests).toEqual([
      '/api/user/login/encryption-key',
      '/api/user/login/encryption-key',
      '/api/user/login?turnstile=',
    ])
  })

  it('refreshes the key after rejected credentials instead of retaining a stale key', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const requests: string[] = []
    api.defaults.adapter = async (config) => {
      requests.push(config.url ?? '')
      const data =
        config.method === 'get'
          ? {
              success: true,
              data: { kid: 'fixture-key', public_key: keys.publicKey },
            }
          : { success: false }
      return { data, config, status: 200, statusText: 'OK', headers: {} }
    }
    const payload = {
      username: 'fixture-user',
      password: 'fixture-password',
      passwordEncryptionEnabled: true,
    }
    await login(payload)
    await login(payload)
    expect(requests).toEqual([
      '/api/user/login/encryption-key',
      '/api/user/login?turnstile=',
      '/api/user/login/encryption-key',
      '/api/user/login?turnstile=',
    ])
  })
})
