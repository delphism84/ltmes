import type { WebSocket } from 'ws'

export type EqListEntry = {
  userid: string
  eqid: string
  last: { W: number | null; ST: string; NT: string; msg: string; unit: string }
  lastAt: string
}

const map = new Map<string, EqListEntry>()

const appClients = new Set<WebSocket>()

function key(userid: string, eqid: string) {
  return `${userid}|${eqid}`
}

export function registerAppClient(ws: WebSocket) {
  appClients.add(ws)
  const onClose = () => {
    appClients.delete(ws)
    ws.off('close', onClose)
  }
  ws.on('close', onClose)
  pushEqListToOne(ws)
}

export function broadcastToApp(payload: Record<string, unknown>) {
  const msg = JSON.stringify(payload)
  for (const c of appClients) {
    if (c.readyState === 1) c.send(msg)
  }
}

function pushEqListToOne(c: WebSocket) {
  if (c.readyState !== 1) return
  c.send(JSON.stringify({ op: 'eqList', data: getEqListSnapshot() }))
}

export function broadcastEqList() {
  const msg = JSON.stringify({ op: 'eqList', data: getEqListSnapshot() })
  for (const c of appClients) {
    if (c.readyState === 1) c.send(msg)
  }
}

export function getEqListSnapshot(): EqListEntry[] {
  return Array.from(map.values())
}

export function updateFromDatalog(
  userid: string,
  eqid: string,
  last: { W: number | null; ST: string; NT: string; msg: string; unit: string }
) {
  if (!eqid) return
  const u = userid || ''
  map.set(key(u, eqid), {
    userid: u,
    eqid: String(eqid),
    last: { ...last },
    lastAt: new Date().toISOString()
  })
  broadcastEqList()
}

export function getAppClientCount() {
  return appClients.size
}
