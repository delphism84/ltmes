'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  Clock,
  Database,
  Download,
  List,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Settings,
  Tag,
  Trash2,
  X,
  Zap
} from 'lucide-react'

// 비우면 페이지와 동일 오리진의 /api (nginx 또는 Next rewrites). 도메인만 다를 때만 절대 URL 설정.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')
const JWT_KEY = 'ltmes_admin_jwt'

export type MenuKey =
  | 'realtime'
  | 'history'
  | 'dataList'
  | 'tags'
  | 'settings'
  | 'datalog'
  | 'rxLogs'

type RxRow = {
  _id: string
  senderIp: string
  userid: string
  eqid: string
  time?: unknown
  txpacket?: unknown
  rxpacket?: unknown
  rawMessage?: string
  parseError?: string
  createdAt?: string
}

type DatalogRow = {
  _id: string
  senderIp: string
  userid: string
  eqid: string
  time?: unknown
  ST?: string
  NT?: string
  W?: number
  unit?: string
  msg: string
  createdAt?: string
}

function formatJsonish(p: unknown): string {
  if (p === null || p === undefined) return '—'
  if (typeof p === 'string') return p.length > 400 ? p.slice(0, 400) + '…' : p
  try {
    const s = JSON.stringify(p)
    return s.length > 600 ? s.slice(0, 600) + '…' : s
  } catch {
    return String(p)
  }
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d)
}

type ApiCallback = (path: string, init?: RequestInit) => Promise<unknown>

