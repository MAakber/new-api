import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  taskEnumLabel,
  taskUsageUnitLabel,
} from '@/features/pricing/lib/task-price-display'
import type { BillingUsageSchema } from '@/features/pricing/types'
import { resolveLocalizedText } from '@/lib/localized-text'

type UsageSchemaTableProps = {
  schema: BillingUsageSchema
}

function getUsageTypeLabelKey(
  type: BillingUsageSchema[string]['type']
): string {
  if (type === 'number') return 'Number'
  if (type === 'boolean') return 'Boolean'
  return 'Enum'
}

function formatUsageUnit(
  unit: BillingUsageSchema[string]['unit'],
  t: (key: string) => string
): string {
  if (unit === 'second') return t('Second')
  if (unit === 'count') return t('Count')
  if (unit === 'token') return t('token (unit)')
  if (unit === 'credit') return t('credit')
  return '—'
}

export function UsageSchemaTable(props: UsageSchemaTableProps) {
  const { t, i18n } = useTranslation()
  const entries = Object.entries(props.schema).sort(([left], [right]) =>
    left.localeCompare(right)
  )

  return (
    <div className='overflow-x-auto rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Type')}</TableHead>
            <TableHead>{t('Unit')}</TableHead>
            <TableHead>{t('Enum values')}</TableHead>
            <TableHead>{t('Description')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, definition]) => (
            <TableRow key={name}>
              <TableCell className='max-w-64 font-mono text-xs break-words whitespace-normal'>
                {name}
              </TableCell>
              <TableCell>{t(getUsageTypeLabelKey(definition.type))}</TableCell>
              <TableCell>
                {taskUsageUnitLabel(
                  definition,
                  i18n.language,
                  formatUsageUnit(definition.unit, t)
                )}
              </TableCell>
              <TableCell className='max-w-64 font-mono text-xs break-words whitespace-normal'>
                {definition.enum
                  ?.map((value) => {
                    const label = taskEnumLabel(
                      definition,
                      value,
                      i18n.language
                    )
                    return label === value ? value : `${value} → ${label}`
                  })
                  .join(', ') || '—'}
              </TableCell>
              <TableCell className='min-w-48 break-words whitespace-normal'>
                {resolveLocalizedText(definition.description, i18n.language) ||
                  '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
