import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, save, repository, directory, head, checkpoint } from './ledger.mjs'

const [mode, ...args] = process.argv.slice(2)
function git(argv) {
  const result = spawnSync('git', argv, { cwd: repository, encoding: 'utf8', windowsHide: true, maxBuffer: 50 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || argv.join(' '))
  return result.stdout
}
if (mode === 'inventory') {
  if (fs.existsSync(path.join(directory, 'evidence/B17-file-review.json'))) throw new Error('Inventory already exists')
  const stages = new Map()
  for (const row of git(['ls-files', '-u', '-z']).split('\0').filter(Boolean)) {
    const match = row.match(/^(\d+) ([a-f0-9]+) ([123])\t(.+)$/)
    if (!match) throw new Error(`Invalid index row: ${row}`)
    const [, fileMode, blob, stage, file] = match
    if (!stages.has(file)) stages.set(file, {})
    stages.get(file)[stage] = { mode: fileMode, blob }
  }
  const automatic = git(['diff', '--cached', '--name-status', '--diff-filter=ACDMRT']).trim().split('\n').filter(Boolean).map(row => {
    const [status, file] = row.split('\t')
    return { file, automatic_status: status }
  })
  const upstream = read('upstream-ledger.json')
  const downstream = read('downstream-ledger.json')
  const entries = [...[...stages].map(([file, blobs]) => ({ file, conflict: true, stages: blobs })), ...automatic]
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(entry => ({
      ...entry,
      upstream: upstream.filter(row => row.changedFiles.includes(entry.file)).map(row => ({ sha: row.sha, batch: row.batchId, resolution: row.resolution, rationale: row.resolution_rationale, commits: row.resolution_commits, evidence: row.evidence })),
      preservation_ids: [...new Set(downstream.filter(row => row.changedFiles.includes(entry.file)).flatMap(row => row.preservationIds))],
      status: 'pending', resolution: null,
    }))
  fs.writeFileSync(path.join(directory, 'evidence/B17-initial-merge.patch'), git(['diff', 'HEAD']))
  fs.writeFileSync(path.join(directory, 'evidence/B17-initial-index.patch'), git(['diff', '--cached', 'HEAD']))
  save('evidence/B17-file-review.json', { before: head(), upstream: git(['rev-parse', 'MERGE_HEAD']).trim(), entries })
  const state = read('state.json')
  state.current_unit = 'B17.2'
  state.active_operation.pre_merge_head = head()
  state.active_operation.conflicts = stages.size
  state.next_action = 'Resolve each inventoried file against its previously accepted adaptation, inspect automatic edits, and record file-specific disposition.'
  state.updatedAt = new Date().toISOString()
  save('state.json', state)
  const batches = read('batches.json')
  const batch = batches.find(b => b.id === 'B17')
  batch.units[0].status = 'verified'
  batch.units[0].evidence = ['evidence/runs/B17-real-merge/result.json', 'evidence/B17-file-review.json']
  batch.units[1].status = 'verifying'
  save('batches.json', batches)
  checkpoint('B17.2 actual merge inventory', `${stages.size} conflicted files and ${automatic.length} automatically changed files. Original index and working merge patches saved. Merge exit 1 is the expected unresolved-conflict stop, not a passed test. Review per-file adaptations before resolution.`)
  console.log(JSON.stringify({ conflicts: stages.size, automatic: automatic.length, unmapped: entries.filter(e => e.upstream.length === 0).map(e => e.file) }))
} else if (mode === 'show') {
  const inventory = read('evidence/B17-file-review.json')
  const selected = inventory.entries.filter(entry => new RegExp(args[0]).test(entry.file) && entry.status === 'pending')
  for (const entry of selected) {
    console.log(JSON.stringify({ file: entry.file, conflict: entry.conflict, automatic: entry.automatic_status, protection: entry.preservation_ids, adaptations: entry.upstream.map(r => `${r.batch}:${r.sha.slice(0, 9)}`) }))
    if (args[1] === 'diff') {
      console.log(git(['diff', '--no-ext-diff', '--ignore-all-space', '--unified=2', inventory.before, inventory.upstream, '--', entry.file]))
    } else if (['hunks', 'compact'].includes(args[1]) && entry.conflict && fs.existsSync(path.join(repository, entry.file))) {
      const source = fs.readFileSync(path.join(repository, entry.file), 'utf8')
      const hunks = source.match(/^<<<<<<<[\s\S]*?^>>>>>>>[^\n]*/gm) || []
      for (const hunk of hunks) {
        if (args[1] === 'hunks') console.log(hunk)
        else console.log(hunk.split(/^=======\r?$/m).map(part => {
          const lines = part.split('\n')
          return lines.length > 26 ? [...lines.slice(0, 13), `[${lines.length - 21} lines in saved merge patch]`, ...lines.slice(-8)].join('\n') : part
        }).join('\n=======\n'))
      }
    }
  }
} else if (mode === 'resolve') {
  const inventory = read('evidence/B17-file-review.json')
  if (git(['rev-parse', 'MERGE_HEAD']).trim() !== inventory.upstream || head() !== inventory.before) throw new Error('Merge changed')
  const decisions = read(args[0])
  for (const decision of decisions) {
    const entry = inventory.entries.find(item => item.file === decision.file)
    if (!entry || entry.status !== 'pending' || !decision.reason?.trim()) throw new Error(`Invalid or repeated decision: ${decision.file}`)
    if (/^web\/src\/i18n\/locales\/[^/]+\.json$/.test(entry.file)) throw new Error('Locale resolution must use add-missing-keys.mjs')
    if (decision.source === 'integrated' || decision.source === 'upstream') {
      const source = decision.source === 'integrated' ? inventory.before : inventory.upstream
      git(['restore', `--source=${source}`, '--staged', '--worktree', '--', entry.file])
    } else if (decision.source === 'merged') {
      const source = fs.readFileSync(path.join(repository, entry.file), 'utf8')
      if (/^(<<<<<<< |=======|>>>>>>> )/m.test(source)) throw new Error(`Unresolved markers: ${entry.file}`)
      git(['add', '--', entry.file])
    } else if (decision.source === 'remove-duplicate-rename') {
      if (git(['ls-tree', '--name-only', inventory.before, '--', entry.file]).trim() || git(['ls-tree', '--name-only', inventory.upstream, '--', entry.file]).trim()) throw new Error('Rename artifact exists in a parent')
      if (!decision.retained_file || !entry.stages?.['2']?.blob) throw new Error('Missing retained rename evidence')
      const retained = git(['rev-parse', `${inventory.before}:${decision.retained_file}`]).trim()
      if (retained !== entry.stages['2'].blob || git(['hash-object', '--', entry.file]).trim() !== retained || git(['hash-object', '--', decision.retained_file]).trim() !== retained) throw new Error('Rename artifact differs from retained source')
      git(['rm', '-f', '--', entry.file])
    } else if (decision.source === 'remove-redundant-incoming') {
      if (git(['ls-tree', '--name-only', inventory.before, '--', entry.file]).trim()) throw new Error('Refuse to remove pre-merge source')
      const current = fs.readFileSync(path.join(repository, entry.file), 'utf8').replace(/\r\n/g, '\n')
      if (current !== git(['show', `${inventory.upstream}:${entry.file}`]).replace(/\r\n/g, '\n')) throw new Error('Incoming source has additional edits')
      git(['rm', '-f', '--', entry.file])
    } else {
      throw new Error(`Unknown source: ${decision.source}`)
    }
    entry.status = 'reviewed'
    entry.resolution = { ...decision, decided_at: new Date().toISOString(), resulting_blob: git(['ls-files', '-s', '--', entry.file]).trim() || null }
    save('evidence/B17-file-review.json', inventory)
  }
  console.log(JSON.stringify({ resolved: decisions.length, pending: inventory.entries.filter(item => item.status === 'pending').length }))
} else {
  throw new Error('Usage: review-b17.mjs inventory | show <file-regexp> [diff|hunks] | resolve <decision-file>')
}