async function authorizedFetch(path: string, jwt: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    Authorization: `Bearer ${jwt}`
  }
  if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path
  return fetch(url, { ...init, headers })
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yesterdayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function recordQueryRange(date: string, timeFrom: string, timeTo: string): { from: string; to: string } {
  const from = new Date(`${date}T${timeFrom}:00`)
  const to = new Date(`${date}T${timeTo}:00`)
  to.setSeconds(59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

type RecordLogRow = {
  _id: string
  createdAt?: string
  specId?: string
  batchId?: string
  note?: string
  createdBy?: string
  G1?: number | null
  S2?: number | null
  S1?: number | null
  W?: number | null
  M3?: number | null
  C1?: number | null
  C2?: number | null
  Ad1?: number | null
  Ad2?: number | null
}

/** 기록(recordLogs) 무게 컬럼 — 조회·데이터 목록 테이블 공통 */
const RECORD_WEIGHT_COLS = [
  { key: 'G1' as const, label: 'G1' },
  { key: 'S2' as const, label: 'S2' },
  { key: 'S1' as const, label: 'S1' },
  { key: 'W' as const, label: 'W' },
  { key: 'M3' as const, label: 'M3' },
  { key: 'C1' as const, label: 'C1' },
  { key: 'C2' as const, label: 'C2' },
  { key: 'Ad1' as const, label: 'Ad1' },
  { key: 'Ad2' as const, label: 'Ad2' }
] as const

function formatRecordWeight(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  if (Number.isInteger(n)) return String(n)
  const t = n.toFixed(2)
  return t.replace(/\.?0+$/, '')
}

const recordTableThMeta = 'px-1.5 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap text-[10px]'
const recordTableThNum = 'px-0.5 py-1.5 text-center font-medium text-gray-500 whitespace-nowrap text-[10px]'
const recordTableTdMeta = 'px-1.5 py-1 text-left text-[11px] text-gray-800 whitespace-nowrap align-middle'
const recordTableTdNum = 'px-0.5 py-1 text-center font-mono tabular-nums text-[11px] text-gray-800 whitespace-nowrap align-middle'

const NAV_ITEMS: { key: MenuKey; label: string; icon: typeof Zap }[] = [
  { key: 'realtime', label: '실시간 모니터링', icon: Zap },
  { key: 'history', label: '기록 조회', icon: Clock },
  { key: 'dataList', label: '데이터 목록', icon: List },
  { key: 'tags', label: '태그 관리', icon: Tag },
  { key: 'settings', label: '설정', icon: Settings },
  { key: 'datalog', label: 'datalog', icon: Database },
  { key: 'rxLogs', label: 'rxLogs', icon: Radio }
]

function LogoMark() {
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className="text-green-600 shrink-0">
      <path d="M8 12 L20 6 L20 18 L8 24Z" fill="currentColor" opacity={0.7} />
      <path d="M20 6 L32 12 L20 18Z" fill="currentColor" />
      <path d="M8 18 L20 12 L20 24 L8 30Z" fill="currentColor" opacity={0.5} />
      <path d="M20 12 L32 18 L20 24Z" fill="currentColor" opacity={0.7} />
    </svg>
  )
}

export default function LtmesRxLogsAdmin() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('Eogks!@34')
  const [jwt, setJwt] = useState('')
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<MenuKey>('datalog')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [rows, setRows] = useState<(RxRow | DatalogRow)[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const qRef = useRef(q)
  qRef.current = q
  const [loading, setLoading] = useState(false)
  const limit = 50

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(JWT_KEY) : null
    if (t) setJwt(t)
  }, [])

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
        Authorization: `Bearer ${jwt}`
      }
      if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
      const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path
      const res = await fetch(url, { ...init, headers })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        localStorage.removeItem(JWT_KEY)
        setJwt('')
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unauthorized')
      }
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      return data
    },
    [jwt]
  )

  const load = useCallback(
    async (overridePage?: number) => {
      if (!jwt) return
      const p = overridePage ?? page
      setLoading(true)
      setError('')
      try {
        const qs = new URLSearchParams({ page: String(p), limit: String(limit) })
        const qt = qRef.current.trim()
        if (qt) qs.set('q', qt)
        const path = menu === 'datalog' ? '/api/datalog' : '/api/rx-logs'
        const data = await api(`${path}?${qs}`)
        setRows(Array.isArray(data?.data) ? data.data : [])
        setTotal(typeof data?.total === 'number' ? data.total : 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        setLoading(false)
      }
    },
    [api, jwt, page, menu]
  )

  useEffect(() => {
    if (!jwt || (menu !== 'datalog' && menu !== 'rxLogs')) return
    void load()
  }, [jwt, page, menu, load])

  const login = async () => {
    setError('')
    try {
      const loginUrl = API_BASE_URL ? `${API_BASE_URL}/api/auth/login` : '/api/auth/login'
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json().catch(() => ({}))
      const tok = data?.token ?? data?.Token
      if (!res.ok || !tok) {
        setError(typeof data?.error === 'string' ? data.error : '로그인 실패')
        return
      }
      localStorage.setItem(JWT_KEY, tok)
      setJwt(tok)
    } catch {
      setError('네트워크 오류')
    }
  }

  const logout = () => {
    localStorage.removeItem(JWT_KEY)
    setJwt('')
    setRows([])
    setTotal(0)
    setMenu('datalog')
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const selectMenu = (key: MenuKey) => {
    setMenu(key)
    setPage(1)
    setMobileNavOpen(false)
  }

  if (!jwt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <LogoMark />
            <div>
              <h1 className="text-lg font-bold text-gray-900">LT MES</h1>
              <p className="text-sm text-gray-500">관리자 로그인</p>
            </div>
          </div>
          {error ? <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div> : null}
          <label className="block text-sm text-gray-600 mb-1">아이디</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
          />
          <label className="block text-sm text-gray-600 mb-1">비밀번호</label>
          <input
            type="password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => void login()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <LogIn className="w-4 h-4" />
            로그인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <LogoMark />
            <div className="min-w-0">
              <span className="text-xs sm:text-sm text-gray-400 block truncate">주식회사엘티</span>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">MES</h1>
              <p className="text-xs sm:text-sm text-gray-500 -mt-0.5">중량 관리 시스템</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 border border-gray-200"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label="메뉴"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="hidden sm:flex items-center gap-2 text-gray-600">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-medium">관리자</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 데스크톱: 가로 탭 */}
      <nav className="hidden md:block max-w-7xl mx-auto px-6 pt-4">
        <div className="flex flex-wrap gap-1">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectMenu(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                menu === key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* 모바일: 세로 메뉴 패널 */}
      {mobileNavOpen ? (
        <nav className="md:hidden border-b border-gray-200 bg-white px-4 py-3 max-w-7xl mx-auto">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => selectMenu(key)}
                className={`flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  menu === key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {menu === 'realtime' && <RealtimeMonitoringPage jwt={jwt} api={api} />}
        {menu === 'history' && <RecordHistoryPanel api={api} jwt={jwt} />}
        {menu === 'dataList' && <RecordDataListPanel api={api} jwt={jwt} />}
        {menu === 'tags' && <TagsPanel api={api} jwt={jwt} />}
        {menu === 'settings' && <SettingsPanel api={api} jwt={jwt} />}
        {(menu === 'datalog' || menu === 'rxLogs') && (
          <div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 mb-4">
              <input
                className="w-full sm:flex-1 sm:min-w-[200px] max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder={
                  menu === 'datalog' ? '검색 (userid·eqid·IP·msg)' : '검색 (userid / eqid / IP)'
                }
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setPage(1)
                    void load(1)
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPage(1)
                    void load(1)
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  검색
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  새로고침
                </button>
              </div>
            </div>

            {error ? (
              <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</div>
            ) : null}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                      {menu === 'datalog' ? (
                        <>
                          <th className="py-3 px-2 text-left font-medium whitespace-nowrap">수신(KST)</th>
                          <th className="py-3 px-2 text-left font-medium whitespace-nowrap">송신 IP</th>
                          <th className="py-3 px-2 text-left font-medium">userid</th>
                          <th className="py-3 px-2 text-left font-medium">eqid</th>
                          <th className="py-3 px-2 text-left font-medium">time</th>
                          <th className="py-3 px-2 text-center font-medium">ST</th>
                          <th className="py-3 px-2 text-center font-medium">NT</th>
                          <th className="py-3 px-2 text-center font-medium">W</th>
                          <th className="py-3 px-2 text-center font-medium">unit</th>
                          <th className="py-3 px-2 text-left font-medium min-w-[200px]">msg</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-2 text-left font-medium whitespace-nowrap">수신(KST)</th>
                          <th className="py-3 px-2 text-left font-medium whitespace-nowrap">송신 IP</th>
                          <th className="py-3 px-2 text-left font-medium">userid</th>
                          <th className="py-3 px-2 text-left font-medium">eqid</th>
                          <th className="py-3 px-2 text-left font-medium">time</th>
                          <th className="py-3 px-2 text-left font-medium min-w-[120px]">txpacket</th>
                          <th className="py-3 px-2 text-left font-medium min-w-[120px]">rxpacket</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={menu === 'datalog' ? 10 : 7}
                          className="py-12 text-center text-gray-400"
                        >
                          {loading ? '불러오는 중…' : '데이터 없음'}
                        </td>
                      </tr>
                    ) : menu === 'datalog' ? (
                      (rows as DatalogRow[]).map(r => (
                        <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 whitespace-nowrap text-gray-700">{formatTime(r.createdAt)}</td>
                          <td className="py-2 px-2 font-mono text-xs text-gray-600">{r.senderIp || '—'}</td>
                          <td className="py-2 px-2">{r.userid || '—'}</td>
                          <td className="py-2 px-2">{r.eqid || '—'}</td>
                          <td className="py-2 px-2 text-xs max-w-[140px] truncate">{formatJsonish(r.time)}</td>
                          <td className="py-2 px-2 text-center">{r.ST ?? '—'}</td>
                          <td className="py-2 px-2 text-center">{r.NT ?? '—'}</td>
                          <td className="py-2 px-2 text-center">{r.W ?? '—'}</td>
                          <td className="py-2 px-2 text-center">{r.unit ?? '—'}</td>
                          <td className="py-2 px-2 font-mono text-xs text-gray-800 break-all max-w-md">{r.msg || '—'}</td>
                        </tr>
                      ))
                    ) : (
                      (rows as RxRow[]).map(r => (
                        <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 whitespace-nowrap text-gray-700">{formatTime(r.createdAt)}</td>
                          <td className="py-2 px-2 font-mono text-xs text-gray-600">{r.senderIp || '—'}</td>
                          <td className="py-2 px-2">{r.userid || '—'}</td>
                          <td className="py-2 px-2">{r.eqid || '—'}</td>
                          <td className="py-2 px-2 text-xs max-w-[120px]">{formatJsonish(r.time)}</td>
                          <td className="py-2 px-2 font-mono text-xs break-all max-w-xs">{formatJsonish(r.txpacket)}</td>
                          <td className="py-2 px-2 font-mono text-xs break-all max-w-xs">
                            {formatJsonish(r.rxpacket)}
                            {r.parseError ? (
                              <span className="text-red-500 ml-1">(parse: {r.parseError})</span>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 text-sm text-gray-600">
              <span>
                총 {total}건 · 페이지 {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  이전
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  다음
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-400">API: {API_BASE_URL || 'same-origin /api'}</p>
          </div>
        )}
      </main>
    </div>
  )
}

type EqListRow = {
  userid: string
  eqid: string
  last: { W: number | null; ST: string; NT: string; msg: string; unit: string }
  lastAt: string
}

function buildWsAppUrl(jwt: string) {
  const base = (process.env.NEXT_PUBLIC_BE_WS_ORIGIN || '').replace(/\/$/, '')
  if (base) return `${base}/ws/app?token=${encodeURIComponent(jwt)}`
  if (typeof window === 'undefined') return ''
  const o = new URL('/ws/app', window.location.origin)
  o.protocol = o.protocol === 'https:' ? 'wss:' : 'ws:'
  o.searchParams.set('token', jwt)
  return o.toString()
}

/** ltmes/docs/a1 실시간 모니터링 (Gateway 패널 제거, 센서=eqList WSS) */
type BatchStateMsg = {
  phase: 'idle' | 'running' | 'completed' | 'failed'
  specId: string
  batchId: string
  message: string
  lastDraftId?: string | null
  order: string[]
  currentIndex: number
  currentCode: string | null
  per: Record<string, { state: string; targetKg: number | null; capturedW: number | null }>
}

type WeightDraftRow = {
  _id?: string
  status?: string
  specId?: string
  batchId?: string
  G1?: number | null
  S2?: number | null
  S1?: number | null
  W?: number | null
  M3?: number | null
  C1?: number | null
  C2?: number | null
  Ad1?: number | null
  Ad2?: number | null
}

type SpecApi = {
  specId: string
  materials?: Record<string, { enabled?: boolean; targetKg?: number | null }>
}

function RealtimeMonitoringPage({ jwt, api }: { jwt: string; api: ApiCallback }) {
  const wsRef = useRef<WebSocket | null>(null)
  const prevBatchPhase = useRef<string | null>(null)
  const lastHydratedDraftId = useRef<string | null>(null)
  const [eqList, setEqList] = useState<EqListRow[]>([])
  const [batchState, setBatchState] = useState<BatchStateMsg | null>(null)
  const [specList, setSpecList] = useState<SpecApi[]>([])
  const [batchAck, setBatchAck] = useState('')
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null)
  const [specSelect, setSpecSelect] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [weights, setWeights] = useState<Record<string, string>>({
    g1: '',
    s2: '',
    s1: '',
    w: '',
    m3: '',
    c1: '',
    c2: '',
    ad1: '',
    ad2: ''
  })
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null)

  useEffect(() => {
    const p = batchState?.phase
    if (p === 'running' && prevBatchPhase.current !== 'running') {
      setPendingDraftId(null)
      setWeights({
        g1: '',
        s2: '',
        s1: '',
        w: '',
        m3: '',
        c1: '',
        c2: '',
        ad1: '',
        ad2: ''
      })
      lastHydratedDraftId.current = null
    }
    prevBatchPhase.current = p ?? null
  }, [batchState?.phase])

  useEffect(() => {
    if (!jwt) return
    const id =
      batchState?.phase === 'completed' && batchState.lastDraftId ? String(batchState.lastDraftId) : ''
    if (!id) return
    if (lastHydratedDraftId.current === id) return
    let cancelled = false
    void (async () => {
      try {
        const d = (await api(`/api/weight-drafts/${id}`)) as WeightDraftRow
        if (cancelled) return
        lastHydratedDraftId.current = id
        if (d.status !== 'draft') {
          setPendingDraftId(null)
          return
        }
        setPendingDraftId(id)
        if (d.specId) setSpecSelect(String(d.specId))
        setWeights({
          g1: d.G1 != null && Number.isFinite(Number(d.G1)) ? String(d.G1) : '',
          s2: d.S2 != null && Number.isFinite(Number(d.S2)) ? String(d.S2) : '',
          s1: d.S1 != null && Number.isFinite(Number(d.S1)) ? String(d.S1) : '',
          w: d.W != null && Number.isFinite(Number(d.W)) ? String(d.W) : '',
          m3: d.M3 != null && Number.isFinite(Number(d.M3)) ? String(d.M3) : '',
          c1: d.C1 != null && Number.isFinite(Number(d.C1)) ? String(d.C1) : '',
          c2: d.C2 != null && Number.isFinite(Number(d.C2)) ? String(d.C2) : '',
          ad1: d.Ad1 != null && Number.isFinite(Number(d.Ad1)) ? String(d.Ad1) : '',
          ad2: d.Ad2 != null && Number.isFinite(Number(d.Ad2)) ? String(d.Ad2) : ''
        })
      } catch {
        if (!cancelled) lastHydratedDraftId.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, jwt, batchState?.phase, batchState?.lastDraftId])

  useEffect(() => {
    if (!jwt) return
    void (async () => {
      try {
        const d = (await api('/api/specs')) as { specs?: SpecApi[] }
        if (Array.isArray(d?.specs)) setSpecList(d.specs)
      } catch {
        /* */
      }
    })()
  }, [api, jwt])

  useEffect(() => {
    if (!jwt) return
    const u = buildWsAppUrl(jwt)
    if (!u) return
    const ws = new WebSocket(u)
    wsRef.current = ws
    ws.onmessage = ev => {
      try {
        const o = JSON.parse(ev.data as string) as {
          op?: string
          data?: EqListRow[] | BatchStateMsg
          ok?: boolean
          error?: string
          specId?: string
        }
        if (o.op === 'eqList' && Array.isArray(o.data)) setEqList(o.data as EqListRow[])
        if (o.op === 'batchState' && o.data && typeof o.data === 'object' && 'phase' in o.data) {
          setBatchState(o.data as BatchStateMsg)
        }
        if (o.op === 'startBatchAck') {
          setBatchAck(
            o.ok
              ? `배치 시작: ${String(o.specId ?? '')}`
              : `배치 실패: ${String(o.error ?? '')}`
          )
          setTimeout(() => setBatchAck(''), 4000)
        }
      } catch {
        /* ignore */
      }
    }
    return () => {
      wsRef.current = null
      try {
        ws.close()
      } catch {
        /* */
      }
    }
  }, [jwt])

  const saveRecord = async () => {
    setSaveMsg('')
    setSaveBusy(true)
    try {
      const num = (k: keyof typeof weights) => {
        const v = weights[k]?.trim()
        if (!v) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      const body = {
        specId: specSelect || '',
        batchId: batchState?.batchId && pendingDraftId ? String(batchState.batchId) : '',
        note: '',
        G1: num('g1'),
        S2: num('s2'),
        S1: num('s1'),
        W: num('w'),
        M3: num('m3'),
        C1: num('c1'),
        C2: num('c2'),
        Ad1: num('ad1'),
        Ad2: num('ad2')
      }
      if (pendingDraftId) {
        await api(`/api/weight-drafts/${pendingDraftId}/confirm`, {
          method: 'POST',
          body: JSON.stringify(body)
        })
        setPendingDraftId(null)
        lastHydratedDraftId.current = null
      } else {
        await api('/api/record-logs', {
          method: 'POST',
          body: JSON.stringify({ ...body, batchId: '' })
        })
      }
      setSaveMsg('저장되었습니다.')
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaveBusy(false)
    }
  }

  const forEq = (eq: string) => {
    const same = eqList.filter(x => String(x.eqid) === String(eq))
    return same.find(x => x.userid === 'ltmes') || same[0]
  }

  const matEnabled = (specId: string | null, code: string) => {
    if (!specId) return true
    const sp = specList.find(s => s.specId === specId)
    const m = sp?.materials?.[code]
    return m?.enabled !== false
  }

  const sendStartBatch = () => {
    if (!selectedSpec || !wsRef.current || wsRef.current.readyState !== 1) {
      setBatchAck('WebSocket 또는 규격을 확인하세요')
      setTimeout(() => setBatchAck(''), 3500)
      return
    }
    wsRef.current.send(JSON.stringify({ op: 'startBatch', specId: selectedSpec }))
  }

  const sendCancelBatch = () => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ op: 'cancelBatch' }))
    }
  }

  const batchLane = [
    { code: 'G1' as const, label: '자갈' },
    { code: 'S2' as const, label: '석분' },
    { code: 'S1' as const, label: '모래' },
    { code: 'W' as const, label: '물' },
    { code: 'M3' as const, label: '혼화제' }
  ] as const
  const sensorSmall = [
    { id: 'G1', material: '자갈', eq: '10', dev: 'lt.ww01' },
    { id: 'S2', material: '석분', eq: '20', dev: 'lt.ww02' },
    { id: 'S1', material: '모래', eq: '30', dev: 'lt.ww03' },
    { id: 'W', material: '물', eq: '40', dev: 'lt.ww04' },
    { id: 'M3', material: '혼화제', eq: '50', dev: 'lt.ww05' }
  ] as const
  const sensorLarge = sensorSmall

  return (
    <div>
      {/* 센서 연결 상태 — eqList(WSS /ws/app) + ltmes 기본선 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">센서 연결 상태</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">일부 센서 이상</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {sensorSmall.map(s => {
            const primary = forEq(s.eq)
            const others = eqList.filter(
              x => String(x.eqid) === String(s.eq) && x.userid && x.userid !== 'ltmes'
            )
            const ok = !!primary
            const wDisp =
              primary && primary.last.W != null && Number.isFinite(Number(primary.last.W))
                ? String(primary.last.W)
                : '—'
            return (
            <div
              key={s.id}
              className={`rounded-lg border border-gray-200 bg-gray-50 p-2.5 transition-all duration-300 ${
                selectedSpec && !matEnabled(selectedSpec, s.id) ? 'opacity-30' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      ok ? 'bg-emerald-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-gray-700">{s.id}</span>
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    ok ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                >
                  {ok ? '수신' : '미수신'}
                </span>
              </div>
              <div className="space-y-0.5 text-[10px] text-gray-500">
                <p>
                  원료: <span className="text-gray-700 font-medium">{s.material}</span>
                </p>
                <p>
                  장비ID: <span className="text-gray-700 font-medium">{s.eq}</span>
                </p>
                <p>
                  장비명: <span className="text-gray-700 font-medium">{s.dev}</span>
                </p>
                <p>
                  최근값:{' '}
                  <span
                    className={`font-bold ${
                      ok ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {wDisp}
                    {ok && primary?.last?.unit ? ` ${primary.last.unit}` : ''}
                  </span>
                </p>
                <p>
                  경과:{' '}
                  <span className="font-medium text-gray-500">
                    {ok && primary
                      ? formatTime(primary.lastAt)
                      : '수신 없음'}
                  </span>
                </p>
                {ok && primary?.userid ? (
                  <p className="text-[9px] text-indigo-600 truncate" title={primary.userid}>
                    userid: {primary.userid}
                  </p>
                ) : null}
                {others.length > 0 ? (
                  <p className="text-[9px] text-gray-500 break-all">
                    기타: {others.map(o => `${o.userid}(${o.last.W ?? '—'})`).join(' · ')}
                  </p>
                ) : null}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* 규격 선택 — a1 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <h3 className="text-sm font-bold text-gray-700 whitespace-nowrap">규격 선택</h3>
          <div className="flex flex-wrap gap-2">
            {(specList.length > 0 ? specList.map(s => s.specId) : ['20-40-80', '25-27-150', '25-40-150']).map(
              spec => (
                <button
                  key={spec}
                  type="button"
                  onClick={() => setSelectedSpec(spec)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedSpec === spec ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {spec}
                </button>
              )
            )}
          </div>
          <span className="text-xs text-red-500">배치 투입 전 규격을 선택하세요</span>
          <div className="lg:ml-auto flex flex-wrap items-center gap-2">
            {batchAck ? <span className="text-xs text-gray-600 max-w-[200px]">{batchAck}</span> : null}
            <button
              type="button"
              disabled={!selectedSpec || batchState?.phase === 'running'}
              onClick={() => sendStartBatch()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              배치 시작 (WSS)
            </button>
            <button
              type="button"
              disabled={batchState?.phase !== 'running'}
              onClick={() => sendCancelBatch()}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            >
              취소
            </button>
          </div>
        </div>
      </div>

      {/* 배치 투입 진행 — BE FSM + WSS batchState */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">배치 투입 진행</h3>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              batchState?.phase === 'running'
                ? 'bg-amber-100 text-amber-800'
                : batchState?.phase === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : batchState?.phase === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
            }`}
          >
            {batchState?.phase === 'running'
              ? '진행'
              : batchState?.phase === 'completed'
                ? '완료'
                : batchState?.phase === 'failed'
                  ? '실패'
                  : '대기'}
          </span>
        </div>
        {batchState?.message ? (
          <p className="text-[10px] text-gray-500 mb-2">{batchState.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 items-stretch">
          {batchLane.map(({ code, label }, i) => {
            const st = batchState?.per?.[code]
            const active = batchState?.phase === 'running' && batchState.currentCode === code
            const done = st?.state === 'ok'
            const skip = st?.state === 'skip'
            const dim = selectedSpec && !matEnabled(selectedSpec, code)
            return (
              <Fragment key={code}>
                <div
                  className={`flex items-center gap-2 flex-1 min-w-[100px] sm:min-w-[120px] ${dim ? 'opacity-30' : ''}`}
                >
                  <div
                    className={`flex-1 rounded-lg bg-gray-100 border-2 transition-all duration-500 overflow-hidden w-full ${
                      active ? 'border-amber-400 ring-2 ring-amber-300 ring-offset-1 animate-pulse' : 'border-gray-200'
                    } ${done ? 'border-emerald-500 bg-emerald-50/50' : ''}`}
                  >
                    <div className="flex items-center justify-between px-2.5 pt-2">
                      <span className="text-xs font-bold text-gray-600">
                        {label} ({code})
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          done ? 'text-emerald-700' : skip ? 'text-gray-400' : active ? 'text-amber-700' : 'text-gray-400'
                        }`}
                      >
                        {done ? '측정완료' : skip ? '미사용' : active ? '측정중' : '대기'}
                      </span>
                    </div>
                    <div className="h-12 px-1 pb-1">
                      <div className="h-full flex items-center justify-center">
                        <span className="text-[10px] text-gray-600 font-mono">
                          {st?.capturedW != null ? `${st.capturedW}` : skip ? '—' : '…'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {i < batchLane.length - 1 ? (
                  <span className="text-xs flex-shrink-0 self-center text-gray-300 px-0.5">→</span>
                ) : null}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* 큰 무게 카드 5열 — a1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {sensorLarge.map(s => {
          const e = forEq(s.eq)
          const wn =
            e && e.last.W != null && Number.isFinite(Number(e.last.W)) ? Number(e.last.W) : 0
          return (
          <div
            key={`lg-${s.id}`}
            className={`bg-white rounded-xl border-2 p-4 transition-all duration-500 border-gray-200 ${
              selectedSpec && !matEnabled(selectedSpec, s.id) ? 'opacity-30' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-base font-bold text-gray-900">{s.id}</h3>
                <p className="text-xs text-gray-400">{s.material}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">자동</span>
            </div>
            <div className="text-center my-3">
              <span className="text-3xl font-bold text-indigo-600">{wn.toFixed(1)}</span>
              <p className="text-sm text-gray-500 mt-0.5">kg</p>
            </div>
            <div className="text-[10px] text-gray-400">
              <p>장비: {s.dev}</p>
              <p>통신: {e ? formatTime(e.lastAt) : '—'}</p>
            </div>
          </div>
          )
        })}
      </div>

      {/* 무게측정 하단 — a1 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-bold text-gray-700 whitespace-nowrap">무게측정</h3>
            {pendingDraftId ? (
              <p className="text-[10px] text-amber-700 max-w-md">
                자동 측정 초안이 표시되었습니다. 값을 수정한 뒤 저장하면 기록(recordLogs)으로 확정됩니다.
              </p>
            ) : (
              <p className="text-[10px] text-gray-500 max-w-md">
                초안 없이 입력 후 저장하면 바로 기록으로 저장됩니다.
              </p>
            )}
          </div>
          <select
            value={specSelect}
            onChange={e => setSpecSelect(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-auto"
          >
            <option value="">규격 선택</option>
            {(specList.length > 0 ? specList.map(s => s.specId) : ['20-40-80', '25-27-150', '25-40-150']).map(
              sid => (
                <option key={sid} value={sid}>
                  {sid}
                </option>
              )
            )}
          </select>
          <button
            type="button"
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap w-fit"
          >
            <Download className="w-3.5 h-3.5" />
            센서데이터
          </button>
          <div className="xl:ml-auto flex flex-col items-end gap-1">
            {saveMsg ? (
              <span
                className={`text-xs ${
                  saveMsg === '저장되었습니다.' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {saveMsg}
              </span>
            ) : null}
            <button
              type="button"
              disabled={!jwt || saveBusy}
              onClick={() => void saveRecord()}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-400 transition-colors whitespace-nowrap"
            >
              {saveBusy ? '저장 중…' : pendingDraftId ? '기록으로 확정 저장' : '저장'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
          {(
            [
              ['g1', 'G1(자갈)'],
              ['s2', 'S2(석분)'],
              ['s1', 'S1(모래)'],
              ['w', 'W(물)'],
              ['m3', 'M3(혼화제)'],
              ['c1', 'C1(시멘트)'],
              ['c2', 'C2(예비)'],
              ['ad1', 'Ad1(AE감수제)'],
              ['ad2', 'Ad2(AE감수제)']
            ] as const
          ).map(([key, lab]) => (
            <div key={key} className="flex-1 min-w-0">
              <label className="block text-[10px] text-gray-500 mb-0.5 truncate">{lab}</label>
              <input
                type="number"
                step="0.01"
                value={weights[key]}
                onChange={e => setWeights(w => ({ ...w, [key]: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RecordHistoryPanel({ api, jwt }: { api: ApiCallback; jwt: string }) {
  const [date, setDate] = useState(todayYmd)
  const [tFrom, setTFrom] = useState('00:00')
  const [tTo, setTTo] = useState('23:59')
  const [rows, setRows] = useState<RecordLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [exportBusy, setExportBusy] = useState<'csv' | 'print' | 'xlsx' | 'pdf' | null>(null)
  const limit = 50

  const doQuery = async (p = 1) => {
    if (!jwt) {
      setErr('로그인이 필요합니다.')
      return
    }
    const { from, to } = recordQueryRange(date, tFrom, tTo)
    setLoading(true)
    setErr('')
    try {
      const qs = new URLSearchParams({ from, to, page: String(p), limit: String(limit) })
      const data = (await api(`/api/record-logs?${qs}`)) as {
        data?: RecordLogRow[]
        total?: number
      }
      setRows(Array.isArray(data?.data) ? data.data : [])
      setTotal(typeof data?.total === 'number' ? data.total : 0)
      setPage(p)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  const download = async (kind: 'csv' | 'print' | 'xlsx' | 'pdf') => {
    if (!jwt) {
      setErr('로그인이 필요합니다.')
      return
    }
    setExportBusy(kind)
    setErr('')
    try {
      const { from, to } = recordQueryRange(date, tFrom, tTo)
      const qs = new URLSearchParams({ from, to })
      const path =
        kind === 'csv'
          ? `/api/record-logs/export/csv?${qs}`
          : kind === 'print'
            ? `/api/record-logs/export/print?${qs}`
            : kind === 'xlsx'
              ? `/api/record-logs/export/xlsx?${qs}`
              : `/api/record-logs/export/pdf?${qs}`
      const res = await authorizedFetch(path, jwt)
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download =
        kind === 'csv'
          ? 'record-logs.csv'
          : kind === 'print'
            ? 'record-logs-print.html'
            : kind === 'xlsx'
              ? 'record-logs.xlsx'
              : 'record-logs.pdf'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '다운로드 실패')
    } finally {
      setExportBusy(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">조회 시간 설정</h3>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm max-w-xs"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDate(todayYmd())}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setDate(yesterdayYmd())}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              전일
            </button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row flex-wrap gap-3 items-stretch lg:items-center">
          <span className="text-sm font-medium text-gray-600">시간</span>
          <input
            type="time"
            value={tFrom}
            onChange={e => setTFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-gray-400 hidden sm:inline">~</span>
          <input
            type="time"
            value={tTo}
            onChange={e => setTTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void doQuery(1)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 lg:ml-auto disabled:opacity-50"
          >
            {loading ? '조회 중…' : '조회'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            disabled={!!exportBusy || !jwt}
            onClick={() => void download('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportBusy === 'csv' ? 'CSV…' : '엑셀(CSV)'}
          </button>
          <button
            type="button"
            disabled={!!exportBusy || !jwt}
            onClick={() => void download('print')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportBusy === 'print' ? 'HTML…' : 'PDF용 HTML'}
          </button>
          <button
            type="button"
            disabled={!!exportBusy || !jwt}
            onClick={() => void download('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportBusy === 'xlsx' ? 'xlsx…' : 'xlsx'}
          </button>
          <button
            type="button"
            disabled={!!exportBusy || !jwt}
            onClick={() => void download('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportBusy === 'pdf' ? 'pdf…' : 'pdf'}
          </button>
          <span className="text-xs text-gray-500 self-center">
            HTML은 인쇄→PDF · xlsx/pdf는 서버 생성
          </span>
        </div>
        {err ? <p className="text-sm text-red-600 mt-2">{err}</p> : null}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">기록 목록</h3>
        <div className="overflow-x-auto -mx-1">
          <table className="w-max max-w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className={recordTableThMeta}>시간</th>
                <th className={recordTableThMeta}>규격</th>
                {RECORD_WEIGHT_COLS.map(c => (
                  <th key={c.key} className={recordTableThNum}>
                    {c.label}
                  </th>
                ))}
                <th className={recordTableThMeta}>비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3 + RECORD_WEIGHT_COLS.length} className="py-8 text-center text-gray-400">
                    조회 버튼으로 기간 내 기록을 불러옵니다.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className={recordTableTdMeta}>{formatTime(r.createdAt)}</td>
                    <td
                      className={`${recordTableTdMeta} max-w-[5rem] truncate`}
                      title={r.specId || ''}
                    >
                      {r.specId || '—'}
                    </td>
                    {RECORD_WEIGHT_COLS.map(c => (
                      <td key={c.key} className={recordTableTdNum}>
                        {formatRecordWeight(r[c.key])}
                      </td>
                    ))}
                    <td
                      className={`${recordTableTdMeta} text-gray-500 max-w-[6rem] truncate`}
                      title={r.note || ''}
                    >
                      {r.note || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 text-sm text-gray-600">
            <span>
              총 {total}건 · 페이지 {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void doQuery(page - 1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void doQuery(page + 1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RecordDataListPanel({ api, jwt }: { api: ApiCallback; jwt: string }) {
  const [date, setDate] = useState(todayYmd)
  const [tFrom, setTFrom] = useState('00:00')
  const [tTo, setTTo] = useState('23:59')
  const [rows, setRows] = useState<RecordLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<RecordLogRow | null>(null)
  const [form, setForm] = useState({
    specId: '',
    batchId: '',
    note: '',
    G1: '',
    S2: '',
    S1: '',
    W: '',
    M3: '',
    C1: '',
    C2: '',
    Ad1: '',
    Ad2: ''
  })
  const [modalBusy, setModalBusy] = useState(false)
  const limit = 50

  const openEdit = (r: RecordLogRow) => {
    const n = (v: number | null | undefined) => (v != null && Number.isFinite(Number(v)) ? String(v) : '')
    setForm({
      specId: r.specId ?? '',
      batchId: r.batchId ?? '',
      note: r.note ?? '',
      G1: n(r.G1),
      S2: n(r.S2),
      S1: n(r.S1),
      W: n(r.W),
      M3: n(r.M3),
      C1: n(r.C1),
      C2: n(r.C2),
      Ad1: n(r.Ad1),
      Ad2: n(r.Ad2)
    })
    setEditing(r)
  }

  const doQuery = async (p = 1) => {
    if (!jwt) {
      setErr('로그인이 필요합니다.')
      return
    }
    const { from, to } = recordQueryRange(date, tFrom, tTo)
    setLoading(true)
    setErr('')
    try {
      const qs = new URLSearchParams({ from, to, page: String(p), limit: String(limit) })
      const data = (await api(`/api/record-logs?${qs}`)) as {
        data?: RecordLogRow[]
        total?: number
      }
      setRows(Array.isArray(data?.data) ? data.data : [])
      setTotal(typeof data?.total === 'number' ? data.total : 0)
      setPage(p)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const num = (s: string) => {
      const t = s.trim()
      if (!t) return null
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }
    setModalBusy(true)
    setErr('')
    try {
      await api(`/api/record-logs/${editing._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          specId: form.specId,
          batchId: form.batchId,
          note: form.note,
          G1: num(form.G1),
          S2: num(form.S2),
          S1: num(form.S1),
          W: num(form.W),
          M3: num(form.M3),
          C1: num(form.C1),
          C2: num(form.C2),
          Ad1: num(form.Ad1),
          Ad2: num(form.Ad2)
        })
      })
      setEditing(null)
      await doQuery(page)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setModalBusy(false)
    }
  }

  const deleteRow = async (r: RecordLogRow) => {
    if (!window.confirm('이 기록을 삭제할까요?')) return
    setErr('')
    try {
      await api(`/api/record-logs/${r._id}`, { method: 'DELETE' })
      await doQuery(page)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">조회 (데이터 목록)</h3>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm max-w-xs"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDate(todayYmd())}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setDate(yesterdayYmd())}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              전일
            </button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row flex-wrap gap-3 items-stretch lg:items-center">
          <span className="text-sm font-medium text-gray-600">시간</span>
          <input
            type="time"
            value={tFrom}
            onChange={e => setTFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-gray-400 hidden sm:inline">~</span>
          <input
            type="time"
            value={tTo}
            onChange={e => setTTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void doQuery(1)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 lg:ml-auto disabled:opacity-50"
          >
            {loading ? '조회 중…' : '조회'}
          </button>
        </div>
        {err ? <p className="text-sm text-red-600 mt-2">{err}</p> : null}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <List className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-bold text-gray-900">데이터 목록</h3>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-max max-w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className={recordTableThMeta}>시간</th>
                <th className={recordTableThMeta}>규격</th>
                {RECORD_WEIGHT_COLS.map(c => (
                  <th key={c.key} className={recordTableThNum}>
                    {c.label}
                  </th>
                ))}
                <th className={recordTableThMeta}>비고</th>
                <th className={`${recordTableThNum} w-0`}>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4 + RECORD_WEIGHT_COLS.length} className="py-8 text-center text-gray-400">
                    조회 후 행을 수정·삭제할 수 있습니다.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className={recordTableTdMeta}>{formatTime(r.createdAt)}</td>
                    <td
                      className={`${recordTableTdMeta} max-w-[5rem] truncate`}
                      title={r.specId || ''}
                    >
                      {r.specId || '—'}
                    </td>
                    {RECORD_WEIGHT_COLS.map(c => (
                      <td key={c.key} className={recordTableTdNum}>
                        {formatRecordWeight(r[c.key])}
                      </td>
                    ))}
                    <td
                      className={`${recordTableTdMeta} text-gray-500 max-w-[6rem] truncate`}
                      title={r.note || ''}
                    >
                      {r.note || '—'}
                    </td>
                    <td className={`${recordTableTdNum} w-0`}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="p-1 rounded-md text-indigo-600 hover:bg-indigo-50"
                          title="수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRow(r)}
                          className="p-1 rounded-md text-red-600 hover:bg-red-50"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 text-sm text-gray-600">
            <span>
              총 {total}건 · 페이지 {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void doQuery(page - 1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void doQuery(page + 1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-gray-900">기록 수정</h4>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">규격(specId)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={form.specId}
                  onChange={e => setForm(f => ({ ...f, specId: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">배치(batchId)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={form.batchId}
                  onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">비고</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['G1', 'G1'],
                    ['S2', 'S2'],
                    ['S1', 'S1'],
                    ['W', 'W'],
                    ['M3', 'M3'],
                    ['C1', 'C1'],
                    ['C2', 'C2'],
                    ['Ad1', 'Ad1'],
                    ['Ad2', 'Ad2']
                  ] as const
                ).map(([k, lab]) => (
                  <div key={k}>
                    <label className="block text-gray-600 mb-1">{lab}</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={form[k]}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void saveEdit()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {modalBusy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type TagRow = {
  _id: string
  code: string
  name?: string
  eqid: string
  deviceName?: string
  inputMode?: string
  active?: boolean
}

function TagsPanel({ api, jwt }: { api: ApiCallback; jwt: string }) {
  const [rows, setRows] = useState<TagRow[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', eqid: '', deviceName: '', inputMode: '자동' })

  const load = async () => {
    if (!jwt) return
    setErr('')
    try {
      const d = (await api('/api/tags')) as { data?: TagRow[] }
      setRows(Array.isArray(d?.data) ? d.data : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오기 실패')
    }
  }

  useEffect(() => {
    void load()
  }, [api, jwt])

  const addTag = async () => {
    if (!form.code.trim() || !form.eqid.trim()) {
      setErr('코드·장비ID 필수')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await api('/api/tags', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          eqid: form.eqid.trim(),
          deviceName: form.deviceName.trim(),
          inputMode: form.inputMode.trim() || '자동'
        })
      })
      setForm({ code: '', name: '', eqid: '', deviceName: '', inputMode: '자동' })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setBusy(false)
    }
  }

  const del = async (id: string) => {
    if (!window.confirm('삭제할까요?')) return
    try {
      await api(`/api/tags/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">태그 관리 (MongoDB)</h3>
      <p className="text-xs text-gray-500 mb-4">배치 FSM은 태그의 eqid로 datalog 무게를 매칭합니다.</p>
      {err ? <p className="text-sm text-red-600 mb-3">{err}</p> : null}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-sm">
        <input
          className="px-2 py-2 border rounded-lg"
          placeholder="코드 G1"
          value={form.code}
          onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
        />
        <input
          className="px-2 py-2 border rounded-lg"
          placeholder="태그명"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="px-2 py-2 border rounded-lg"
          placeholder="eqid"
          value={form.eqid}
          onChange={e => setForm(f => ({ ...f, eqid: e.target.value }))}
        />
        <input
          className="px-2 py-2 border rounded-lg"
          placeholder="디바이스명"
          value={form.deviceName}
          onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy || !jwt}
          onClick={() => void addTag()}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-3 px-3 text-left font-medium">코드</th>
              <th className="py-3 px-3 text-left font-medium">태그명</th>
              <th className="py-3 px-3 text-center font-medium">eqid</th>
              <th className="py-3 px-3 text-center font-medium">디바이스</th>
              <th className="py-3 px-3 text-center font-medium w-20">삭제</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-3 font-mono font-medium">{r.code}</td>
                <td className="py-3 px-3">{r.name ?? '—'}</td>
                <td className="py-3 px-3 text-center">{r.eqid}</td>
                <td className="py-3 px-3 text-center text-gray-600">{r.deviceName ?? '—'}</td>
                <td className="py-3 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => void del(r._id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type WeightAutoValue = {
  mode: 'abs' | 'percent'
  absPlus: number
  absMinus: number
  percentHalfWidth: number
  stabilityWindowSec: number
}

type EmulationValue = { enabled: boolean }

function SettingsPanel({ api, jwt }: { api: ApiCallback; jwt: string }) {
  const [wa, setWa] = useState<WeightAutoValue | null>(null)
  const [waErr, setWaErr] = useState('')
  const [waOk, setWaOk] = useState('')
  const [waBusy, setWaBusy] = useState(false)
  const [emu, setEmu] = useState<EmulationValue | null>(null)
  const [emuErr, setEmuErr] = useState('')
  const [emuOk, setEmuOk] = useState('')
  const [emuBusy, setEmuBusy] = useState(false)
  const [specListEd, setSpecListEd] = useState<SpecApi[]>([])
  const [specErr, setSpecErr] = useState('')
  const [specOk, setSpecOk] = useState('')
  const [specBusy, setSpecBusy] = useState(false)

  const SPEC_MAT_KEYS = ['G1', 'S2', 'S1', 'W', 'M3', 'C1', 'C2', 'Ad1', 'Ad2'] as const

  useEffect(() => {
    if (!jwt) return
    void (async () => {
      try {
        const d = (await api('/api/specs')) as { specs?: SpecApi[] }
        if (Array.isArray(d?.specs)) setSpecListEd(JSON.parse(JSON.stringify(d.specs)) as SpecApi[])
      } catch {
        setSpecErr('규격 목록을 불러오지 못했습니다.')
      }
    })()
  }, [api, jwt])

  const saveSpecs = async () => {
    setSpecBusy(true)
    setSpecErr('')
    setSpecOk('')
    try {
      await api('/api/specs', { method: 'PUT', body: JSON.stringify({ specs: specListEd }) })
      setSpecOk('규격이 저장되었습니다.')
    } catch (e) {
      setSpecErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSpecBusy(false)
    }
  }

  const setMat = (si: number, code: string, patch: { enabled?: boolean; targetKg?: string }) => {
    setSpecListEd(prev => {
      const copy = prev.map((s, i) => (i === si ? { ...s, materials: { ...s.materials } } : s))
      const s = copy[si]
      if (!s) return prev
      const cur = s.materials?.[code] ?? { enabled: true, targetKg: null }
      s.materials = s.materials ?? {}
      s.materials[code] = {
        enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled !== false,
        targetKg:
          patch.targetKg !== undefined
            ? patch.targetKg === ''
              ? null
              : Number(patch.targetKg)
            : cur.targetKg ?? null
      }
      return copy
    })
  }

  useEffect(() => {
    if (!jwt) return
    let cancelled = false
    void (async () => {
      try {
        const data = (await api('/api/system-config/weight-auto')) as { value?: WeightAutoValue }
        const v = data?.value
        if (!cancelled && v && typeof v === 'object') setWa(v)
      } catch {
        if (!cancelled) setWaErr('무게 자동 설정을 불러오지 못했습니다.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, jwt])

  useEffect(() => {
    if (!jwt) return
    let cancelled = false
    void (async () => {
      try {
        const data = (await api('/api/system-config/emulation')) as { value?: EmulationValue }
        const v = data?.value
        if (!cancelled && v && typeof v === 'object')
          setEmu({ enabled: v.enabled === true })
      } catch {
        if (!cancelled) setEmuErr('에뮬레이션 설정을 불러오지 못했습니다.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, jwt])

  const saveWeightAuto = async () => {
    if (!wa) return
    setWaBusy(true)
    setWaErr('')
    setWaOk('')
    try {
      const data = (await api('/api/system-config/weight-auto', {
        method: 'PUT',
        body: JSON.stringify(wa)
      })) as { value?: WeightAutoValue }
      if (data?.value) setWa(data.value)
      setWaOk('저장되었습니다.')
    } catch (e) {
      setWaErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setWaBusy(false)
    }
  }

  const saveEmulation = async () => {
    if (!emu) return
    setEmuBusy(true)
    setEmuErr('')
    setEmuOk('')
    try {
      const data = (await api('/api/system-config/emulation', {
        method: 'PUT',
        body: JSON.stringify(emu)
      })) as { value?: EmulationValue }
      if (data?.value) setEmu({ enabled: data.value.enabled === true })
      setEmuOk('저장되었습니다.')
    } catch (e) {
      setEmuErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setEmuBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">시리얼 포트 설정</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">포트 경로</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              defaultValue="/dev/ttyUSB0"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">통신 속도</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" defaultValue="9600">
              <option value="9600">9600</option>
              <option value="115200">115200</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">WebSocket 포트 (참고)</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              defaultValue="46001"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">자동 갱신 주기 (ms)</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              defaultValue="5000"
              readOnly
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            className="px-6 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-not-allowed"
            disabled
          >
            설정 저장 (로컬 참고)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">무게 자동 인식 설정</h3>
        <p className="text-xs text-gray-500 mb-4">
          허용 범위 모드·연속 안정 시간. 서버 <code className="text-xs bg-gray-100 px-1 rounded">systemConfig</code>에
          저장됩니다.
        </p>
        {!jwt ? (
          <p className="text-sm text-amber-600">로그인 후 조회·저장할 수 있습니다.</p>
        ) : !wa ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : (
          <div className="space-y-4 max-w-md">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wamode"
                  checked={wa.mode === 'abs'}
                  onChange={() => setWa(w => (w ? { ...w, mode: 'abs' } : w))}
                />
                절댓값(±kg)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wamode"
                  checked={wa.mode === 'percent'}
                  onChange={() => setWa(w => (w ? { ...w, mode: 'percent' } : w))}
                />
                백분율(±%)
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">+측 허용(kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={wa.absPlus}
                  onChange={e => setWa(w => (w ? { ...w, absPlus: Number(e.target.value) || 0 } : w))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">−측 허용(kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={wa.absMinus}
                  onChange={e => setWa(w => (w ? { ...w, absMinus: Number(e.target.value) || 0 } : w))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">백분율 반폭(%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={wa.percentHalfWidth}
                  onChange={e =>
                    setWa(w => (w ? { ...w, percentHalfWidth: Number(e.target.value) || 0 } : w))
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">연속 안정 시간(초)</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={wa.stabilityWindowSec}
                  onChange={e =>
                    setWa(w => (w ? { ...w, stabilityWindowSec: Number(e.target.value) || 0 } : w))
                  }
                />
              </div>
            </div>
            {waErr ? <p className="text-sm text-red-600">{waErr}</p> : null}
            {waOk ? <p className="text-sm text-emerald-600">{waOk}</p> : null}
            <button
              type="button"
              disabled={waBusy}
              onClick={() => void saveWeightAuto()}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {waBusy ? '저장 중…' : '무게 자동 설정 저장'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">저울 에뮬레이션 (개발/시연)</h3>
        <p className="text-xs text-gray-500 mb-4">
          ON이면 실제 datalog 없이 배치 중 현재 자재 무게를 서버가 시뮬레이션합니다. 목표 kg이 있으면 플래토는 목표와
          100kg 중 작은 쪽 근처에서 멈춘 뒤 안정 판정됩니다.
        </p>
        {!jwt ? (
          <p className="text-sm text-amber-600">로그인 후 조회·저장할 수 있습니다.</p>
        ) : !emu ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : (
          <div className="space-y-3 max-w-md">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={emu.enabled}
                onChange={e => setEmu({ enabled: e.target.checked })}
                className="rounded border-gray-300 w-4 h-4"
              />
              <span>에뮬레이션 사용</span>
            </label>
            {emuErr ? <p className="text-sm text-red-600">{emuErr}</p> : null}
            {emuOk ? <p className="text-sm text-emerald-600">{emuOk}</p> : null}
            <button
              type="button"
              disabled={emuBusy}
              onClick={() => void saveEmulation()}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {emuBusy ? '저장 중…' : '에뮬레이션 설정 저장'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">규격 · 자재 사용 / 목표(kg)</h3>
        <p className="text-xs text-gray-500 mb-4">
          `PUT /api/specs` 저장. 미사용 자재는 실시간 화면 30% 투명, 배치 FSM에서 skip.
        </p>
        {!jwt ? (
          <p className="text-sm text-amber-600">로그인 후 편집할 수 있습니다.</p>
        ) : specListEd.length === 0 ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : (
          <div className="space-y-6">
            {specListEd.map((sp, si) => (
              <div key={sp.specId} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-mono font-bold text-gray-800 mb-3">{sp.specId}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  {SPEC_MAT_KEYS.map(code => {
                    const m = sp.materials?.[code]
                    const en = m?.enabled !== false
                    const tk = m?.targetKg != null && Number.isFinite(Number(m.targetKg)) ? String(m.targetKg) : ''
                    return (
                      <div key={code} className="rounded border border-gray-100 p-2 bg-gray-50/80">
                        <label className="flex items-center gap-2 font-mono font-semibold text-gray-700 mb-1">
                          <input
                            type="checkbox"
                            checked={en}
                            onChange={e => setMat(si, code, { enabled: e.target.checked })}
                          />
                          {code}
                        </label>
                        <label className="block text-gray-500">목표 kg</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full px-2 py-1 border rounded text-[11px] mt-0.5"
                          value={tk}
                          placeholder="비우면 평탄 안정"
                          onChange={e => setMat(si, code, { targetKg: e.target.value })}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {specErr ? <p className="text-sm text-red-600">{specErr}</p> : null}
            {specOk ? <p className="text-sm text-emerald-600">{specOk}</p> : null}
            <button
              type="button"
              disabled={specBusy}
              onClick={() => void saveSpecs()}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {specBusy ? '저장 중…' : '규격 전체 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
