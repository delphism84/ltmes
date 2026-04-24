import type { WebSocket } from 'ws'
import { SystemConfig, DEFAULT_WEIGHT_AUTO } from './models/SystemConfig.js'
import { WeightCompleteDraft } from './models/WeightCompleteDraft.js'
import { TagList } from './models/TagList.js'
import * as eqListStore from './eqListStore.js'
import {
  DEFAULT_LTMES_SPECS,
  MATERIAL_CODES,
  type LtmesSpec,
  type SpecMaterial
} from './defaultSpecs.js'

type Wa = typeof DEFAULT_WEIGHT_AUTO

type PerMat = {
  state: 'pending' | 'inProgress' | 'ok' | 'skip'
  targetKg: number | null
  stableSince: number | null
  anchorW: number | null
  capturedW: number | null
}

export type BatchStatePublic = {
  phase: 'idle' | 'running' | 'completed' | 'failed'
  specId: string
  batchId: string
  message: string
  /** 자동 측정 완료 직후 생성된 초안 `_id` (확정 전까지 유지). */
  lastDraftId: string | null
  order: string[]
  currentIndex: number
  currentCode: string | null
  per: Record<
    string,
    {
      state: PerMat['state']
      targetKg: number | null
      capturedW: number | null
    }
  >
}

let state: {
  phase: BatchStatePublic['phase']
  specId: string
  batchId: string
  message: string
  lastDraftId: string | null
  order: string[]
  currentIndex: number
  per: Record<string, PerMat>
  codeToEqid: Record<string, string>
} = {
  phase: 'idle',
  specId: '',
  batchId: '',
  message: '',
  lastDraftId: null,
  order: [],
  currentIndex: -1,
  per: {},
  codeToEqid: {}
}

let cachedWa: Wa = { ...DEFAULT_WEIGHT_AUTO }
let waLoadedAt = 0

/** Dev: fake scale — ON when `ltmesEmulation.enabled` in systemConfig. */
let emuCachedEnabled: boolean | null = null
let emuLoadedAt = 0
let emuMaterialKey: string | null = null
let emuInterval: ReturnType<typeof setInterval> | null = null
let emuWeight = 0
let emuPlateauUntil: number | null = null
let emuPostPlateau = false

export function invalidateEmulationConfig() {
  emuLoadedAt = 0
  emuCachedEnabled = null
}

/** Stop timers immediately (e.g. after PUT turns emulation off). */
export function stopWeightEmulation() {
  emuStopAll()
}

function emuStopAll() {
  if (emuInterval) {
    clearInterval(emuInterval)
    emuInterval = null
  }
  emuMaterialKey = null
  emuWeight = 0
  emuPlateauUntil = null
  emuPostPlateau = false
}

async function loadEmulationEnabled(): Promise<boolean> {
  const now = Date.now()
  if (now - emuLoadedAt < 3000 && emuCachedEnabled !== null) return emuCachedEnabled
  emuLoadedAt = now
  try {
    const doc = (await SystemConfig.findOne({ key: 'ltmesEmulation' }).lean()) as
      | { value?: { enabled?: boolean } }
      | null
    emuCachedEnabled = !!(doc?.value && typeof doc.value === 'object' && doc.value.enabled === true)
  } catch {
    emuCachedEnabled = false
  }
  return emuCachedEnabled
}

function emuLastPayload(w: number) {
  return {
    W: w,
    ST: '',
    NT: '',
    msg: 'emulation',
    unit: 'kg'
  }
}

