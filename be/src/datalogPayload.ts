/**
 * WSS JSON 예:
 * { userid, eqid, time, ST, NT, W, unit, msg }
 */
export function isDatalogPayload(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const r = o as Record<string, unknown>
  if (typeof r.msg !== 'string' || r.msg.trim() === '') return false
  if (!('ST' in r) || !('NT' in r)) return false
  if (r.userid === undefined || r.eqid === undefined) return false
  return true
}

export function normalizeDatalog(
  o: Record<string, unknown>,
  senderIp: string,
  rawMessage: string
) {
  const Wraw = o.W
  let W: number | null = null
  if (typeof Wraw === 'number' && Number.isFinite(Wraw)) W = Wraw
  else if (typeof Wraw === 'string' && Wraw.trim() !== '') {
    const n = Number(Wraw)
    if (Number.isFinite(n)) W = n
  }

  return {
    senderIp,
    userid: String(o.userid ?? ''),
    eqid: String(o.eqid ?? ''),
    time: o.time,
    ST: o.ST != null ? String(o.ST) : '',
    NT: o.NT != null ? String(o.NT) : '',
    W: W ?? 0,
    unit: o.unit != null ? String(o.unit) : '',
    msg: String(o.msg),
    rawMessage: rawMessage.length > 65536 ? rawMessage.slice(0, 65536) + '…' : rawMessage
  }
}
