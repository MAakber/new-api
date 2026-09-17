export const MODEL_TYPES = [
  'chat',
  'image',
  'video',
  'audio',
  'embedding',
  'rerank',
  'other',
] as const

export type ModelType = (typeof MODEL_TYPES)[number]

export interface ModelProvider {
  id: string
  name: string
  icon: string
  /** Keep the model-family label used by existing log badges. */
  label: string
}

export interface ModelClassification {
  provider: ModelProvider | null
  types: ModelType[]
}

interface ProviderRule {
  provider: ModelProvider
  namespaces: readonly string[]
  family: RegExp
}

const PROVIDER_RULES: readonly ProviderRule[] = [
  {
    provider: {
      id: 'openai',
      name: 'OpenAI',
      icon: 'OpenAI.Color',
      label: 'OpenAI',
    },
    namespaces: ['openai', 'azure-openai'],
    family:
      /^(?:gpt(?:-|$)|chatgpt(?:-|$)|codex(?:-|$)|o[1-9](?:[-.]|$)|text-(?:embedding-(?:ada|3)|moderation|ada|babbage|curie)(?:-|$)|davinci(?:-|$)|babbage(?:-|$)|computer-use-preview(?:-|$)|omni-moderation(?:-|$)|dall-e(?:-|$)|whisper(?:-|$)|tts(?:-|$)|sora(?:[-.]|$))/,
  },
  {
    provider: {
      id: 'anthropic',
      name: 'Anthropic',
      icon: 'Claude.Color',
      label: 'Claude',
    },
    namespaces: ['anthropic'],
    family: /^(?:claude|anthropic)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'google',
      name: 'Google',
      icon: 'Gemini.Color',
      label: 'Gemini',
    },
    namespaces: ['google', 'google-deepmind', 'gemini'],
    family:
      /^(?:gemini|gemma|learnlm|imagen|veo|nano-banana|deep-research-pro|palm|aqa)(?:[-.]|\d|$)/,
  },
  {
    provider: { id: 'xai', name: 'xAI', icon: 'Grok.Color', label: 'Grok' },
    namespaces: ['x-ai', 'xai'],
    family: /^(?:grok|xai)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: 'DeepSeek.Color',
      label: 'DeepSeek',
    },
    namespaces: ['deepseek', 'deepseek-ai'],
    family: /^deepseek(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'alibaba',
      name: 'Alibaba',
      icon: 'Qwen.Color',
      label: 'Qwen',
    },
    namespaces: ['alibaba', 'qwen', 'qwenlm', 'wan-ai', 'wan'],
    family:
      /^(?:qwen|qwq|qvq|wanx?|tongyi|gte|gui-plus|z-image|text-embedding-v\d+)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'zhipu',
      name: 'Zhipu',
      icon: 'Zhipu.Color',
      label: 'Zhipu',
    },
    namespaces: ['zhipu', 'z-ai', 'zai-org', 'thudm'],
    family: /^(?:glm|chatglm|cogview|cogvideox?)(?:[-.]|\d|$)/,
  },
  {
    provider: { id: 'meta', name: 'Meta', icon: 'Meta.Color', label: 'Meta' },
    namespaces: ['meta', 'meta-llama'],
    family: /^(?:meta-)?llama(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'mistral',
      name: 'Mistral',
      icon: 'Mistral.Color',
      label: 'Mistral',
    },
    namespaces: ['mistral', 'mistralai'],
    family:
      /^(?:mistral|mixtral|ministral|magistral|codestral|devstral|pixtral|voxtral)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'bytedance',
      name: 'ByteDance',
      icon: 'Doubao.Color',
      label: 'Doubao',
    },
    namespaces: ['bytedance', 'volcengine', 'doubao', 'bytedance-seed'],
    family: /^(?:doubao|seedream|seedance|seed-1)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'moonshot',
      name: 'Moonshot',
      icon: 'Moonshot.Color',
      label: 'Moonshot',
    },
    namespaces: ['moonshot', 'moonshotai', 'moonshot-ai'],
    family: /^(?:moonshot|kimi)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'minimax',
      name: 'MiniMax',
      icon: 'Minimax.Color',
      label: 'MiniMax',
    },
    namespaces: ['minimax', 'minimaxai', 'minimax-ai'],
    family:
      /^(?:minimax(?:[-.]|$)|abab\d|hailuo(?:[-.]|\d|$)|speech-\d|image-01(?:-|$)|music-\d|video-01(?:-|$)|(?:t2v|i2v|s2v)-01(?:-|$))/,
  },
  {
    provider: {
      id: 'xiaomi',
      name: 'Xiaomi',
      icon: 'XiaomiMiMo',
      label: 'MiMo',
    },
    namespaces: ['xiaomi', 'xiaomimimo'],
    family: /^mimo(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'baidu',
      name: 'Baidu',
      icon: 'Wenxin.Color',
      label: 'Baidu',
    },
    namespaces: ['baidu', 'baidubce', 'paddlepaddle'],
    family: /^(?:ernie|wenxin|baidu)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'iflytek',
      name: 'iFlyTek',
      icon: 'Spark.Color',
      label: 'iFlyTek',
    },
    namespaces: ['iflytek'],
    family: /^spark(?:desk)?(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'tencent',
      name: 'Tencent',
      icon: 'Hunyuan.Color',
      label: 'Tencent',
    },
    namespaces: ['tencent', 'tencent-hunyuan'],
    family: /^(?:hunyuan(?:[-.]|\d|$)|hy\d*(?:[-.]|$))/,
  },
  {
    provider: {
      id: 'baichuan',
      name: 'Baichuan',
      icon: 'Baichuan.Color',
      label: 'Baichuan',
    },
    namespaces: ['baichuan', 'baichuan-inc'],
    family: /^baichuan(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'internlm',
      name: 'InternLM',
      icon: 'InternLM.Color',
      label: 'InternLM',
    },
    namespaces: ['internlm'],
    family: /^internlm(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'stepfun',
      name: 'StepFun',
      icon: 'Stepfun.Color',
      label: 'StepFun',
    },
    namespaces: ['stepfun', 'stepfun-ai'],
    family: /^step(?:[-.]|\d|$)/,
  },
  {
    provider: { id: '01ai', name: '01.AI', icon: 'Yi.Color', label: 'Yi' },
    namespaces: ['01-ai', '01ai'],
    family: /^yi(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'cohere',
      name: 'Cohere',
      icon: 'Cohere.Color',
      label: 'Cohere',
    },
    namespaces: ['cohere', 'cohereforai'],
    family:
      /^(?:command(?:-|$)|cohere(?:-|$)|c4ai(?:-|$)|aya(?:[-.]|$)|(?:embed|rerank)-(?:english|multilingual)(?:[-.]|$))/,
  },
  {
    provider: {
      id: 'bfl',
      name: 'Black Forest Labs',
      icon: 'Flux',
      label: 'FLUX',
    },
    namespaces: ['black-forest-labs', 'bfl'],
    family: /^flux(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'stability',
      name: 'Stability AI',
      icon: 'Stability.Color',
      label: 'Stability AI',
    },
    namespaces: ['stability', 'stabilityai', 'stability-ai'],
    family: /^(?:stable-diffusion|stable-image|sdxl|sd3)(?:[-.]|$)/,
  },
  {
    provider: { id: 'jina', name: 'Jina AI', icon: 'Jina', label: 'Jina AI' },
    namespaces: ['jina', 'jinaai', 'jina-ai'],
    family: /^jina(?:[-.]|$)/,
  },
  {
    provider: { id: 'baai', name: 'BAAI', icon: 'BAAI', label: 'BAAI' },
    namespaces: ['baai'],
    family: /^bge(?:[-.]|$)/,
  },
  {
    provider: { id: 'mokaai', name: 'MokaAI', icon: 'Moka', label: 'MokaAI' },
    namespaces: ['moka-ai', 'mokaai'],
    family: /^m3e(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'kuaishou',
      name: 'Kuaishou',
      icon: 'Kling.Color',
      label: 'Kling',
    },
    namespaces: ['kuaishou', 'kling', 'kwai', 'kwai-kolors'],
    family: /^(?:kling|kolors)(?:[-.]|\d|$)/,
  },
  {
    provider: { id: 'luma', name: 'Luma', icon: 'Luma', label: 'Luma' },
    namespaces: ['luma', 'luma-ai', 'lumalabs'],
    family: /^(?:luma|ray)(?:[-.]|\d|$)/,
  },
  {
    provider: { id: 'runway', name: 'Runway', icon: 'Runway', label: 'Runway' },
    namespaces: ['runway', 'runwayml'],
    family: /^gen-[34](?:[-.]|$)/,
  },
  {
    provider: { id: 'suno', name: 'Suno', icon: 'Suno', label: 'Suno' },
    namespaces: ['suno'],
    family: /^(?:suno|chirp)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'perplexity',
      name: 'Perplexity',
      icon: 'Perplexity.Color',
      label: 'Perplexity',
    },
    namespaces: ['perplexity'],
    family: /^(?:sonar|pplx)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'nvidia',
      name: 'NVIDIA',
      icon: 'Nvidia.Color',
      label: 'NVIDIA',
    },
    namespaces: ['nvidia'],
    family: /^(?:nemotron|nvidia)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'microsoft',
      name: 'Microsoft',
      icon: 'Microsoft.Color',
      label: 'Microsoft',
    },
    namespaces: ['microsoft'],
    family: /^phi(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'amazon',
      name: 'Amazon',
      icon: 'Aws.Color',
      label: 'Amazon',
    },
    namespaces: ['amazon', 'aws'],
    family: /^(?:nova|titan)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'ai21',
      name: 'AI21 Labs',
      icon: 'Ai21',
      label: 'AI21 Labs',
    },
    namespaces: ['ai21', 'ai21labs'],
    family: /^(?:ai21|jamba)(?:[-.]|$)/,
  },
  {
    provider: {
      id: 'nous',
      name: 'Nous Research',
      icon: 'NousResearch',
      label: 'Nous Research',
    },
    namespaces: ['nousresearch'],
    family: /^hermes(?:[-.]|$)/,
  },
  {
    provider: {
      id: '360ai',
      name: '360 AI',
      icon: 'Ai360.Color',
      label: '360 AI',
    },
    namespaces: ['360ai', '360zhinao'],
    family: /^360(?:gpt|zhinao)(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'midjourney',
      name: 'Midjourney',
      icon: 'Midjourney',
      label: 'Midjourney',
    },
    namespaces: ['midjourney'],
    family: /^(?:(?:midjourney|mj)(?:[-.]|$)|swap-face$)/,
  },
  {
    provider: { id: 'vidu', name: 'Vidu', icon: 'Vidu.Color', label: 'Vidu' },
    namespaces: ['vidu'],
    family: /^vidu(?:[-.]|\d|$)/,
  },
  {
    provider: {
      id: 'jimeng',
      name: 'Jimeng',
      icon: 'Jimeng.Color',
      label: 'Jimeng',
    },
    namespaces: ['jimeng'],
    family: /^jimeng(?:[-.]|\d|$)/,
  },
]