function emuIntervalTick() {
  if (state.phase !== 'running') {
    emuStopAll()
    return
  }
  const code = state.order[state.currentIndex]
  if (!code || !state.per[code] || state.per[code].state !== 'inProgress') {
    emuStopAll()
    return
  }
  const eqid = state.codeToEqid[code] || defaultEqidForCode(code)
  const k = `${state.batchId}|${code}|${eqid}`
  if (k !== emuMaterialKey) {
    if (emuInterval) {
      clearInterval(emuInterval)
      emuInterval = null
    }
    return
  }

  const tk = state.per[code]?.targetKg
  const plateauTarget =
    tk != null && tk > 0 && Number.isFinite(Number(tk)) ? Math.min(100, Number(tk)) : 100

  const now = Date.now()

  if (emuPostPlateau) {
    eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(emuWeight))
    tickFromSnapshot()
    return
  }

  if (emuPlateauUntil != null && now < emuPlateauUntil) {
    eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(emuWeight))
    tickFromSnapshot()
    return
  }

  if (emuPlateauUntil != null && now >= emuPlateauUntil) {
    emuPlateauUntil = null
    emuPostPlateau = true
    eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(emuWeight))
    tickFromSnapshot()
    return
  }

  if (emuWeight >= plateauTarget) {
    emuWeight = plateauTarget
    emuPlateauUntil = now + 6000 + Math.floor(Math.random() * 1001)
    eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(emuWeight))
    tickFromSnapshot()
    return
  }

  const delta = 8 + Math.floor(Math.random() * 5)
  emuWeight = Math.min(emuWeight + delta, plateauTarget)
  eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(emuWeight))
  tickFromSnapshot()
}

async function syncWeightEmulation() {
  const enabled = await loadEmulationEnabled()
  if (!enabled) {
    emuStopAll()
    return
  }
  if (state.phase !== 'running') {
    emuStopAll()
    return
  }
  const code =
    state.currentIndex >= 0 && state.currentIndex < state.order.length
      ? state.order[state.currentIndex] ?? null
      : null
  if (!code || !state.per[code] || state.per[code].state !== 'inProgress') {
    emuStopAll()
    return
  }
  const eqid = state.codeToEqid[code] || defaultEqidForCode(code)
  const k = `${state.batchId}|${code}|${eqid}`

  if (k !== emuMaterialKey) {
    if (emuInterval) {
      clearInterval(emuInterval)
      emuInterval = null
    }
    emuMaterialKey = k
    emuWeight = 0
    emuPlateauUntil = null
    emuPostPlateau = false
    eqListStore.updateFromDatalog('ltmes', eqid, emuLastPayload(0))
    tickFromSnapshot()
  }

  if (emuMaterialKey === k && !emuInterval) {
    emuInterval = setInterval(() => {
      try {
        emuIntervalTick()
      } catch (e) {
        console.error('[ltmesEmulation] tick', e)
      }
    }, 1000)
  }
}

async function loadWeightAuto(): Promise<Wa> {
  const now = Date.now()
  if (now - waLoadedAt < 5000) return cachedWa
  waLoadedAt = now
  try {
    const doc = (await SystemConfig.findOne({ key: 'weightAuto' }).lean()) as
      | { value?: Wa }
      | null
    if (doc?.value && typeof doc.value === 'object') {
      const v = doc.value
      cachedWa = {
        mode: v.mode === 'percent' ? 'percent' : 'abs',
        absPlus: Number(v.absPlus) || DEFAULT_WEIGHT_AUTO.absPlus,
        absMinus: Number(v.absMinus) || DEFAULT_WEIGHT_AUTO.absMinus,
        percentHalfWidth: Number(v.percentHalfWidth) || DEFAULT_WEIGHT_AUTO.percentHalfWidth,
        stabilityWindowSec: Number(v.stabilityWindowSec) || DEFAULT_WEIGHT_AUTO.stabilityWindowSec
      }
    }
  } catch {
    /* */
  }
  return cachedWa
}

async function loadSpecsDoc(): Promise<{ specs: LtmesSpec[] }> {
  try {
    const doc = (await SystemConfig.findOne({ key: 'ltmesSpecs' }).lean()) as
      | { value?: { specs?: LtmesSpec[] } }
      | null
    const list = doc?.value?.specs
    if (Array.isArray(list) && list.length > 0) return { specs: list }
  } catch {
    /* */
  }
  return DEFAULT_LTMES_SPECS
}

