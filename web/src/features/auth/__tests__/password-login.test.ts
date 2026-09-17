import {
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  webcrypto,
} from 'node:crypto'

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
    {
      name: 'Web Crypto legacy RSA',
      crypto: webcrypto,
      password: '密码-🔐',
      envelope: false,
    },
    {
      name: 'HTTP fallback legacy RSA',
      crypto: undefined,
      password: '密码-🔐',
      envelope: false,
    },
    {
      name: 'Web Crypto long Unicode',
      crypto: webcrypto,
      password: '密🔒 '.repeat(32),
      envelope: true,
    },
    {
      name: 'HTTP fallback long Unicode',
      crypto: undefined,
      password: '密🔒 '.repeat(32),
      envelope: true,
    },
  ])(
    'sends only ciphertext using $name through the configured API proxy',
    async ({ crypto, password, envelope }) => {
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
          if (envelope) {
            const [version, wrappedKey, nonce, encoded] =
              body.password_encrypted.split('.')
            expect(version).toBe('v2')
            const secret = privateDecrypt(
              {
                key: keys.privateKey,
                oaepHash: 'sha256',
                oaepLabel: Buffer.from('password-v2'),
              },
              Buffer.from(wrappedKey, 'base64')
            )
            const ciphertext = Buffer.from(encoded, 'base64')
            const decipher = createDecipheriv(
              'aes-256-gcm',
              secret,
              Buffer.from(nonce, 'base64')
            )
            decipher.setAAD(Buffer.from('password-v2:fixture-key'))
            decipher.setAuthTag(ciphertext.subarray(-16))
            const plaintext = Buffer.concat([
              decipher.update(ciphertext.subarray(0, -16)),
              decipher.final(),
            ])
            expect(plaintext.toString()).toBe(password)
          } else {
            expect(
              privateDecrypt(
                { key: keys.privateKey, oaepHash: 'sha256' },
                Buffer.from(body.password_encrypted, 'base64')
              ).toString()
            ).toBe(password)
          }
          expect(config.skipAuthRefresh).toBe(true)
          data = { success: true }
        }
        return { data, config, status: 200, statusText: 'OK', headers: {} }
      }
      await login({
        username: 'fixture-user',
        password,
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
