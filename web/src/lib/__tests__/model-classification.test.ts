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
import { describe, expect, it } from 'vitest'

import { classifyModel } from '../model-classification'

describe('model classification', () => {
  it.each([
    ['grok-4', 'xAI', ['chat']],
    ['X-AI/GROK-4:free', 'xAI', ['chat']],
    ['grok-imagine-image-pro', 'xAI', ['image']],
    ['grok-imagine-video', 'xAI', ['video']],
    ['grok-2-vision-1212', 'xAI', ['chat']],
    ['gpt-image-2', 'OpenAI', ['image']],
    ['sora-2-pro', 'OpenAI', ['video']],
    ['gpt-4o-mini-tts', 'OpenAI', ['audio']],
    ['gpt-4o-audio-preview', 'OpenAI', ['chat', 'audio']],
    ['gpt-realtime-whisper', 'OpenAI', ['audio']],
    ['text-embedding-3-large', 'OpenAI', ['embedding']],
    ['us.anthropic.claude-3-5-sonnet-20241022-v2:0', 'Anthropic', ['chat']],
    ['models/gemini-3-pro-image', 'Google', ['chat', 'image']],
    ['gemini-2.5-flash-native-audio-latest', 'Google', ['chat', 'audio']],
    ['gemini-2.5-flash-preview-tts', 'Google', ['audio']],
    ['google/imagen-4.0-generate-001', 'Google', ['image']],
    ['veo-3.1-generate-preview', 'Google', ['video']],
    ['Qwen/Qwen3-VL-32B', 'Alibaba', ['chat']],
    ['qwen3-omni-flash', 'Alibaba', ['chat', 'audio']],
    ['Qwen/Qwen3-Embedding-8B', 'Alibaba', ['embedding']],
    ['Qwen/Qwen3-Reranker-8B', 'Alibaba', ['rerank']],
    ['wan2.2-t2v-plus', 'Alibaba', ['video']],
    ['doubao-seedream-4-0-250828', 'ByteDance', ['image']],
    ['seedance-1-0-pro-250528', 'ByteDance', ['video']],
    ['MiniMax-M2.7', 'MiniMax', ['chat']],
    ['speech-2.5-hd-preview', 'MiniMax', ['audio']],
    ['image-01', 'MiniMax', ['image']],
    ['black-forest-labs/FLUX.1-dev', 'Black Forest Labs', ['image']],
    ['stabilityai/stable-diffusion-xl-base-1.0', 'Stability AI', ['image']],
    ['jina-clip-v1', 'Jina AI', ['embedding']],
    ['jina-reranker-v2-base-multilingual', 'Jina AI', ['rerank']],
    ['BAAI/bge-m3', 'BAAI', ['embedding']],
    ['BAAI/bge-reranker-v2-m3', 'BAAI', ['rerank']],
    ['moka-ai/m3e-base', 'MokaAI', ['embedding']],
    ['SparkDesk-v4.0', 'iFlyTek', ['chat']],
    ['CogVideoX-5b', 'Zhipu', ['video']],
  ])('classifies %s by publisher and known uses', (id, vendor, types) => {
    const result = classifyModel(id)
    expect(result.provider?.name).toBe(vendor)
    expect(result.types).toEqual(types)
  })

  it.each([
    ['deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', 'DeepSeek'],
    ['DeepSeek-R1-Distill-Llama-70B', 'DeepSeek'],
    ['nvidia/Llama-3.1-Nemotron-70B-Instruct', 'NVIDIA'],
    ['Qwen/DeepSeek-R1-Distill-Llama-8B', 'Alibaba'],
    ['openrouter/x-ai/grok-4', 'xAI'],
  ])(
    'keeps the publisher of %s when the name includes another family',
    (id, vendor) => {
      expect(classifyModel(id).provider?.name).toBe(vendor)
    }
  )

  it.each([
    'custom-model',
    'notgrok-4',
    'business-o3-report',
    'my-gpt-wrapper',
    '',
  ])(
    'leaves unrecognized name %s in Other instead of guessing from a substring',
    (id) =>
      expect(classifyModel(id)).toEqual({ provider: null, types: ['other'] })
  )

  it('keeps an explicit publisher without inventing a use for its custom model', () => {
    const model = classifyModel('openai/custom-private-deployment')
    expect(model.provider?.name).toBe('OpenAI')
    expect(model.types).toEqual(['other'])
  })
})
