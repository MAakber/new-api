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