function findSpec(specs: LtmesSpec[], specId: string): LtmesSpec | undefined {
  return specs.find(s => String(s.specId) === String(specId))
}

function mergeMaterials(spec: LtmesSpec): Record<string, SpecMaterial> {
  const out: Record<string, SpecMaterial> = {}
  for (const c of MATERIAL_CODES) {
    const m = spec.materials?.[c]
    out[c] = m
      ? { enabled: !!m.enabled, targetKg: m.targetKg != null ? Number(m.targetKg) : null }
      : { enabled: true, targetKg: null }
  }
  return out
}

function latestWForEqid(eqid: string): number | null {
  const rows = eqListStore.getEqListSnapshot().filter(e => String(e.eqid) === String(eqid))
  const r = rows.find(x => x.userid === 'ltmes') || rows[0]
  if (!r) return null
  const w = r.last.W
  if (w === null || w === undefined || !Number.isFinite(Number(w))) return null
  return Number(w)
}

function inBand(w: number, target: number, wa: Wa): boolean {
  if (wa.mode === 'percent') {
    const hw = Math.abs(target) * (wa.percentHalfWidth / 100)
    return w >= target - hw && w <= target + hw
  }
  return w >= target - wa.absMinus && w <= target + wa.absPlus
}

function publicState(): BatchStatePublic {
  const per: BatchStatePublic['per'] = {}
  for (const c of MATERIAL_CODES) {
    const p = state.per[c]
    if (p) {
      per[c] = {
        state: p.state,
        targetKg: p.targetKg,
        capturedW: p.capturedW
      }
    }
  }
  const currentCode =
    state.phase === 'running' && state.currentIndex >= 0 && state.currentIndex < state.order.length
      ? state.order[state.currentIndex] ?? null
      : null
  return {
    phase: state.phase,
    specId: state.specId,
    batchId: state.batchId,
    message: state.message,
    lastDraftId: state.lastDraftId,
    order: [...state.order],
    currentIndex: state.currentIndex,
    currentCode,
    per
  }
}

function emit() {
  eqListStore.broadcastToApp({ op: 'batchState', data: publicState() })
  void syncWeightEmulation()
}

export function getBatchState(): BatchStatePublic {
  return publicState()
}

export function pushBatchStateToOne(ws: WebSocket) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ op: 'batchState', data: publicState() }))
}

export async function startBatch(specId: string): Promise<{ ok: boolean; error?: string }> {
  const sid = String(specId || '').trim()
  if (!sid) return { ok: false, error: 'specId required' }
  if (state.phase === 'running') return { ok: false, error: 'batch already running' }

  emuStopAll()

  const { specs } = await loadSpecsDoc()
  const spec = findSpec(specs, sid)
  if (!spec) return { ok: false, error: 'unknown spec' }

  const mats = mergeMaterials(spec)
  const tags = await TagList.find({ active: true }).lean()
  const codeToEqid: Record<string, string> = {}
  for (const t of tags) {
    codeToEqid[String(t.code).toUpperCase()] = String(t.eqid)
  }
  for (const c of MATERIAL_CODES) {
    if (!codeToEqid[c]) codeToEqid[c] = defaultEqidForCode(c)
  }

  const order: string[] = []
  const per: Record<string, PerMat> = {}
  for (const c of MATERIAL_CODES) {
    const en = mats[c]?.enabled !== false
    const tk = mats[c]?.targetKg != null && Number.isFinite(Number(mats[c]?.targetKg)) ? Number(mats[c]!.targetKg) : null
    if (en) {
      order.push(c)
      per[c] = {
        state: 'pending',
        targetKg: tk,
        stableSince: null,
        anchorW: null,
        capturedW: null
      }
    } else {
      per[c] = {
        state: 'skip',
        targetKg: tk,
        stableSince: null,
        anchorW: null,
        capturedW: null
      }
    }
  }

  if (order.length === 0) return { ok: false, error: 'no enabled materials' }

  for (const c of order) {
    if (per[c]) per[c].state = 'pending'
  }
  per[order[0]!]!.state = 'inProgress'

  state = {
    phase: 'running',
    specId: sid,
    batchId: `b_${Date.now()}`,
    message: '',
    lastDraftId: null,
    order,
    currentIndex: 0,
    per,
    codeToEqid
  }
  await loadWeightAuto()
  emit()
  return { ok: true }
}

