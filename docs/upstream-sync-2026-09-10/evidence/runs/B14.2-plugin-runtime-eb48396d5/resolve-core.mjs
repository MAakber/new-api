import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(evidence, '../../../../..')
const original = JSON.parse(fs.readFileSync(path.join(evidence, 'conflicts.json'), 'utf8'))
const resolutions = []

function resolve(file, choices, rationale) {
  const source = fs.readFileSync(path.join(repository, file), 'utf8').replaceAll('\r\n', '\n')
  let index = 0
  const result = source.replace(/^<<<<<<< ours\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> theirs\n/gm, (_, ours, theirs) => {
    index += 1
    const recorded = original.find(entry => entry.file === file && entry.index === index)
    if (!recorded || recorded.ours !== ours || recorded.theirs !== theirs) throw new Error(`Conflict drift: ${file}:${index}`)
    const choice = choices[index - 1]
    if (!choice) throw new Error(`Missing decision: ${file}:${index}`)
    const value = choice === 'ours' ? ours : choice === 'theirs' ? theirs : choice(ours, theirs)
    resolutions.push({file, index, ours, theirs, result: value, rationale})
    return value
  })
  if (index !== choices.length) throw new Error(`Wrong decision count: ${file}`)
  fs.writeFileSync(path.join(repository, file), result)
}

resolve('constant/channel.go', [
  ours => ours.replace('\tChannelTypeDummy', '\tChannelTypeTaskPlugin = 65\n\tChannelTypeDummy'),
  ours => ours.replace('"https://ai-gateway.vercel.sh",              //64\n}', '"https://ai-gateway.vercel.sh",              //64\n\t"", //65\n}\n\nfunc GetChannelBaseURL(channelType int) string {\n\tif channelType < 0 || channelType >= len(ChannelBaseURLs) { return "" }\n\treturn ChannelBaseURLs[channelType]\n}') + '\tChannelTypeTaskPlugin: "Task Plugin",\n',
], 'A30: preserve every deployed channel number and URL; allocate plugin 65 and retain upstream bounds-safe lookup.')

resolve('controller/channel-billing.go', [
  (ours, theirs) => ours + '\t\treturn\n\t}\n' + theirs,
], 'Custom balance refresh retains precedence. Unsupported provider-native plugin balance queries fail explicitly.')

resolve('controller/channel.go', [
  'ours',
  ours => ours.replace('constant.ChannelBaseURLs[channel.Type]', 'constant.GetChannelBaseURL(channel.Type)'),
  ours => ours.replace('constant.ChannelBaseURLs[channel.Type]', 'constant.GetChannelBaseURL(channel.Type)'),
  ours => ours.replace('constant.ChannelBaseURLs[channel.Type]', 'constant.GetChannelBaseURL(channel.Type)'),
  ours => ours.replace('constant.ChannelBaseURLs[channel.Type]', 'constant.GetChannelBaseURL(channel.Type)'),
], 'Keep read-only field rejection, partial-update normalization, and user-request guards. Plugin binding permission is added after the existing update has been normalized. Use safe URL lookup.')

resolve('controller/log.go', ['ours'], 'Existing scoped projection already handles root normalization without disclosing root diagnostics to admins.')
resolve('model/log.go', ['ours', 'ours'], 'B08 scoped typed metadata and B13 safe stream projection already implement plugin admin/root stripping with exact numeric preservation; do not regress to untyped maps.')
resolve('model/log_format_test.go', ['ours', 'ours', 'ours'], 'Retain existing privacy and exact-number regression cases alongside new plugin projection cases.')

