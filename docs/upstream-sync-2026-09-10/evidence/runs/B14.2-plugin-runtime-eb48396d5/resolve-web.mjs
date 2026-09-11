import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const evidence = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(evidence, '../../../../..')
const original = JSON.parse(fs.readFileSync(path.join(evidence, 'conflicts.json'), 'utf8'))
const resolutions = []
const files = [...new Set(original.filter(item => item.file.startsWith('web/')).map(item => item.file))]
for (const file of files) {
  const source = fs.readFileSync(path.join(repository, file), 'utf8').replaceAll('\r\n', '\n')
  let index = 0
  const result = source.replace(/^<<<<<<< ours\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> theirs\n/gm, (_, ours, theirs) => {
    index += 1
    const recorded = original.find(item => item.file === file && item.index === index)
    if (!recorded || recorded.ours !== ours || recorded.theirs !== theirs) throw new Error(`Conflict drift: ${file}:${index}`)
    let resolved = ours
    let rationale = 'Retain B12/B13 pulled-forward pricing, fixed/zero/time pricing, CAS editing, exact diagnostic scopes and downstream presentation. Review nonconflicting source separately.'
    if (file.endsWith('channel-mutate-drawer.tsx') && index === 1) {
      resolved = theirs + ours
      rationale = 'Add the plugin binding selector alongside the existing custom-channel editor.'
    }
    if (file.endsWith('channels/constants.ts')) {
      resolved = ours.replace("  64: 'Vercel AI Gateway',", "  64: 'Vercel AI Gateway',\n  65: 'Task Plugin',").replace('1, 64, 61,', '1, 64, 65, 61,')
      rationale = 'A30: plugin 65; preserve deployed downstream channel numbers and display order.'
    }
    if (file.endsWith('channel-form.ts')) {
      resolved = index === 1 ? ours + theirs : ours.replace('        CHANNEL_TYPE_NEW_API,', '        CHANNEL_TYPE_NEW_API,\n        CHANNEL_TYPE_TASK_PLUGIN,')
      rationale = 'Keep downstream validation and add explicit plugin base-URL requirements.'
    }
    if (file.endsWith('common-logs-columns.tsx') && index === 1) {
      resolved = ours + '  const adminSegments: DetailSegment[] = []\n'
      rationale = 'Keep task usage schemas and separately projected plugin admin details.'
    }
    if (file.endsWith('dialogs/details-dialog.tsx')) {
      resolved = ours + theirs
      rationale = 'Keep shared log detail layout and add the sanitized plugin author link.'
    }
    if (file.endsWith('usage-logs-mobile-card.tsx') && index === 1) {
      resolved = "import { TASK_MOBILE_SUMMARY_FIELDS } from '../lib/task-mobile-layout'\n"
      rationale = 'Retain current mobile summary components, authenticated avatars and safe timing; add task field definitions without duplicating common-log components.'
    }
    resolutions.push({file, index, ours, theirs, result: resolved, rationale})
    return resolved
  })
  if (index !== original.filter(item => item.file === file).length) throw new Error(`Wrong conflict count: ${file}`)
  fs.writeFileSync(path.join(repository, file), result)
}
fs.writeFileSync(path.join(evidence, 'resolved-web-hunks.json'), JSON.stringify(resolutions, null, 2) + '\n', {flag:'wx'})
console.log(JSON.stringify({files: files.length, hunks: resolutions.length}))