const PROVIDERS_BY_NAMESPACE = new Map(
  PROVIDER_RULES.flatMap((rule) =>
    rule.namespaces.map((namespace) => [namespace, rule.provider] as const)
  )
)

const RERANK_MODEL = /(?:^|[-.])rerank(?:er)?(?:[-.]|\d|$)/
const EMBEDDING_MODEL =
  /(?:^|[-.])(?:embed(?:ding)?s?|text2vec|m3e|bge|e5|gte)(?:[-.]|\d|$)|^jina-clip(?:-|$)/
const VIDEO_MODEL =
  /^(?:grok-imagine-video|sora|veo|wan|cogvideox?|(?:doubao-)?seedance|kling|hunyuan-video|(?:minimax-)?hailuo|video-01|luma|ray|gen-[34])(?:[-.]|\d|$)/
const CHAT_IMAGE_MODEL = /^(?:gemini-.*-image(?:-|$)|nano-banana(?:-|$))/
const IMAGE_MODEL =
  /^(?:gpt-image|chatgpt-image|dall-e|imagen|flux|(?:doubao-)?seedream|stable-diffusion|stable-image|sdxl|sd3|cogview|hunyuan-image|grok-(?:imagine-image|2-image)|image-01|kolors|qwen(?:\d(?:\.\d)?)?-image)(?:[-.]|\d|$)/
