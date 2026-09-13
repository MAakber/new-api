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
import { useTranslation } from 'react-i18next'

import { MessageContent } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'

import { parseThinkTags } from '../../lib/message/message-reasoning-utils'
import type { PlaygroundRun, PlaygroundToolCall } from '../../types'

type Props = { run: PlaygroundRun; final: boolean }

const toolStates = {
  running: 'input-available',
  completed: 'output-available',
  error: 'output-error',
  cancelled: 'output-cancelled',
} as const

function MessageToolStep(props: { tool: PlaygroundToolCall }) {
  const { t } = useTranslation()
  return (
    <Tool defaultOpen={props.tool.state === 'error'} className='max-w-[78ch]'>
      <ToolHeader
        type={`tool-${props.tool.name}`}
        title={`${props.tool.server_name} · ${props.tool.name}`}
        state={toolStates[props.tool.state]}
      />
      <ToolContent>
        <p className='text-muted-foreground px-4 text-xs'>
          {t('{{value}}s', {
            value: (props.tool.duration_ms / 1000).toFixed(2),
          })}
        </p>
        <ToolInput input={props.tool.input} />
        <ToolOutput output={props.tool.output} errorText={props.tool.error} />
      </ToolContent>
    </Tool>
  )
}

export function MessageToolTimeline(props: Props) {
  const tools = new Map(props.run.tool_calls.map((tool) => [tool.id, tool]))
  const segments = new Map<string, number>()
  return (
    <div className='w-full min-w-0 space-y-3'>
      {props.run.parts.map((part, index) => {
        if (part.type === 'tool') {
          const tool = tools.get(part.tool_call_id ?? '')
          return tool ? (
            <MessageToolStep
              key={`${props.run.run_id}:${tool.id}`}
              tool={tool}
            />
          ) : null
        }
        // Parts only append during a run. Number each kind within its model
        // round so growing text keeps its identity and another run resets it.
        const group = `${props.run.run_id}:${part.round_id}:${part.type}`
        const segment = segments.get(group) ?? 0
        segments.set(group, segment + 1)
        const key = `${group}:${segment}`
        const streaming = !props.final && index === props.run.parts.length - 1
        if (part.type === 'reasoning') {
          return (
            <Reasoning key={key} isStreaming={streaming}>
              <ReasoningTrigger />
              <ReasoningContent>{part.text ?? ''}</ReasoningContent>
            </Reasoning>
          )
        }
        const parsed = parseThinkTags(part.text ?? '')
        return (
          <div key={key}>
            {parsed.reasoning && (
              <Reasoning isStreaming={streaming && parsed.hasUnclosedTag}>
                <ReasoningTrigger />
                <ReasoningContent>{parsed.reasoning}</ReasoningContent>
              </Reasoning>
            )}
            {parsed.visibleContent && (
              <MessageContent
                variant='flat'
                className='w-full max-w-[78ch] min-w-0'
              >
                <Response final={!streaming}>{parsed.visibleContent}</Response>
              </MessageContent>
            )}
          </div>
        )
      })}
    </div>
  )
}
