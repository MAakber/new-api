import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getGroups } from '@/features/users/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { saveMCPServer, testMCPServer } from '../api'
import {
  buildMCPServerInput,
  createMCPServerSchema,
  type MCPServerFormValues,
} from '../lib/server-form'
import type { MCPServerConfig } from '../types'
import { MCPToolConfigList } from './mcp-tool-config-list'

type Props = { server: MCPServerConfig; onClose: () => void }

export function MCPServerDialog(props: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<MCPServerFormValues>({
    resolver: zodResolver(createMCPServerSchema(t)),
    defaultValues: {
      ...props.server,
      headersJSON: '',
      queryJSON: '',
      clearCredentials: false,
    },
  })
  const tools = useWatch({ control: form.control, name: 'tools' })
  const clearCredentials = useWatch({
    control: form.control,
    name: 'clearCredentials',
  })
  const groups = useQuery({
    queryKey: ['mcp', 'groups'],
    queryFn: async () => {
      const result = await getGroups()
      requireServerSuccess(result)
      return result.data ?? []
    },
  })
  const save = useMutation({
    gcTime: 0,
    mutationFn: () =>
      saveMCPServer(buildMCPServerInput(props.server, form.getValues())),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp'] })
      toast.success(t('MCP service saved'))
      props.onClose()
    },
    onError: (error) => handleServerError(error),
  })
  const discover = useMutation({
    gcTime: 0,
    mutationFn: () =>
      testMCPServer(buildMCPServerInput(props.server, form.getValues())),
    onSuccess: (discovered) => {
      const previous = form.getValues('tools')
      form.setValue(
        'tools',
        discovered.map((tool) => {
          const approved = previous.find(
            (item) =>
              item.name === tool.name && item.schema_hash === tool.schema_hash
          )
          return {
            name: tool.name,
            description: tool.description,
            enabled: approved?.enabled ?? false,
            read_only: approved?.read_only ?? false,
            kind: approved?.kind ?? 'tool',
            schema_hash: tool.schema_hash ?? '',
          }
        }),
        { shouldDirty: true }
      )
      toast.success(
        t('Connection successful. Review and enable the discovered tools.')
      )
    },
    onError: (error) => handleServerError(error),
  })
  const busy = save.isPending || discover.isPending

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose()
      }}
      title={props.server.id ? t('Edit MCP service') : t('Add MCP service')}
      description={t(
        'Connect a Streamable HTTP MCP service and choose which read-only tools users can access.'
      )}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={busy} type='submit' form='mcp-server-form'>
            {save.isPending ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='mcp-server-form'
          autoComplete='off'
          onSubmit={form.handleSubmit(() => save.mutate())}
        >
          <fieldset disabled={busy} className='space-y-5'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-2 rounded-lg border px-3'>
                    <FormLabel>{t('Enabled')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={busy}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('MCP endpoint')}</FormLabel>
                  <FormControl>
                    <Input
                      type='url'
                      placeholder='https://mcp.example.com/mcp'
                      {...field}
                      onChange={(event) => {
                        field.onChange(event)
                        form.setValue('tools', [])
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Use the final endpoint URL. Put authentication query parameters in the credentials fields below.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='groups'
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor='mcp-allowed-groups'>
                    {t('Allowed user groups')}
                  </FormLabel>
                  <MultiSelect
                    id='mcp-allowed-groups'
                    placeholder={t('Allowed user groups')}
                    options={(groups.data ?? []).map((group) => ({
                      value: group,
                      label: group,
                    }))}
                    selected={field.value}
                    onChange={field.onChange}
                    allowCreate
                    disabled={busy}
                  />
                  <FormDescription>
                    {t(
                      'Access follows the account group, not the billing group selected in chat.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='timeout_seconds'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Timeout (seconds)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={120}
                        {...field}
                        onChange={(event) =>
                          field.onChange(Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='max_concurrency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Concurrent tool calls')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={8}
                        {...field}
                        onChange={(event) =>
                          field.onChange(Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='space-y-4 rounded-lg border p-3'>
              <p className='text-muted-foreground text-xs'>
                {props.server.credential_set
                  ? t(
                      'Credentials are stored. Leave both fields blank to keep them; entering new credentials replaces all stored fields.'
                    )
                  : t(
                      'Credentials are encrypted on the server. HTTPS and a persistent CRYPTO_SECRET are required to store them.'
                    )}
              </p>
              <FormField
                control={form.control}
                name='headersJSON'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Authentication headers (JSON)')}</FormLabel>
                    <FormControl>
                      <Textarea
                        autoComplete='off'
                        spellCheck={false}
                        disabled={clearCredentials || busy}
                        className='font-mono text-xs'
                        placeholder='{"Authorization":"Bearer ..."}'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='queryJSON'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Authentication query parameters (JSON)')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        autoComplete='off'
                        spellCheck={false}
                        disabled={clearCredentials || busy}
                        className='font-mono text-xs'
                        placeholder='{"api_key":"..."}'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {props.server.credential_set && (
                <FormField
                  control={form.control}
                  name='clearCredentials'
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Label>
                          <Checkbox
                            checked={field.value}
                            disabled={busy}
                            onCheckedChange={field.onChange}
                          />
                          {t('Clear stored credentials')}
                        </Label>
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <Label>{t('Available tools')}</Label>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() =>
                  void form.handleSubmit(() => discover.mutate())()
                }
              >
                {discover.isPending
                  ? t('Connecting...')
                  : t('Test connection and discover tools')}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Confirm read-only access before enabling a tool. Mark search and page-fetching tools so MCP search can use them automatically.'
              )}
            </p>
            {tools.length > 0 && (
              <MCPToolConfigList
                tools={tools}
                onChange={(next) =>
                  form.setValue('tools', next, { shouldDirty: true })
                }
                disabled={busy}
              />
            )}
            {discover.isSuccess && tools.length === 0 && (
              <p role='status' className='text-muted-foreground text-sm'>
                {t('The service returned no tools.')}
              </p>
            )}
          </fieldset>
        </form>
      </Form>
    </Dialog>
  )
}
