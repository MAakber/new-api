/** One host-served endpoint a protocol claim binds. */
export type HostProtocolEndpoint = {
  method: string
  path: string
  /**
   * Whether this endpoint is the mode-bearing create call. `supports` gates the
   * accepted request forms of the create endpoint only; retrieval of an already
   * created resource is always available and never declared.
   */
  modeBearing?: boolean
}

/**
 * The endpoints each host protocol serves, mirroring `hostProtocols` in
 * `pkg/jsplugin/routing.go`. The table is frozen under `apiVersion: 1`, so it is
 * mapped client-side rather than fetched: a plugin's `meta.protocols` claim
 * carries only the protocol name, and the gateway derives these paths from it.
 * Colon path params are written in `{brace}` form to match the public docs.
 */
export const HOST_PROTOCOL_ENDPOINTS: Record<string, HostProtocolEndpoint[]> = {
  openai_responses: [
    { method: 'POST', path: '/v1/responses', modeBearing: true },
    { method: 'GET', path: '/v1/responses/{response_id}' },
  ],
  openai_video: [
    { method: 'POST', path: '/v1/videos', modeBearing: true },
    { method: 'GET', path: '/v1/videos/{task_id}' },
    { method: 'GET', path: '/v1/videos/{task_id}/content' },
  ],
}