const AUDIO_MODEL =
  /(?:^|[-.])(?:tts|whisper|transcrib(?:e|ing)|transcription|speech|audio|realtime|asr)(?:[-.]|\d|$)|^(?:suno|chirp|music|voxtral)(?:[-.]|\d|$)|^qwen.*-omni(?:-|$)/
const CHAT_AUDIO_MODEL =
  /^(?:gpt-.*(?:audio|realtime)|gemini-.*(?:native-audio|live)|qwen.*-(?:omni|audio)|voxtral)(?:[-.]|\d|$)/
const AUDIO_ONLY_MODEL =
  /(?:^|[-.])(?:tts|whisper|transcribe|transcription|asr)(?:[-.]|\d|$)/
const CHAT_MODEL =
  /^(?:gpt|chatgpt|o[1-9]|claude|gemini|gemma|learnlm|deep-research-pro|grok|deepseek|qwen|qwq|qvq|glm|chatglm|(?:meta-)?llama|mistral|mixtral|ministral|magistral|codestral|devstral|pixtral|doubao|moonshot|kimi|minimax|abab|mimo|ernie|spark(?:desk)?|hunyuan|baichuan|internlm|step|yi|command|c4ai|aya|sonar|pplx|nemotron|phi)(?:[-.]|\d|$)/