function defaultEqidForCode(code: string): string {
  const map: Record<string, string> = {
    G1: '10',
    S2: '20',
    S1: '30',
    W: '40',
    M3: '50',
    C1: '60',
    C2: '70',
    Ad1: '80',
    Ad2: '90'
  }
  return map[code] || '10'
}

export function cancelBatch() {
  if (state.phase === 'idle') return
  emuStopAll()
  state = {
    phase: 'idle',
    specId: '',
    batchId: '',
    message: 'cancelled',
    lastDraftId: null,
    order: [],
    currentIndex: -1,
    per: {},
    codeToEqid: {}
  }
  emit()
}

async function finishSuccess() {
  const p = state.per
  const doc = await WeightCompleteDraft.create({
    specId: state.specId,
    batchId: state.batchId,
    status: 'draft',
    G1: p.G1?.capturedW ?? null,
    S2: p.S2?.capturedW ?? null,
    S1: p.S1?.capturedW ?? null,
    W: p.W?.capturedW ?? null,
    M3: p.M3?.capturedW ?? null,
    C1: p.C1?.capturedW ?? null,
    C2: p.C2?.capturedW ?? null,
    Ad1: p.Ad1?.capturedW ?? null,
    Ad2: p.Ad2?.capturedW ?? null
  })
  state.phase = 'completed'
  state.lastDraftId = String(doc._id)
  state.message = `무게 초안 저장됨 (${String(doc._id)})`
  emit()
}

export function tickFromSnapshot() {
  if (state.phase !== 'running') return
  const code = state.order[state.currentIndex]
  if (!code || !state.per[code]) return

  const wa = cachedWa
  const windowMs = Math.max(500, wa.stabilityWindowSec * 1000)
  const now = Date.now()
  const eqid = state.codeToEqid[code] || defaultEqidForCode(code)
  const w = latestWForEqid(eqid)
  const cur = state.per[code]

  if (w === null) {
    cur.stableSince = null
    emit()
    return
  }

  const target = cur.targetKg
  let stableOk = false

  if (target != null && target > 0 && Number.isFinite(target)) {
    if (!inBand(w, target, wa)) {
      cur.stableSince = null
      cur.anchorW = null
      emit()
      return
    }
    if (cur.stableSince == null) cur.stableSince = now
    stableOk = now - cur.stableSince >= windowMs
  } else {
    if (cur.anchorW == null) {
      cur.anchorW = w
      cur.stableSince = now
    } else if (Math.abs(w - cur.anchorW) <= 0.08) {
      if (cur.stableSince == null) cur.stableSince = now
      stableOk = now - cur.stableSince >= windowMs
    } else {
      cur.anchorW = w
      cur.stableSince = now
      stableOk = false
    }
  }

  if (stableOk) {
    cur.capturedW = w
    cur.state = 'ok'
    cur.stableSince = null
    cur.anchorW = null

    const nextIdx = state.currentIndex + 1
    if (nextIdx >= state.order.length) {
      void finishSuccess().catch(err => {
        console.error('[batch] draft insert failed', err)
        state.phase = 'failed'
        state.message = err instanceof Error ? err.message : 'draft failed'
        emit()
      })
    } else {
      state.currentIndex = nextIdx
      const nc = state.order[state.currentIndex]
      if (nc && state.per[nc]) state.per[nc].state = 'inProgress'
      emit()
    }
  } else {
    emit()
  }
}
