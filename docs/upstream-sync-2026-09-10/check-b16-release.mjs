import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { directory, repository, head, save } from './ledger.mjs'
const require=createRequire(path.join(repository,'web/package.json'))
const YAML=require('yaml')
const git=(args)=>run('git',args)
function run(command,args,options={}) {
 const result=spawnSync(command,args,{cwd:repository,encoding:'utf8',windowsHide:true,timeout:60000,...options})
 if(result.status!==0) throw new Error(`${command} failed: ${result.stderr}\n${result.stdout}`)
 return result.stdout.trim()
}
const files=['ci.yml','release.yml','electron-build.yml','sync-release-to-gitcode.yml']
const documents=Object.fromEntries(files.map(file=>[file,YAML.parse(fs.readFileSync(path.join(repository,'.github/workflows',file),'utf8'))]))
const evidenceDir=path.join(directory,'evidence/B16-workflow-shell')
fs.mkdirSync(evidenceDir,{recursive:true})
const shellFiles=[]
for (const [file,doc] of Object.entries(documents)) {
 assert.ok(doc.jobs,file)
 for(const [jobName,job] of Object.entries(doc.jobs)) {
  for(const [index,step] of (job.steps??[]).entries()) {
   if(step.uses?.startsWith('oven-sh/setup-bun@')) assert.equal(step.with['bun-version'],'1.4.0')
   if(!step.run || step.shell==='pwsh') continue
   const filename=`${file}-${jobName}-${index}.sh`
   fs.writeFileSync(path.join(evidenceDir,filename),step.run.replace(/\$\{\{[\s\S]*?\}\}/g,'fixture_value'))
   shellFiles.push('/mnt/d/10178/Projects/new-api-upstream-sync/docs/upstream-sync-2026-09-10/evidence/B16-workflow-shell/'+filename)
  }
 }
}
for (const file of shellFiles) run('wsl',['-d','Ubuntu-SF3D','-u','root','--','bash','-n',file])
const versionScript='/mnt/d/10178/Projects/new-api-upstream-sync/scripts/version.sh'
const short=git(['rev-parse','--short=8','HEAD'])
const cases=[
 {name:'local date and commit',vars:['GITHUB_REF=','GITHUB_REF_TYPE=','GITHUB_REF_NAME='],pattern:new RegExp('^v[0-9]{8}-'+short+'$')},
 {name:'tag ref overrides repository tags',vars:['GITHUB_REF=refs/tags/v9.8.7','GITHUB_REF_TYPE=tag','GITHUB_REF_NAME=v9.8.7'],expected:'v9.8.7'},
 {name:'tag metadata fallback',vars:['GITHUB_REF=','GITHUB_REF_TYPE=tag','GITHUB_REF_NAME=v20260911-1234abcd'],expected:'v20260911-1234abcd'}
]
const versions=cases.map(item=>{
 const actual=run('wsl',['-d','Ubuntu-SF3D','-u','root','--','env',...item.vars,'bash',versionScript])
 if(item.expected) assert.equal(actual,item.expected)
 else assert.match(actual,item.pattern)
 return {name:item.name,actual}
})
const desktop=JSON.parse(fs.readFileSync(path.join(repository,'electron/package.json'),'utf8'))
const baseline=JSON.parse(git(['show','403f7d9dffc6a99728ede5d8f72770efc61f7b83:electron/package.json']))
assert.deepEqual(desktop.build,baseline.build,'Desktop platforms, resource and license packaging must remain intact')
const lock=JSON.parse(fs.readFileSync(path.join(repository,'electron/package-lock.json'),'utf8'))
assert.equal(desktop.devDependencies.electron,'39.8.10')
assert.equal(lock.packages['node_modules/electron'].version,'39.8.10')
assert.equal(lock.packages['node_modules/electron-builder'].version,'26.15.3')
assert.equal(lock.packages['node_modules/builder-util-runtime'].version,'9.7.0')
assert.equal(lock.packages['node_modules/js-yaml'].version,'4.3.1')
assert.ok(Object.entries(lock.packages).some(([name,value])=>name.endsWith('/fast-uri')&&value.version==='3.1.5'))
const sync=documents['sync-release-to-gitcode.yml']
assert.equal(sync.on.workflow_dispatch.inputs.sync_files.default,false)
assert.equal(sync.on.push,undefined)
assert.match(sync.jobs['gitcode-release-assets'].if,/inputs.sync_files/)
assert.match(fs.readFileSync(path.join(repository,'Dockerfile'),'utf8'),/FROM oven\/bun:1\.4\.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6/)
const result={status:'passed',code_commit:head(),workflows:files,shell_snippets:shellFiles.length,versions,desktop:{electron:'39.8.10',builder:'26.15.3',runtime:'9.7.0',platforms_and_licenses_preserved:true},gitcode:'Manual dispatch with optional file synchronization; no workflow executed'}
save('evidence/B16-release-configuration.json',result)
console.log(JSON.stringify(result,null,2))