/**
 * Display classification only. Namespaces identify the publisher; model-family
 * patterns describe known uses and do not claim to verify runtime capabilities.
 */
export function classifyModel(modelName: string): ModelClassification {
  const parts = modelName.trim().toLowerCase().replaceAll('_', '-').split('/')
  let name = parts.at(-1) || ''
  let provider: ModelProvider | null = null

  for (const namespace of parts.slice(0, -1)) {
    const match = PROVIDERS_BY_NAMESPACE.get(namespace)
    if (match) {
      provider = match
      break
    }
  }

  // Bedrock IDs can include a region prefix and a dotted publisher namespace.
  name = name.replace(/^(?:us|eu|apac|global)\./, '')
  const dot = name.indexOf('.')
  const dottedProvider = PROVIDERS_BY_NAMESPACE.get(name.slice(0, dot))
  if (dot > 0 && dottedProvider) {
    provider ??= dottedProvider
    name = name.slice(dot + 1)
  }
  // Ollama tags and OpenRouter variants leave the underlying family intact.
  name = name.split(':')[0]
  // A publisher's named derivative takes precedence over its Llama/Mixtral base
  // family. An explicit namespace above still wins, including custom mirrors.
  if (!provider && /^(?:llama|mixtral)[-.].*-nemotron(?:[-.]|$)/.test(name)) {
    provider = PROVIDERS_BY_NAMESPACE.get('nvidia') ?? null
  }
  if (!provider && /^(?:llama|mixtral)[-.].*-sonar(?:[-.]|$)/.test(name)) {
    provider = PROVIDERS_BY_NAMESPACE.get('perplexity') ?? null
  }
  provider ??=
    PROVIDER_RULES.find((rule) => rule.family.test(name))?.provider ?? null

  let types: ModelType[] = ['other']
  if (RERANK_MODEL.test(name)) types = ['rerank']
  else if (EMBEDDING_MODEL.test(name)) types = ['embedding']
  else if (VIDEO_MODEL.test(name)) types = ['video']
  else if (CHAT_IMAGE_MODEL.test(name)) types = ['chat', 'image']
  else if (IMAGE_MODEL.test(name)) types = ['image']
  else if (AUDIO_MODEL.test(name)) {
    types =
      CHAT_AUDIO_MODEL.test(name) && !AUDIO_ONLY_MODEL.test(name)
        ? ['chat', 'audio']
        : ['audio']
  } else if (CHAT_MODEL.test(name)) types = ['chat']

  return { provider, types }
}
