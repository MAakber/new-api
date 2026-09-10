import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

// Reapply each upstream semantic edit to the downstream editor. This preserves
// per-window element IDs and the existing transport/identity sections whose
// different JSX indentation caused broad three-way conflict regions.
const file = 'web/src/features/channels/components/drawers/channel-mutate-drawer.tsx'
let source = execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' })
function replaceOne(before, after) {
  if (source.split(before).length !== 2) throw new Error('Expected unique editor fragment: ' + before)
  source = source.replace(before, after)
}
replaceOne('  ADD_MODE_OPTIONS,', '  ADD_MODE_OPTIONS,\n  CLAUDE_FIELD_PASSTHROUGH_TYPES,\n  FIELD_PASSTHROUGH_TYPES,\n  OPENAI_FIELD_PASSTHROUGH_TYPES,')
replaceOne('  if (currentType === 1 || currentType === 57) {', '  if (OPENAI_FIELD_PASSTHROUGH_TYPES.has(currentType)) {')
replaceOne('  } else if (currentType === 14) {\n    fieldPassthroughConfigured = Boolean(', '  }\n  if (CLAUDE_FIELD_PASSTHROUGH_TYPES.has(currentType)) {\n    fieldPassthroughConfigured = fieldPassthroughConfigured || Boolean(')
replaceOne('      currentClaudeBetaQuery\n', '      (currentType === 14 && currentClaudeBetaQuery)\n')
replaceOne('  if (currentType === 1 || currentType === 14 || currentType === 57) {', '  if (FIELD_PASSTHROUGH_TYPES.has(currentType)) {')
source = source.replace(/\{\(currentType === 1 \|\|\s+currentType === 14 \|\|\s+currentType === 57\) && \(/g, '{FIELD_PASSTHROUGH_TYPES.has(currentType) && (')
source = source.replace(/\{\(currentType === 1 \|\| currentType === 57\) && \(/g, '{OPENAI_FIELD_PASSTHROUGH_TYPES.has(currentType) && (')
const section = source.indexOf('{FIELD_PASSTHROUGH_TYPES.has(currentType) && (')
const end = source.indexOf('{MODEL_FETCHABLE_TYPES.has(currentType) && (', section)
if (section < 0 || end < section) throw new Error('Cannot locate field passthrough section')
let fields = source.slice(section, end)
const claudeStart = fields.indexOf('{currentType === 14 && (')
if (claudeStart < 0) throw new Error('Cannot locate Claude controls')
let claude = fields.slice(claudeStart).replace('{currentType === 14 && (', '{CLAUDE_FIELD_PASSTHROUGH_TYPES.has(currentType) && (')
for (const [name, condition] of [['allow_inference_geo', '!OPENAI_FIELD_PASSTHROUGH_TYPES.has(currentType)'], ['claude_beta_query', 'currentType === 14']]) {
  const field = new RegExp("^([ \\t]*)<FormField\\n\\s+control=\\{form.control\\}\\n\\s+name='" + name + "'[\\s\\S]*?^\\1/>", 'm')
  const match = claude.match(field)
  if (!match) throw new Error('Cannot locate ' + name)
  claude = claude.replace(field, match[1] + '{' + condition + ' && (\n' + match[0] + '\n' + match[1] + ')}')
}
fields = fields.slice(0, claudeStart) + claude
source = source.slice(0, section) + fields + source.slice(end)
fs.writeFileSync(file, source)