resolve('go.mod', [(ours, theirs) => ours + theirs.split('\n').filter(line => line.includes('go-sourcemap') || line.includes('google/pprof')).join('\n') + '\n'], 'Add actual JS runtime dependencies while retaining the newer, already-verified database/auth dependency versions.')
resolve('controller/relay.go', [(ours) => ours + '\t\tservice.AppendTaskPluginContextAuditInfo(c, other)\n'], 'Keep scoped relay diagnostics and add plugin context through the typed audit helper.')
resolve('middleware/distributor.go', [(ours, theirs) => ours.slice(0, ours.indexOf('\t\tif ok {')) + theirs], 'Keep model-probing autobans, then resolve typed channel pins with upstream precedence and retry constraints.')
resolve('relay/channel/api_request_test.go', [(ours, theirs) => ours + '}\n\n' + theirs], 'Both downstream header/profile fixture and upstream client-cancellation contract remain.')
resolve('router/api-router.go', [(ours, theirs) => ours + theirs], 'Retain downstream pricing and metadata sync routes; add permission-protected plugin management and binding options.')
resolve('router/main.go', [(ours) => '\t\t\tpluginDispatcher,\n' + ours], 'Plugin fallback dispatch and existing web access-token auditing both remain.')
resolve('router/web-router.go', [(ours) => '\t\tpluginDispatcher,\n' + ours], 'Keep plugin fallback dispatch, route tags, gzip, and access-token auditing.')
resolve('router/relay-router.go', ['ours'], 'Retain Suno legacy submit/fetch routes and downstream autoban/rate guards for unmigrated clients.')
resolve('service/authz/authz_test.go', [(ours, theirs) => ours + theirs, (ours, theirs) => ours + theirs], 'Both audit and task-plugin binding default-denial contracts remain.')

resolve('model/ability.go', [
  () => '\t"github.com/QuantumNous/new-api/dto"\n\t"github.com/QuantumNous/new-api/setting/ratio_setting"\n',
  ours => ours.replace('requestPath string', 'filters []dto.ChannelFilter').replace('matchingChannelAbilities(group, model, requestPath)', 'matchingChannelAbilities(group, model, filters)'),
  (ours, theirs) => ours.slice(0, ours.indexOf('// filterAbilitiesByRequestPathAndModel')).replace('requestPath string, excluded', 'filters []dto.ChannelFilter, excluded').replaceAll('matchingChannelAbilities(group, model, requestPath)', 'matchingChannelAbilities(group, model, filters)').replace('matchingChannelAbilities(group, model, requestPath string)', 'matchingChannelAbilities(group, model string, filters []dto.ChannelFilter)').replace('filterAbilitiesByRequestPathAndModel(abilities, requestPath, model)', 'filterAbilitiesByConstraints(abilities, model, filters)') + theirs,
], 'Compose plugin/path filters before priority selection while preserving all downstream model aliases, negative-retry guards and request-local excluded candidates.')

resolve('model/channel_cache.go', [
  ours => ours.replace('channels = filterChannelsByRequestPathAndModel(group2model2channels[group][name], requestPath, model)', 'channels, _ = filterCandidateIDs(group2model2channels[group][name], model, filters)'),
  ours => ours.replace('retry int, requestPath string, excluded', 'retry int, filters []dto.ChannelFilter, excluded').replace('GetChannelExcluding(group, model, retry, requestPath, excluded)', 'GetChannelExcluding(group, model, retry, filters, excluded)').replace('channels = filterChannelsByRequestPathAndModel(group2model2channels[group][name], requestPath, model)', 'channels, _ = filterCandidateIDs(group2model2channels[group][name], model, filters)'),
], 'Preserve alias ordering, exclusions, priority fallback and immutable cached slices; compose upstream task-plugin identity constraints in both memory and DB paths.')

resolve('service/channel_select.go', [
  ours => ours.replace('param.RequestPath, excluded)', 'filters, excluded)'),
  ours => ours.replace('param.RequestPath, excluded)', 'filters, excluded)'),
  (ours, theirs) => ours.replace('retry int, requestPath string, excluded', 'retry int, filters []dto.ChannelFilter, excluded').replace('retry, requestPath, excluded)', 'retry, filters, excluded)') + '}\n\n' + theirs,
], 'Retain request authorization retries and downstream automatic-group order; enforce plugin/path filters throughout and preserve pinned plugin candidate matching.')

fs.writeFileSync(path.join(evidence, 'resolved-core-hunks.json'), JSON.stringify(resolutions, null, 2) + '\n', {flag:'wx'})
console.log(JSON.stringify({files: new Set(resolutions.map(r => r.file)).size, hunks: resolutions.length}))
