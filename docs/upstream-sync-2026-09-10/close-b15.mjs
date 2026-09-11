import fs from 'node:fs'
import path from 'node:path'
import { read, save, head, checkpoint, directory } from './ledger.mjs'
const required = ['B15-go-conventions','B15-relaykit','B15-relaykit-build','B15-vitest-discovery','B15-web-repaired','B15-web-types-final','B15-web-lint-final','B15-web-i18n-final','B15-web-format-final','B15-http2-fixture']
const runs = required.map(id => {
  const file = `evidence/runs/${id}/result.json`
  const result = read(file)
  if (result.status !== 'passed' || result.exit_code !== 0) throw new Error(`Unpassed ${id}`)
  return {id, evidence:file, tested_commit:result.tested_commit}
})
const code = head()
save('evidence/B15-acceptance.json', {
  status:'verified', code_commit:code, runs,
  reused_frontend: {evidence:'evidence/runs/B15-web-suite/result.json', passed_files:203, passed_tests:1513, failed_files:6, failed_tests:15, disposition:'All six failing files are included in B15-web-repaired (23 files, 96 tests passed). Existing successful files are reused; final candidate regression remains B18.'},
  windows_fixture_review: {
    http2:'The existing no-GetBody RST_STREAM server closed TCP with unread control frames. Drain after CloseWrite as in its GOAWAY fixture; all four protocol tests passed without relaxing error/body assertions.',
    avatar:'Reviewed synchronous OAuth import, atomic Put and image Open/Close. B11 failure occurred in Windows TempDir directory removal after behavior assertions; full B15 Go run passed. No reproducible avatar handle leak established. No retry loop, sleeps, cleanup suppression or production change added.'
  },
  preservation: ['Downstream floating editors and custom channel test matrix', 'Single-use authentication proof is never replayed', 'Registration/subscription redemption payloads', 'Mandatory IP audit display', 'Canonical pricing, quota saturation, wallet and task adapters retained by Go style conflict review'],
  compatibility_exception:'Administrator-configured embedded chat keeps its existing unsandboxed capability contract. One documented iframe lint exception is scoped to that element; global rules stay enabled. General URL preview has no current consumers and now isolates its origin.',
  residual_warnings:'Pre-existing lint warnings remain; no lint errors.',
  final_acceptance:'B18 required'
})
const batches=read('batches.json')
const batch=batches.find(item=>item.id==='B15')
batch.status='verified'
batch.codeCommits=[...new Set([...batch.codeCommits,'73a44e27318973a1f017e0f3aa80e37d06fd80a4',code])]
batch.evidence=[...new Set([...batch.evidence,'evidence/B15-acceptance.json'])]
batch.nextAction='B16: finish remaining release, documentation and desktop dependency updates.'
for(const unit of batch.units) {
 unit.status='verified'
 unit.evidence=[...new Set([...(unit.evidence||[]),'evidence/B15-acceptance.json'])]
 if(unit.id==='B15.baseline-lint') unit.action='Resolve full lint errors with global rules enabled; retain a documented element-scoped exception for administrator-configured chat embed compatibility.'
}
const ledger=read('upstream-ledger.json')
for(const row of ledger.filter(item=>item.batchId==='B15')) {
 if(row.status!=='implemented') throw new Error(`Unexpected source status ${row.sha}`)
 row.status='verified'
 row.evidence=[...new Set([...row.evidence,'evidence/B15-acceptance.json'])]
}
const state=read('state.json')
state.current_batch='B16'
state.current_unit='B16.1'
state.last_verified_code_commit=code
state.last_observed_head=code
state.last_checkpoint_commit=code
state.next_action=batch.nextAction
state.updatedAt=new Date().toISOString()
save('batches.json',batches)
save('upstream-ledger.json',ledger)
save('state.json',state)
checkpoint('B15 verified; 141/153 upstream commits accepted', `Code ${code}. Full backend and independent relaykit results reused; six frontend failures fixed with 23 files/96 tests passing. Type, full lint, protected-header format and literal i18n pass. Review details: evidence/B15-acceptance.json. Proceed to B16, leaving production untouched.`)
fs.appendFileSync(path.join(directory,'DECISIONS.md'), '\n## A31 — Preserve administrator chat embedding during lint cleanup\n\nThe existing administrator-configured chat iframe requires its original script, origin storage, OAuth, downloads and media capabilities. Preserve that contract with one explicit element-scoped iframe lint exception rather than imposing an incompatible sandbox. Global lint rules stay enabled. The general URL-preview component currently has no consumers; its sandbox now isolates origin while retaining script execution. Full lint has no errors; warnings remain recorded.\n')
console.log(JSON.stringify({batch:'B15',status:batch.status,code,next:state.next_action}))

