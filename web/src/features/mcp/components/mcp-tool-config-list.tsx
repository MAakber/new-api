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

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import type { MCPToolConfig, MCPToolKind } from '../types'

type Props = {
  tools: MCPToolConfig[]
  onChange: (tools: MCPToolConfig[]) => void
  disabled?: boolean
}

export function MCPToolConfigList(props: Props) {
  const { t } = useTranslation()
  const labels: Record<MCPToolKind, string> = {
    search: t('Search'),
    fetch: t('Fetch page'),
    tool: t('General tool'),
  }
  function update(index: number, patch: Partial<MCPToolConfig>) {
    props.onChange(
      props.tools.map((tool, itemIndex) =>
        itemIndex === index ? { ...tool, ...patch } : tool
      )
    )
  }
  return (
    <div className='space-y-3'>
      {props.tools.map((tool, index) => (
        <div key={tool.name} className='space-y-3 rounded-lg border p-3'>
          <div className='flex min-w-0 items-start justify-between gap-3'>
            <div className='min-w-0'>
              <Label htmlFor={`mcp-enable-${index}`} className='break-all'>
                {tool.name}
              </Label>
              <p className='text-muted-foreground mt-1 line-clamp-3 text-xs break-words'>
                {tool.description}
              </p>
            </div>
            <Switch
              id={`mcp-enable-${index}`}
              checked={tool.enabled}
              disabled={props.disabled || !tool.read_only}
              onCheckedChange={(enabled) => update(index, { enabled })}
            />
          </div>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <Label className='text-xs font-normal'>
              <Checkbox
                checked={tool.read_only}
                disabled={props.disabled}
                onCheckedChange={(readOnly) =>
                  update(index, {
                    read_only: readOnly === true,
                    enabled: readOnly === true && tool.enabled,
                  })
                }
              />
              {t('Read-only access confirmed')}
            </Label>
            <Select
              value={tool.kind}
              items={labels}
              disabled={props.disabled}
              onValueChange={(kind) => {
                if (kind) update(index, { kind: kind as MCPToolKind })
              }}
            >
              <SelectTrigger
                aria-label={`${tool.name}: ${t('Tool purpose')}`}
                size='sm'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(labels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  )
}
