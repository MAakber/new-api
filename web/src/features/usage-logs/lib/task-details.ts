import type { TaskLog, TaskPluginInfo, TaskPluginRuntimeInfo } from '../types'

export interface TaskDetailAccess {
  plugin?: TaskPluginInfo
  runtime?: TaskPluginRuntimeInfo
  upstreamTaskId?: string
  nodeName?: string
}

export function resolveTaskDetailAccess(
  log: TaskLog,
  isAdmin: boolean,
  isRoot: boolean
): TaskDetailAccess {
  if (!isAdmin) return {}

  const access: TaskDetailAccess = {
    plugin: log.admin_info?.task_plugin,
  }
  if (!isRoot) return access

  access.runtime = log.root_info?.task_plugin
  access.upstreamTaskId = log.root_info?.upstream_task_id
  access.nodeName = log.root_info?.node_name
  return access
}
