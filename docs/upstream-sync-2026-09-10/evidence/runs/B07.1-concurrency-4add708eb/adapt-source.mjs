import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const sha = '4add708ebe3b74e02dcf141887da2c81cb9b1526'
const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout
}
if (!process.argv.includes('--finish-source')) {
  const patch = git(['diff', sha + '^', sha, '--', '.', ':(exclude)web/src/i18n/locales/**', ':(exclude)controller/channel-test.go', ':(exclude)setting/operation_setting/monitor_setting.go', ':(exclude)web/src/features/system-settings/models/routing-reliability-section.tsx'])
  const applied = spawnSync('git', ['apply', '--3way'], { input: patch, encoding: 'utf8', windowsHide: true })
  console.log(applied.stderr)
  if (applied.status !== 0) throw new Error('Reconcile selective patch before proceeding')
}

const source = 'controller/channel-test.go'
let current = fs.readFileSync(source, 'utf8')
const upstream = git(['show', sha + ':' + source])
const start = '// performChannelTests runs the channel test loop synchronously'
const end = '// runChannelTestTask runs one synchronous channel test cycle'
const first = current.indexOf(start)
const last = current.indexOf(end, first)
const upstreamFirst = upstream.indexOf('func testChannelForHealthCheck(')
const upstreamLast = upstream.indexOf(end, upstreamFirst)
if ([first, last, upstreamFirst, upstreamLast].some(index => index < 0)) throw new Error('Missing worker section')
const block = upstream.slice(upstreamFirst, upstreamLast).replace('channel.GetAutoBan()), newAPIError)', 'channel.GetAutoBan()), newAPIError, nil)')
current = current.slice(0, first) + block + current.slice(last)
current = current.replace('\t"strings"', '\t"strings"\n\t"sync"')
current = current.replace('summary := performChannelTests(ctx, selected, testUserID, allowDisable, report)', 'concurrency := operation_setting.GetMonitorSetting().ChannelTestConcurrency\n\tsummary := performChannelTests(ctx, selected, testUserID, allowDisable, concurrency, report)')
fs.writeFileSync(source, current)

const monitor = 'setting/operation_setting/monitor_setting.go'
let settings = fs.readFileSync(monitor, 'utf8')
settings = settings.replace('type MonitorSetting struct {', 'type MonitorSetting struct {\n\tChannelTestConcurrency int `json:"channel_test_concurrency"`')
settings = settings.replace('const (', 'const (\n\tChannelTestConcurrencyOptionKey = "monitor_setting.channel_test_concurrency"\n\tDefaultChannelTestConcurrency = 1\n\tMaxChannelTestConcurrency = 32\n')
settings = settings.replace('return MonitorSetting{', 'return MonitorSetting{\n\t\tChannelTestConcurrency: DefaultChannelTestConcurrency,')
settings = settings.replace('\treturn &monitorSetting', '\tmonitorSetting.ChannelTestConcurrency = NormalizeChannelTestConcurrency(monitorSetting.ChannelTestConcurrency)\n\treturn &monitorSetting')
const upstreamMonitor = git(['show', sha + ':' + monitor])
settings += '\n' + upstreamMonitor.slice(upstreamMonitor.indexOf('func NormalizeChannelTestConcurrency('))
fs.writeFileSync(monitor, settings)
