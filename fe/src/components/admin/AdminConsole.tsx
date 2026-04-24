'use client'

import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Gamepad2,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
  UserCog,
  Users,
  Wallet
} from 'lucide-react'

import { AdminDateTimeFilter } from './AdminDateTimeFilter'

type MenuItem = { key: string; label: string; description?: string; enabled: boolean }
type MenuGroup = { title?: string; items: MenuItem[] }
type MenuSection = { title: string; groups: MenuGroup[]; icon: LucideIcon }
type LocaleKey = 'ko' | 'en' | 'ja'
type Agent = {
  id: string
  username: string
  nickname: string
  grade?: string
  rate?: number
  balance?: number
  isActive?: boolean
  totalUsers?: number
  parentId?: string | null
  children?: Agent[]
  callbackUrl?: string
  currentApiKey?: string
}
type UserItem = {
  username: string
  nickname?: string
  balance?: number
  agentId?: string
  userId?: string | number
  createdAt?: string
  lastAccessAt?: string
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.kingofzeusfin.com'

const I18N_LABELS: Record<LocaleKey, { refresh: string; logout: string; realtime: string }> = {
  ko: { refresh: '새로고침', logout: '로그아웃', realtime: '실시간' },
  en: { refresh: 'Refresh', logout: 'Logout', realtime: 'Realtime' },
  ja: { refresh: '更新', logout: 'ログアウト', realtime: 'リアルタイム' }
}

function formatClockYyMmDdHhMmSs(dt: Date): string {
  const yy = String(dt.getFullYear()).slice(-2)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mi = String(dt.getMinutes()).padStart(2, '0')
  const ss = String(dt.getSeconds()).padStart(2, '0')
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function formatNumberWithCommas(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('en-US')
}

function parseUnknownDate(input: unknown): Date | null {
  if (input == null) return null
  if (input instanceof Date) {
    const t = input.getTime()
    return Number.isNaN(t) ? null : new Date(t)
  }
  if (typeof input === 'number') return Number.isFinite(input) ? new Date(input) : null
  if (typeof input === 'string') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof input === 'object' && input !== null) {
    const o = input as Record<string, unknown>
    if ('$date' in o) {
      const v = o.$date
      if (typeof v === 'number') return new Date(v)
      if (typeof v === 'string') {
        const d = new Date(v)
        return Number.isNaN(d.getTime()) ? null : d
      }
    }
  }
  return null
}

/** UTC/ISO 인스턴트 → KST(GMT+9) yy-MM-dd HH:mm:ss (24h) */
function formatInstantToKstYyMmDdHhMmSs(input: unknown): string {
  const d = parseUnknownDate(input)
  if (!d) return input == null || input === '' ? '—' : String(input)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
}

/** 숫자로 해석 가능하면 파싱 (천단위 콤마·문자열 숫자·bigint 등) */
function tryParseNumericValue(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v === 'boolean') return null
  const s = String(v).trim().replace(/,/g, '')
  if (s === '' || s === '-' || s === '+') return null
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 읽기 전용 필드에 숫자 표시(콤마) — 비숫자는 그대로 */
function formatReadonlyNumeric(v: unknown): string {
  const n = tryParseNumericValue(v)
  if (n !== null) return formatNumberWithCommas(n)
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

/** API/예외 영문 메시지 → 한글, 기술·DB 관련 문구는 노출하지 않음 */
function formatUserFacingMessage(raw: string): string {
  let s = (raw || '').trim()
  if (!s) return ''

  if (/mongo|mongodb|collection|objectid|rpoint|bet-histories|game-histories|swagger\.json|stack\s*trace|\.cs\b|namespace|niuniu-db|connection\s*string/i.test(s)) {
    return '요청을 처리할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.'
  }

  const rules: [RegExp, string][] = [
    [/insufficient\s+balance/i, '잔액이 부족합니다.'],
    [/insufficient\s+funds?/i, '잔액이 부족합니다.'],
    [/not\s+enough\s+(balance|money|funds?)/i, '잔액이 부족합니다.'],
    [/balance\s+is\s+too\s+low/i, '잔액이 부족합니다.'],
    [/negative\s+balance/i, '잔액이 올바르지 않습니다.'],
    [/invalid\s+(amount|balance|number)/i, '입력한 금액이 올바르지 않습니다.'],
    [/amount\s+(must|should)\s+be/i, '금액을 확인해 주세요.'],
    [/unauthorized/i, '인증이 필요합니다. 다시 로그인해 주세요.'],
    [/forbidden/i, '권한이 없습니다.'],
    [/not\s+found/i, '요청한 정보를 찾을 수 없습니다.'],
    [/bad\s+request/i, '요청 형식이 올바르지 않습니다.'],
    [/internal\s+server\s+error/i, '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'],
    [/service\s+unavailable/i, '서비스를 일시적으로 사용할 수 없습니다.'],
    [/timeout|timed\s+out/i, '요청 시간이 초과되었습니다.'],
    [/network\s*error/i, '네트워크 오류가 발생했습니다.'],
    [/already\s+exists/i, '이미 존재하는 항목입니다.'],
    [/duplicate/i, '중복된 값입니다.'],
    [/validation\s+failed/i, '입력값을 확인해 주세요.'],
    [/invalid\s+(token|credentials|password)/i, '인증 정보가 올바르지 않습니다.'],
    [/expired/i, '만료되었습니다. 다시 시도해 주세요.']
  ]
  for (const [re, ko] of rules) {
    if (re.test(s)) return ko
  }

  if (/^HTTP\s*\d+/i.test(s)) {
    const m = s.match(/\d{3}/)
    return m ? `요청 처리 중 오류가 발생했습니다. (${m[0]})` : '요청 처리 중 오류가 발생했습니다.'
  }

  return s
}

function formatKstDateTimeLabel(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return String(input)

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '00'
  const yy = get('year')
  const mm = get('month')
  const dd = get('day')
  const hh = get('hour')
  const mi = get('minute')
  const ss = get('second')
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function nowLocalDateTimeInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(-2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function daysAgoLocalDateTimeInput(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(-2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 당일 00:00:00 (로컬) — 베팅/이력 조회 기본 시작 시각 */
function startOfTodayLocalDateTimeInput(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(-2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(0)}:${pad(0)}:${pad(0)}`
}

/** 로컬 달력일의 끝 (23:59:59.999) — 종료일시 조회 상한 */
function endOfLocalCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** 당일 23:59:59 (로컬) — 종료일시 기본값 (오늘 밤까지 조회) */
function endOfTodayLocalDateTimeInput(): string {
  const d = endOfLocalCalendarDay(new Date())
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(-2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(23)}:${pad(59)}:${pad(59)}`
}

function parseDateTimeFilterInput(v: string): Date | null {
  const s = (v || '').trim()
  if (!s) return null
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (m) {
    const [, yy, mo, dd, hh, mi, ss] = m
    return new Date(Number(`20${yy}`), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss), 0)
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (m) {
    const [, yyyy, mo, dd, hh, mi, ss] = m
    return new Date(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss), 0)
  }
  return null
}

function isLikelyDateTimeString(v: string): boolean {
  if (!v) return false
  if (/^\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return true
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(v)) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true
  return false
}

function allMenuItems(): MenuItem[] {
  return MENU_SECTIONS.flatMap(s => s.groups.flatMap(g => g.items))
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: '에이전트',
    icon: UserCog,
    groups: [
      {
        items: [{ key: 'agents-list', label: '에이전트 목록', description: '에이전트 트리·상세', enabled: true }]
      }
    ]
  },
  {
    title: '유저 관리',
    icon: Users,
    groups: [
      {
        items: [
          { key: 'users-list', label: '유저 목록', description: '소속 유저 목록', enabled: true },
          { key: 'users-activity', label: '활동 로그', description: '접속·활동 기록', enabled: true },
          { key: 'users-ban', label: '차단/해제 관리', description: '차단 계정 관리', enabled: true }
        ]
      }
    ]
  },
  {
    title: '머니 관리',
    icon: Wallet,
    groups: [{ items: [{ key: 'manage-users-point-moves', label: '머니 이력', description: '지급·회수 내역', enabled: true }] }]
  },
  {
    title: '배팅 관리',
    icon: BarChart3,
    groups: [
      {
        items: [
          { key: 'manage-history-sessions', label: '게임이력', description: 'gameHistory 라운드별 요약', enabled: true },
          { key: 'game-user-betting', label: '유저 베팅 이력', description: '과거 유저 베팅 조회', enabled: true }
        ]
      }
    ]
  },
  {
    title: 'API 관리',
    icon: Code2,
    groups: [
      {
        items: [
          { key: 'manage-history-abnormal', label: 'API 오류 이력', description: '이상·실패 거래 조회', enabled: true },
          { key: 'manage-logs-transfer-api', label: 'Transfer 이력', description: 'transferApiLogs 연동 기록', enabled: true },
          { key: 'manage-logs-callback-errors', label: 'Seamless 이력', description: '콜백·연동 기록', enabled: true }
        ]
      }
    ]
  },
  {
    title: '설정',
    icon: Settings,
    groups: [{ items: [{ key: 'rooms-manage', label: '게임 설정', description: '테이블·스트림 설정', enabled: true }] }]
  },
  {
    title: '고객센터',
    icon: Gamepad2,
    groups: [{ items: [{ key: 'support-desk', label: '문의 관리', description: '티켓·문의 처리', enabled: true }] }]
  },
  {
    title: '시스템',
    icon: SlidersHorizontal,
    groups: [
      {
        items: [
          { key: 'system-config', label: '시스템 설정', description: '환경·운영 값', enabled: true },
          { key: 'api-reference', label: 'API 문서', description: '스펙·연동 참고', enabled: true }
        ]
      }
    ]
  }
]

const MENU_KEY_ALIASES: Record<string, string> = {
  'manage-users-agents': 'agents-list',
  'manage-users-players': 'users-list',
  'manage-history-betting': 'manage-history-sessions',
  'game-room-betting': 'manage-history-sessions',
  'manage-ops-games': 'rooms-manage',
  'manage-ops-providers': 'rooms-manage',
  'manage-profit-agent': 'manage-users-point-moves',
  'manage-profit-sub-agent': 'manage-users-point-moves',
  'manage-profit-provider': 'manage-users-point-moves',
  'manage-profit-point-flow': 'manage-users-point-moves',
  'manage-profit-user': 'manage-users-point-moves',
  'manage-profit-period': 'manage-users-point-moves',
  'manage-logs-db-merge': 'users-activity',
  'manage-logs-activity': 'users-activity',
  'manage-logs-transfer-api': 'manage-logs-transfer-api',
  'manage-logs-callback-errors': 'manage-logs-callback-errors',
  'manage-config-game-env': 'system-config',
  'manage-config-provider-env': 'system-config',
  'manage-config-bet-limit': 'system-config',
  'manage-config-win-limit': 'system-config',
  'reports-realtime-daily-players': 'users-activity',
  'reports-realtime-daily-agents': 'users-activity',
  'reports-realtime-daily-providers': 'users-activity',
  'reports-realtime-monthly-players': 'users-activity',
  'reports-realtime-monthly-agents': 'users-activity',
  'reports-realtime-monthly-providers': 'users-activity',
  'support-desk': 'support-desk',
  'support-ticket-create': 'users-list',
  'support-faq': 'api-reference',
  'support-api-guide': 'api-reference',
  'support-seamless-test': 'api-reference',
  'home-dashboard': 'agents-list',
  'home-my-funds': 'manage-users-point-moves',
  'system-agents-list': 'agents-list',
  'agent-money-history': 'manage-users-point-moves'
}

const ADMIN_DATA_MENUS = [
  'users-activity',
  'users-ban',
  'game-user-betting',
  'rooms-manage',
  'manage-users-funds',
  'manage-users-live',
  'manage-history-transactions',
  'manage-history-abnormal',
  'manage-history-sessions',
  'manage-logs-transfer-api',
  'manage-logs-callback-errors',
  'support-desk'
] as const

function utcDayRangeQuery(dayFrom: string, dayTo: string): string {
  let from = parseDateTimeFilterInput(dayFrom) ?? new Date(dayFrom)
  let to = parseDateTimeFilterInput(dayTo) ?? new Date(dayTo)
  if (Number.isNaN(from.getTime())) from = new Date()
  if (Number.isNaN(to.getTime())) to = new Date()
  to = endOfLocalCalendarDay(to)
  // from≥to 이면 구간이 비어 조회 0건 — 종료를 시작+1일로 보정
  if (from.getTime() >= to.getTime()) {
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  }
  return `fromUtc=${encodeURIComponent(from.toISOString())}&toUtc=${encodeURIComponent(to.toISOString())}`
}

/** 관리자 조회 테이블: 영문 필드명 → 한글 표시 (미매핑 시 원문) */
const ADMIN_FIELD_LABELS: Record<string, string> = {
  _id: '내부 ID',
  id: 'ID',
  success: '성공',
  total: '전체',
  page: '페이지',
  perPage: '페이지당',
  data: '데이터',
  username: '아이디',
  userName: '아이디',
  userId: '유저 ID',
  nickname: '닉네임',
  agentId: '에이전트',
  tableId: '테이블',
  gameId: '게임 ID',
  roundId: '라운드 ID',
  status: '상태',
  role: '역할',
  balance: '잔액',
  point: '포인트',
  currencyCode: '통화',
  country: '국가',
  createdAt: '생성일시',
  updatedAt: '수정일시',
  lastAccessAt: '마지막 접속',
  lastLogin: '마지막 로그인',
  lastUpdateTime: '최종 갱신',
  loginAt: '로그인 시각',
  loggedAt: '기록 시각',
  betTime: '베팅 시각',
  betAmount: '베팅액',
  winAmount: '당첨액',
  win: '승리',
  lose: '패배',
  players: '플레이어',
  dealer: '딜러',
  round: '라운드',
  gameType: '게임종류',
  gameMode: '모드',
  minBet: '최소 베팅',
  maxBet: '최대 베팅',
  isActive: '활성',
  streamUrl: '스트림 URL',
  roomName: '룸명',
  memo: '메모',
  grade: '등급',
  rate: '수수료율',
  email: '이메일',
  phone: '전화',
  company: '회사',
  callbackUrl: '콜백 URL',
  loginIp: '접속 IP',
  token: '토큰',
  settings: '설정',
  version: '버전',
  type: '유형',
  message: '메시지',
  errorMessage: '오류 메시지',
  ErrorMessage: '오류 메시지',
  errorType: '오류 유형',
  ErrorType: '오류 유형',
  errorCode: '오류 코드',
  ErrorCode: '오류 코드',
  endpoint: '엔드포인트',
  Endpoint: '엔드포인트',
  severity: '심각도',
  Severity: '심각도',
  error: '오류',
  errors: '오류목록',
  validationErrors: '유효성 오류',
  title: '제목',
  content: '내용',
  category: '분류',
  occurrenceTime: '발생시각',
  agentUsername: '에이전트',
  replyCount: '답변수',
  betUid: '베팅 UID',
  betSetUid: '베팅 세트 UID',
  gameKind: '게임 종류',
  gameOption: '게임 옵션',
  gameState: '게임 상태',
  resultType: '결과 유형',
  winPosition: '승자(표시)',
  winnerSeats: '승리 좌석',
  playerUserIds: '유저 ID',
  playerAgentIds: '에이전트 ID',
  totalPayout: '총 지급액',
  totalWagered: '총 베팅액',
  ghUid: '라운드 UID',
  roundNumber: '라운드 번호',
  betId: '베팅 ID',
  settleTime: '정산 시각',
  betPosition: '베팅 위치',
  betType: '베팅 유형',
  resultCode: '결과 코드',
  loseAmount: '패배액',
  totalAmount: '합계 금액',
  beforeBalance: '처리 전 잔액',
  afterBalance: '처리 후 잔액',
  transactionAmount: '거래 금액',
  resultStatus: '결과 상태',
  transactionStatus: '거래 상태',
  pnl: '손익',
  userBetting: '유저 베팅액',
  bettingTime: '베팅 시각',
  gameResult: '게임 결과',
  parentAgentId: '상위 에이전트 ID',
  subAgentId: '하위 에이전트 ID',
  secretKey: '시크릿 키',
  currentApiKey: 'API 키',
  totalUsers: '회원 수',
  totalSubAgent: '하위 에이전트 수',
  tableName: '테이블명',
  minPlayers: '최소 인원',
  isDemo: '데모',
  stream1: '스트림1',
  stream2: '스트림2',
  stream3: '스트림3',
  thumb1: '썸네일1',
  thumb2: '썸네일2',
  thumb3: '썸네일3',
  param: '파라미터',
  value: '값',
  kind: '종류',
  kindTitle: '종류 제목',
  paramComment: '설명',
  isShow: '표시 여부',
  assignee: '담당',
  priority: '우선순위',
  ticketId: '티켓 ID',
  lastModified: '최종 수정',
  createdBy: '작성자',
  updatedBy: '수정자',
  requestId: '요청 ID',
  url: 'URL',
  method: '메서드',
  body: '본문',
  responseCode: '응답 코드',
  duration: '소요(ms)',
  stack: '스택',
  path: '경로',
  host: '호스트',
  query: '쿼리',
  headers: '헤더',
  payload: '페이로드',
  response: '응답',
  callback: '콜백',
  seamless: 'Seamless',
  raw: '원문',
  meta: '메타',
  source: '출처',
  target: '대상',
  reason: '사유',
  note: '비고',
  remark: '비고',
  description: '설명',
  amount: '금액',
  currency: '통화',
  fee: '수수료',
  tax: '세금',
  refund: '환불',
  deposit: '입금',
  withdraw: '출금',
  transfer: '이체',
  orderId: '주문 ID',
  refId: '참조 ID',
  externalId: '외부 ID',
  sessionId: '세션 ID',
  clientIp: '클라이언트 IP',
  userAgent: 'User-Agent',
  device: '기기',
  platform: '플랫폼',
  channel: '채널',
  level: '레벨',
  score: '점수',
  rank: '순위',
  odds: '배당',
  multiplier: '배수',
  handicap: '핸디캡',
  side: '측',
  position: '포지션',
  seat: '좌석',
  phase: '단계',
  step: '단계',
  index: '순번',
  seq: '순번',
  sort: '정렬',
  filter: '필터',
  keyword: '키워드',
  offset: '오프셋',
  limit: '제한',
  size: '크기',
  count: '건수',
  sum: '합계',
  avg: '평균',
  min: '최소',
  max: '최대',
  open: '열림',
  close: '닫힘',
  pending: '대기',
  resolved: '해결',
  cancelled: '취소',
  failed: '실패',
  Agent: '에이전트',
  User: '유저',
  Game: '게임',
  Id: 'ID',
  TableId: '테이블 ID',
  GameId: '게임 ID',
  RoundId: '라운드 ID',
  BetAmount: '베팅액',
  WinAmount: '당첨액',
  UserId: '유저 ID',
  CreatedAt: '생성일시',
  UpdatedAt: '수정일시',
  Status: '상태',
  Result: '결과',
  Type: '유형',
  Amount: '금액',
  Balance: '잔액',
  Username: '아이디',
  Nickname: '닉네임'
}

/** camelCase/PascalCase 토큰 단위 한글 (미매핑 조합용) */
const ADMIN_FIELD_WORDS: Record<string, string> = {
  id: 'ID',
  uid: 'UID',
  bet: '베팅',
  user: '유저',
  game: '게임',
  table: '테이블',
  round: '라운드',
  amount: '금액',
  time: '시각',
  date: '일시',
  status: '상태',
  type: '유형',
  code: '코드',
  result: '결과',
  total: '합계',
  count: '건수',
  name: '이름',
  mode: '모드',
  option: '옵션',
  number: '번호',
  position: '위치',
  balance: '잔액',
  before: '이전',
  after: '이후',
  win: '당첨',
  lose: '패',
  settle: '정산',
  transaction: '거래',
  parent: '상위',
  sub: '하위',
  agent: '에이전트',
  secret: '시크릿',
  key: '키',
  api: 'API',
  stream: '스트림',
  thumb: '썸네일',
  demo: '데모',
  active: '활성',
  players: '플레이어',
  min: '최소',
  max: '최대',
  pnl: '손익',
  betting: '베팅',
  bettingtime: '베팅 시각',
  settleTime: '정산 시각',
  callback: '콜백',
  request: '요청',
  response: '응답',
  duration: '소요',
  message: '메시지',
  error: '오류',
  errors: '오류',
  validation: '유효성',
  occurrence: '발생',
  reply: '답변',
  title: '제목',
  content: '내용',
  category: '분류',
  memo: '메모',
  note: '비고',
  remark: '비고',
  description: '설명',
  param: '파라미터',
  value: '값',
  kind: '종류',
  comment: '설명',
  show: '표시',
  is: '여부',
  assignee: '담당',
  priority: '우선순위',
  ticket: '티켓',
  modified: '수정',
  created: '생성',
  updated: '수정',
  by: '자',
  client: '클라이언트',
  host: '호스트',
  query: '쿼리',
  headers: '헤더',
  body: '본문',
  method: '메서드',
  path: '경로',
  url: 'URL',
  stack: '스택',
  raw: '원문',
  meta: '메타',
  source: '출처',
  target: '대상',
  reason: '사유',
  fee: '수수료',
  tax: '세금',
  refund: '환불',
  deposit: '입금',
  withdraw: '출금',
  transfer: '이체',
  order: '주문',
  ref: '참조',
  external: '외부',
  session: '세션',
  device: '기기',
  platform: '플랫폼',
  channel: '채널',
  level: '레벨',
  score: '점수',
  rank: '순위',
  odds: '배당',
  multiplier: '배수',
  handicap: '핸디캡',
  side: '측',
  seat: '좌석',
  phase: '단계',
  step: '단계',
  index: '순번',
  seq: '순번',
  sort: '정렬',
  filter: '필터',
  keyword: '키워드',
  offset: '오프셋',
  limit: '제한',
  size: '크기',
  sum: '합계',
  avg: '평균',
  open: '열림',
  close: '닫힘',
  pending: '대기',
  resolved: '해결',
  cancelled: '취소',
  failed: '실패',
  success: '성공',
  seamless: 'Seamless',
  currency: '통화',
  country: '국가',
  email: '이메일',
  phone: '전화',
  company: '회사',
  login: '로그인',
  access: '접속',
  logged: '기록',
  last: '마지막',
  update: '갱신',
  dealer: '딜러',
  room: '룸',
  grade: '등급',
  rate: '요율',
  token: '토큰',
  settings: '설정',
  version: '버전',
  minbet: '최소 베팅',
  maxbet: '최대 베팅',
  betamount: '베팅액',
  winamount: '당첨액',
  userId: '유저 ID',
  tableId: '테이블 ID',
  gameId: '게임 ID',
  roundId: '라운드 ID'
}

function splitFieldKeyTokens(key: string): string[] {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function adminFieldLabel(key: string): string {
  if (!key) return ''
  if (ADMIN_FIELD_LABELS[key]) return ADMIN_FIELD_LABELS[key]
  const lower = key.toLowerCase()
  for (const [en, ko] of Object.entries(ADMIN_FIELD_LABELS)) {
    if (en.toLowerCase() === lower) return ko
  }
  if (/^[A-Z]/.test(key) && key.length > 1) {
    const camel = key.charAt(0).toLowerCase() + key.slice(1)
    if (ADMIN_FIELD_LABELS[camel]) return ADMIN_FIELD_LABELS[camel]
  }
  const nosnake = key.replace(/_/g, '')
  if (ADMIN_FIELD_LABELS[nosnake]) return ADMIN_FIELD_LABELS[nosnake]

  const parts = splitFieldKeyTokens(key)
  if (parts.length === 0) return key
  const mapped = parts.map(p => {
    const pl = p.toLowerCase()
    return ADMIN_FIELD_WORDS[pl] ?? (ADMIN_FIELD_LABELS[p] ? ADMIN_FIELD_LABELS[p] : null)
  })
  if (mapped.every((x): x is string => x !== null)) return mapped.join(' ')
  return parts.map(p => ADMIN_FIELD_WORDS[p.toLowerCase()] ?? p).join(' ')
}

function isMongoObjectIdString(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const s = v.trim()
  return s.length === 24 && /^[a-f0-9]+$/i.test(s)
}

/** 에이전트 문서 ObjectId → 로그인 아이디 (목록·그리드 표시용) */
function resolveAgentObjectIdToUsername(raw: unknown, idToUsername: Map<string, string>): string {
  if (raw == null || raw === '') return '—'
  const s = String(raw).trim()
  if (!isMongoObjectIdString(s)) return s
  return idToUsername.get(s) ?? '—'
}

/** 머니 이력: 에이전트 로그인명 우선 — agentId(ObjectId) 컬럼은 표시하지 않음 */
function formatMoneyHistoryAgentDisplay(row: Record<string, unknown>, idToUsername: Map<string, string>): string {
  const au = row.agentUsername ?? row.AgentUsername
  const aus = au == null ? '' : String(au).trim()
  if (aus) return aus
  return resolveAgentObjectIdToUsername(row.agentId ?? row.AgentId, idToUsername)
}

/** 목록 정렬용 키: uid → userId → 문서 id (최신 우선 = 값이 큰 쪽이 앞) */
function canonicalUidSortKey(row: Record<string, unknown>): string {
  let v: unknown =
    row.uid ?? row.Uid ?? row.UID ?? row.userId ?? row.UserId ?? row._id ?? row.id
  if (v && typeof v === 'object' && v !== null && '$oid' in (v as object)) v = (v as { $oid: string }).$oid
  return String(v ?? '')
}

function compareRowsUidDesc(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const sa = canonicalUidSortKey(a)
  const sb = canonicalUidSortKey(b)
  if (!sa && !sb) return 0
  if (!sa) return 1
  if (!sb) return -1
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    const ba = BigInt(sa)
    const bb = BigInt(sb)
    if (bb > ba) return -1
    if (bb < ba) return 1
    return 0
  }
  return sb.localeCompare(sa, undefined, { numeric: true })
}

function sortRowsByUidDesc<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort(compareRowsUidDesc) as T[]
}

/** ISO/숫자 시각 필드 중 첫 유효값(ms). API camelCase / PascalCase 모두 시도 */
function rowTimeMs(row: Record<string, unknown>, fieldNames: string[]): number {
  for (const fn of fieldNames) {
    const pascal = fn.length ? fn.charAt(0).toUpperCase() + fn.slice(1) : fn
    const v = row[fn] ?? row[pascal]
    if (v == null || v === '') continue
    if (typeof v === 'string') {
      const t = Date.parse(v)
      if (Number.isFinite(t)) return t
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

/** 최신이 위(내림차순) — Seamless 이력·베팅 이력 등 */
function sortRowsByTimeFieldDesc<T extends Record<string, unknown>>(rows: T[], fieldNames: string[]): T[] {
  return [...rows].sort((a, b) => rowTimeMs(b as Record<string, unknown>, fieldNames) - rowTimeMs(a as Record<string, unknown>, fieldNames)) as T[]
}

function mapGameHistoryRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const gr = (row.gameResult ?? row.GameResult) as Record<string, unknown> | undefined
  const players = (row.players ?? row.Players) as Record<string, unknown> | undefined

  const userIds: string[] = []
  const agentIds: string[] = []
  if (players && typeof players === 'object') {
    for (const seat of Object.keys(players)) {
      const p = players[seat] as Record<string, unknown> | undefined
      if (!p || typeof p !== 'object') continue
      const uid = p.userId ?? p.UserId
      const aid = p.agentId ?? p.AgentId
      if (uid != null && String(uid).trim() !== '') userIds.push(String(uid))
      if (aid != null && String(aid).trim() !== '') agentIds.push(String(aid))
    }
  }

  let winnerSeats = ''
  const pr = gr?.positionResults ?? gr?.PositionResults
  if (pr && typeof pr === 'object') {
    winnerSeats = Object.entries(pr as Record<string, Record<string, unknown>>)
      .filter(([, v]) => v && (v.isWin === true || v.IsWin === true))
      .map(([k]) => k)
      .join(', ')
  }
  if (!winnerSeats && gr) {
    const wp = gr.winPosition ?? gr.WinPosition
    if (wp != null && String(wp).trim() !== '') winnerSeats = String(wp)
  }

  return {
    tableId: row.tableId ?? row.TableId ?? '',
    gameKind: row.gameKind ?? row.GameKind ?? '',
    gameId: row.gameId ?? row.GameId ?? '',
    roundNumber: row.roundNumber ?? row.RoundNumber ?? '',
    gameState: row.gameState ?? row.GameState ?? '',
    resultType: gr?.resultType ?? gr?.ResultType ?? '',
    winPosition: gr?.winPosition ?? gr?.WinPosition ?? '',
    winnerSeats,
    playerUserIds: userIds.length ? userIds.join(', ') : '—',
    playerAgentIds: agentIds.length ? Array.from(new Set(agentIds)).join(', ') : '—',
    totalWagered: row.totalWagered ?? row.TotalWagered ?? '',
    totalPayout: row.totalPayout ?? row.TotalPayout ?? '',
    updatedAt: row.updatedAt ?? row.UpdatedAt ?? '',
    ghUid: row.ghUid ?? row.GhUid ?? ''
  }
}

/** betHistory 목록 행 — 주요 필드만 (상세는 모달) */
function mapBetHistoryRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const userId = String(row.userId ?? row.UserId ?? '')
  const username = String(row.username ?? row.Username ?? '')
  const shortUser =
    username && username !== userId
      ? username.length > 18
        ? `${username.slice(0, 16)}…`
        : username
      : userId.includes('.')
        ? userId.slice(userId.lastIndexOf('.') + 1)
        : userId.length > 16
          ? `${userId.slice(0, 14)}…`
          : userId
  return {
    tableId: row.tableId ?? row.TableId ?? '',
    roundNumber: row.roundNumber ?? row.RoundNumber ?? '',
    userId,
    username,
    shortUser,
    betPosition: row.betPosition ?? row.BetPosition ?? '',
    betType: row.betType ?? row.BetType ?? '',
    status: row.status ?? row.Status ?? '',
    result: row.result ?? row.Result ?? '',
    betAmount: row.betAmount ?? row.BetAmount ?? '',
    winAmount: row.winAmount ?? row.WinAmount ?? '',
    betTime: row.betTime ?? row.BetTime ?? row.createdAt ?? row.CreatedAt ?? '',
    betUid: row.betUid ?? row.BetUid ?? ''
  }
}

function betStatusBadgeClass(status: string): string {
  const u = status.toUpperCase()
  if (u === 'CONFIRMED' || u === 'SETTLED') return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
  if (u.includes('PEND') || u.includes('WAIT')) return 'bg-amber-100 text-amber-950 ring-amber-200'
  if (u.includes('CANCEL') || u.includes('VOID')) return 'bg-slate-200 text-slate-800 ring-slate-300'
  return 'bg-slate-100 text-slate-800 ring-slate-200'
}

function betResultBadgeClass(result: string): string {
  const u = result.toUpperCase()
  if (u === 'WIN' || u.includes('WIN')) return 'bg-emerald-600 text-white'
  if (u === 'LOSE' || u.includes('LOSE')) return 'bg-rose-600 text-white'
  if (u === 'TIE' || u === 'DRAW' || u === 'PUSH') return 'bg-amber-500 text-slate-900'
  return 'bg-slate-500 text-white'
}

/** betHistory 상세 — 금액·패·betItems 시각화 */
function BetHistoryDetailPanel({ doc }: { doc: Record<string, unknown> }) {
  const tableId = String(ghPick(doc, 'tableId', 'TableId') ?? '')
  const gameId = String(ghPick(doc, 'gameId', 'GameId') ?? '')
  const betUid = String(ghPick(doc, 'betUid', 'BetUid') ?? '')
  const betSetUid = String(ghPick(doc, 'betSetUid', 'BetSetUid') ?? '')
  const userId = String(ghPick(doc, 'userId', 'UserId') ?? '')
  const username = String(ghPick(doc, 'username', 'Username') ?? '')
  const gameKind = String(ghPick(doc, 'gameKind', 'GameKind') ?? '')
  const gameMode = String(ghPick(doc, 'gameMode', 'GameMode') ?? '')
  const gameOption = String(ghPick(doc, 'gameOption', 'GameOption') ?? '')
  const roundRaw = ghPick(doc, 'roundNumber', 'RoundNumber')
  const roundLabel = (() => {
    const s = ghUnwrapScalar(roundRaw)
    if (s === '—') return '—'
    const n = Number(String(s).replace(/,/g, ''))
    return Number.isFinite(n) ? n.toLocaleString('en-US') : s
  })()
  const status = String(ghPick(doc, 'status', 'Status') ?? '')
  const result = String(ghPick(doc, 'result', 'Result') ?? '')
  const resultCode = String(ghPick(doc, 'resultCode', 'ResultCode') ?? '')
  const betPosition = String(ghPick(doc, 'betPosition', 'BetPosition') ?? '')
  const betType = String(ghPick(doc, 'betType', 'BetType') ?? '')
  const handRanking = String(ghPick(doc, 'handRanking', 'HandRanking') ?? '')
  const handRankingVS = String(ghPick(doc, 'handRankingVS', 'HandRankingVS') ?? '')
  const multiplier = String(ghPick(doc, 'multiplier', 'Multiplier') ?? '')
  const betTime = ghPick(doc, 'betTime', 'BetTime')
  const settleTime = ghPick(doc, 'settleTime', 'SettleTime')
  const createdAt = ghPick(doc, 'createdAt', 'CreatedAt')
  const rawId = ghPick(doc, '_id', 'id')

  const playerCardsRaw = ghPick(doc, 'playerCards', 'PlayerCards')
  const dealerCardsRaw = ghPick(doc, 'dealerCards', 'DealerCards')
  const optionCardsRaw = ghPick(doc, 'optionCards', 'OptionCards')
  const betItemsRaw = ghPick(doc, 'betItems', 'BetItems')
  const playerCards = Array.isArray(playerCardsRaw) ? (playerCardsRaw as unknown[]) : []
  const dealerCards = Array.isArray(dealerCardsRaw) ? (dealerCardsRaw as unknown[]) : []
  const optionCards = Array.isArray(optionCardsRaw) ? (optionCardsRaw as unknown[]) : []
  const betItems = Array.isArray(betItemsRaw) ? (betItemsRaw as unknown[]) : []

  const copy = (text: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className='max-h-[70vh] space-y-4 overflow-y-auto text-start'>
      <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
        {tableId ? (
          <span className='rounded-lg bg-indigo-600 px-2.5 py-1 text-sm font-bold text-white shadow-sm'>{tableId}</span>
        ) : null}
        <span className='rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-sm font-semibold text-white'>R{roundLabel}</span>
        {gameMode ? (
          <span className='rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900'>{gameMode}</span>
        ) : null}
        {gameKind ? (
          <span className='rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-900'>{gameKind}</span>
        ) : null}
        {betPosition ? (
          <span className='rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 ring-1 ring-amber-200'>{betPosition}</span>
        ) : null}
        {betType ? (
          <span className='rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white'>{betType}</span>
        ) : null}
        {status ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${betStatusBadgeClass(status)}`}
          >
            {status}
          </span>
        ) : null}
        {result ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${betResultBadgeClass(result)}`}>{result}</span>
        ) : null}
      </div>

      <div className='grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2'>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>유저</span>
          <code className='break-all rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900 ring-1 ring-slate-100'>{userId || '—'}</code>
          {username && username !== userId ? (
            <span className='text-xs text-slate-600'>({username})</span>
          ) : null}
        </div>
        <div className='flex flex-wrap items-baseline gap-2'>
          <span className='text-xs font-medium text-slate-500'>베팅 시각 (KST)</span>
          <span className='font-mono text-sm text-slate-900'>{formatInstantToKstYyMmDdHhMmSs(betTime)}</span>
        </div>
        <div className='flex flex-wrap items-baseline gap-2'>
          <span className='text-xs font-medium text-slate-500'>정산 시각 (KST)</span>
          <span className='font-mono text-sm text-slate-900'>{formatInstantToKstYyMmDdHhMmSs(settleTime)}</span>
        </div>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>생성 (KST)</span>
          <span className='font-mono text-sm text-slate-900'>{formatInstantToKstYyMmDdHhMmSs(createdAt)}</span>
        </div>
      </div>

      <div className='rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
        <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600'>금액 · 배당</div>
        <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {[
            ['배팅액', ghPick(doc, 'betAmount', 'BetAmount')],
            ['예치(deposit)', ghPick(doc, 'deposit', 'Deposit')],
            ['배당(dividend)', ghPick(doc, 'dividend', 'Dividend')],
            ['당첨(winAmount)', ghPick(doc, 'winAmount', 'WinAmount')],
            ['낙첨(loseAmount)', ghPick(doc, 'loseAmount', 'LoseAmount')],
            ['배수', multiplier || '—'],
            ['총 차감', ghPick(doc, 'totalDeduction', 'TotalDeduction')],
            ['정산 전', ghPick(doc, 'beforeBalance', 'BeforeBalance')],
            ['정산 후', ghPick(doc, 'afterBalance', 'AfterBalance')],
            ['옵션비', ghPick(doc, 'optionFee', 'OptionFee')],
            ['카지노비', ghPick(doc, 'casinoFee', 'CasinoFee')]
          ].map(([label, val]) => (
            <div key={String(label)} className='rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5'>
              <div className='text-[10px] font-medium text-slate-500'>{String(label)}</div>
              <div className='font-mono text-sm tabular-nums text-slate-900'>{ghUnwrapScalar(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {(handRanking || handRankingVS || resultCode) && (
        <div className='rounded-lg border border-emerald-100 bg-emerald-50/50 p-3'>
          <div className='mb-1 text-xs font-semibold text-emerald-900'>족보</div>
          <div className='flex flex-wrap gap-2 text-sm'>
            {handRanking ? (
              <span className='rounded-md bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900 ring-1 ring-emerald-200'>
                플 {handRanking}
              </span>
            ) : null}
            {handRankingVS ? (
              <span className='rounded-md bg-white px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200'>vs {handRankingVS}</span>
            ) : null}
            {resultCode && resultCode !== result ? (
              <span className='text-xs text-slate-600'>code: {resultCode}</span>
            ) : null}
          </div>
        </div>
      )}

      {betItems.length > 0 ? (
        <div>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600'>betItems</div>
          <div className='space-y-2'>
            {betItems.map((it, idx) => {
              const o = ghPickRecord(it)
              if (!o) return null
              return (
                <div key={idx} className='flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs'>
                  <span className='font-semibold text-slate-900'>{String(o.position ?? o.Position ?? '')}</span>
                  <span className='rounded bg-slate-100 px-1.5 py-0.5 font-mono'>{String(o.betType ?? o.BetType ?? '')}</span>
                  <span className='tabular-nums text-slate-800'>{ghUnwrapScalar(o.amount ?? o.Amount)}</span>
                  <span className='text-slate-500'>×{ghUnwrapScalar(o.multiplier ?? o.Multiplier)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {playerCards.length > 0 ? (
        <div>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600'>플레이어 카드</div>
          <div className='flex flex-wrap gap-1'>
            {playerCards.map((c, idx) => {
              const card = ghPickRecord(c)
              const code = String(card ? ghPick(card, 'code', 'Code') ?? '' : '')
              return <GhCardChip key={idx} code={code} />
            })}
          </div>
        </div>
      ) : null}

      {dealerCards.length > 0 ? (
        <div>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600'>딜러 카드</div>
          <div className='flex flex-wrap gap-1'>
            {dealerCards.map((c, idx) => {
              const card = ghPickRecord(c)
              const code = String(card ? ghPick(card, 'code', 'Code') ?? '' : '')
              return <GhCardChip key={idx} code={code} />
            })}
          </div>
        </div>
      ) : null}

      {optionCards.length > 0 ? (
        <div className='rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs'>
          <div className='mb-1 font-semibold text-slate-600'>옵션 카드</div>
          <div className='flex flex-wrap gap-1'>
            {optionCards.map((c, idx) => {
              const card = ghPickRecord(c)
              const code = String(card ? ghPick(card, 'code', 'Code') ?? '' : '')
              return <GhCardChip key={idx} code={code} />
            })}
          </div>
        </div>
      ) : null}

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>식별자 · 게임</summary>
        <div className='mt-3 space-y-2 text-xs'>
          <div className='flex flex-wrap items-start gap-2'>
            <span className='min-w-[5rem] shrink-0 text-slate-500'>gameId</span>
            <code className='break-all rounded bg-white px-2 py-1 font-mono text-[11px] ring-1 ring-slate-100'>{gameId || '—'}</code>
            {gameId ? (
              <button
                type='button'
                className='inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]'
                onClick={() => copy(gameId)}
              >
                <Copy className='h-3 w-3' /> 복사
              </button>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            <span className='min-w-[5rem] text-slate-500'>betUid</span>
            <span className='break-all font-mono text-[11px]'>{betUid || '—'}</span>
          </div>
          <div className='flex flex-wrap gap-2'>
            <span className='min-w-[5rem] text-slate-500'>betSetUid</span>
            <span className='break-all font-mono text-[11px]'>{betSetUid || '—'}</span>
          </div>
          <div className='flex flex-wrap gap-2'>
            <span className='min-w-[5rem] text-slate-500'>_id</span>
            <span className='break-all font-mono text-[11px]'>{ghStringifyId(rawId)}</span>
          </div>
          {gameOption ? (
            <div className='flex flex-wrap gap-2'>
              <span className='min-w-[5rem] text-slate-500'>gameOption</span>
              <span className='font-mono text-[11px]'>{gameOption}</span>
            </div>
          ) : null}
        </div>
      </details>

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>원본 JSON</summary>
        <pre className='mt-2 max-h-[240px] overflow-auto rounded bg-white p-2 text-[10px] leading-relaxed text-slate-800 ring-1 ring-slate-100'>
          {JSON.stringify(doc, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function safeJsonParseLoose(str: unknown): unknown | null {
  if (typeof str !== 'string' || !str.trim()) return null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/** SeamlessCallbackLog / seamlessCallbackHistory 목록 행 */
function mapSeamlessCallbackRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const reqBody = row.requestBody ?? row.RequestBody
  let amountSummary = ''
  let txnType = ''
  let gameHint = ''
  const parsed = safeJsonParseLoose(reqBody) as Record<string, unknown> | null
  if (parsed) {
    if (parsed.amount != null) amountSummary = String(parsed.amount)
    const tx = parsed.transaction as Record<string, unknown> | undefined
    if (tx?.type) txnType = String(tx.type)
    const details = tx?.details as Record<string, unknown> | undefined
    const game = details?.game as Record<string, unknown> | undefined
    if (game) {
      const r = game.round ?? game.Round
      const gid = game.id ?? game.Id
      if (r != null) gameHint = `R${String(r)}`
      else if (gid != null) gameHint = String(gid).length > 20 ? `${String(gid).slice(0, 18)}…` : String(gid)
    }
  }
  const finalUrl = String(row.finalUrl ?? row.FinalUrl ?? row.url ?? row.Url ?? '')
  let urlShort = finalUrl
  try {
    if (finalUrl) {
      const u = new URL(finalUrl)
      const path = u.pathname.length > 20 ? `${u.pathname.slice(0, 18)}…` : u.pathname
      urlShort = `${u.host}${path}`
    }
  } catch {
    urlShort = finalUrl.length > 36 ? `${finalUrl.slice(0, 34)}…` : finalUrl
  }
  const userId = String(row.userId ?? row.UserId ?? '')
  const shortUser =
    userId.includes('.') && userId.length > 1
      ? userId.slice(userId.lastIndexOf('.') + 1)
      : userId.length > 14
        ? `${userId.slice(0, 12)}…`
        : userId
  const rs = row.responseStatus ?? row.ResponseStatus
  const n = typeof rs === 'number' ? rs : Number(rs)
  const responseStatus = Number.isFinite(n) ? n : 0
  const latencyRaw = row.latencyMs ?? row.LatencyMs
  const latencyMs =
    typeof latencyRaw === 'object' && latencyRaw !== null && '$numberLong' in (latencyRaw as Record<string, unknown>)
      ? String((latencyRaw as { $numberLong: string }).$numberLong)
      : String(latencyRaw ?? '')
  return {
    txId: String(row.txId ?? row.TxId ?? ''),
    agentId: String(row.agentId ?? row.AgentId ?? ''),
    userId,
    shortUser,
    username: String(row.username ?? row.Username ?? ''),
    status: String(row.status ?? row.Status ?? ''),
    responseStatus,
    latencyMs,
    attempt: row.attempt ?? row.Attempt ?? '',
    amountSummary,
    txnType,
    gameHint,
    finalUrl,
    urlShort,
    createdAt: row.createdAt ?? row.CreatedAt ?? ''
  }
}

function seamlessHttpBadgeClass(code: number): string {
  if (code >= 200 && code < 300) return 'bg-emerald-600 text-white'
  if (code >= 400 && code < 500) return 'bg-amber-500 text-slate-900'
  if (code >= 500) return 'bg-rose-600 text-white'
  return 'bg-slate-500 text-white'
}

function seamlessCallbackStatusBadgeClass(status: string): string {
  const u = status.toUpperCase()
  if (u === 'SUCCESS') return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
  if (u === 'FAIL' || u.includes('FAIL')) return 'bg-rose-100 text-rose-900 ring-rose-200'
  return 'bg-slate-100 text-slate-800 ring-slate-200'
}

/** Seamless 콜백 로그 상세 — 요청/응답 JSON 시각화 */
function SeamlessCallbackDetailPanel({ doc }: { doc: Record<string, unknown> }) {
  const txId = String(ghPick(doc, 'txId', 'TxId') ?? '')
  const agentId = String(ghPick(doc, 'agentId', 'AgentId') ?? '')
  const userId = String(ghPick(doc, 'userId', 'UserId') ?? '')
  const username = String(ghPick(doc, 'username', 'Username') ?? '')
  const finalUrl = String(ghPick(doc, 'finalUrl', 'FinalUrl') ?? '')
  const status = String(ghPick(doc, 'status', 'Status') ?? '')
  const rs = ghPick(doc, 'responseStatus', 'ResponseStatus')
  const responseStatus = typeof rs === 'number' ? rs : Number(rs)
  const code = Number.isFinite(responseStatus) ? responseStatus : 0
  const latencyMs = ghUnwrapScalar(ghPick(doc, 'latencyMs', 'LatencyMs'))
  const attempt = ghUnwrapScalar(ghPick(doc, 'attempt', 'Attempt'))
  const createdAt = ghPick(doc, 'createdAt', 'CreatedAt')
  const rawId = ghPick(doc, '_id', 'id')

  const reqStr = String(ghPick(doc, 'requestBody', 'RequestBody') ?? '')
  const resStr = String(ghPick(doc, 'responseBody', 'ResponseBody') ?? '')
  const reqParsed = safeJsonParseLoose(reqStr)
  const resParsed = safeJsonParseLoose(resStr)

  const copy = (text: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  const fmt = (v: unknown) =>
    v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2)

  return (
    <div className='max-h-[70vh] space-y-4 overflow-y-auto text-start'>
      <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
        {agentId ? (
          <span className='rounded-lg bg-violet-700 px-2.5 py-1 text-xs font-bold text-white shadow-sm'>{agentId}</span>
        ) : null}
        {status ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${seamlessCallbackStatusBadgeClass(status)}`}
          >
            {status}
          </span>
        ) : null}
        {code > 0 ? (
          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${seamlessHttpBadgeClass(code)}`}>
            HTTP {code}
          </span>
        ) : null}
        <span className='text-xs text-slate-500'>
          {latencyMs !== '—' ? `${latencyMs} ms` : ''}
          {attempt !== '—' ? ` · 시도 ${attempt}` : ''}
        </span>
      </div>

      <div className='grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2'>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>유저</span>
          <code className='break-all rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900 ring-1 ring-slate-100'>
            {userId || '—'}
          </code>
          {username ? <span className='text-xs text-slate-600'>({username})</span> : null}
        </div>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>시각 (KST)</span>
          <span className='font-mono text-sm'>{formatInstantToKstYyMmDdHhMmSs(createdAt)}</span>
        </div>
        <div className='flex flex-wrap items-start gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500 shrink-0'>URL</span>
          <div className='min-w-0 flex-1'>
            <code className='break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800 ring-1 ring-slate-100'>
              {finalUrl || '—'}
            </code>
            {finalUrl ? (
              <button
                type='button'
                className='ms-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]'
                onClick={() => copy(finalUrl)}
              >
                <Copy className='h-3 w-3' /> 복사
              </button>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>txId</span>
          <span className='break-all font-mono text-[11px]'>{txId || '—'}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>_id</span>
          <span className='break-all font-mono text-[11px]'>{ghStringifyId(rawId)}</span>
        </div>
      </div>

      <div className='grid gap-3 lg:grid-cols-2'>
        <div className='rounded-xl border border-sky-100 bg-sky-50/40 p-3'>
          <div className='mb-2 text-xs font-semibold text-sky-900'>요청 body (JSON)</div>
          <pre className='max-h-[280px] overflow-auto rounded-lg bg-white p-2 text-[10px] leading-relaxed text-slate-800 ring-1 ring-sky-100'>
            {reqParsed != null ? fmt(reqParsed) : reqStr || '—'}
          </pre>
        </div>
        <div className='rounded-xl border border-emerald-100 bg-emerald-50/40 p-3'>
          <div className='mb-2 text-xs font-semibold text-emerald-900'>응답 body (JSON)</div>
          <pre className='max-h-[280px] overflow-auto rounded-lg bg-white p-2 text-[10px] leading-relaxed text-slate-800 ring-1 ring-emerald-100'>
            {resParsed != null ? fmt(resParsed) : resStr || '—'}
          </pre>
        </div>
      </div>

      {reqParsed && typeof reqParsed === 'object' && !Array.isArray(reqParsed) ? (
        <div className='rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs'>
          <div className='mb-2 font-semibold text-indigo-900'>요약 (파싱)</div>
          <div className='grid gap-2 sm:grid-cols-2'>
            {(() => {
              const p = reqParsed as Record<string, unknown>
              const tx = p.transaction as Record<string, unknown> | undefined
              const details = tx?.details as Record<string, unknown> | undefined
              const game = details?.game as Record<string, unknown> | undefined
              const target = tx?.target as Record<string, unknown> | undefined
              const rows: [string, string][] = []
              if (p.amount != null) rows.push(['amount', String(p.amount)])
              if (tx?.type) rows.push(['transaction.type', String(tx.type)])
              if (tx?.txnUid) rows.push(['txnUid', String(tx.txnUid)])
              if (tx?.betSetUid) rows.push(['betSetUid', String(tx.betSetUid)])
              if (game?.id) rows.push(['game.id', String(game.id)])
              if (game?.round != null) rows.push(['game.round', String(game.round)])
              if (target?.balance != null) rows.push(['target.balance', String(target.balance)])
              return rows.map(([k, v]) => (
                <div key={k} className='flex flex-wrap gap-2'>
                  <span className='min-w-[7rem] text-slate-500'>{k}</span>
                  <span className='break-all font-mono text-slate-900'>{v}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      ) : null}

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>원본 문서 JSON</summary>
        <pre className='mt-2 max-h-[200px] overflow-auto rounded bg-white p-2 text-[10px] text-slate-800 ring-1 ring-slate-100'>
          {JSON.stringify(doc, null, 2)}
        </pre>
      </details>
    </div>
  )
}

/** transferApiLogs 목록 행 */
type TransferApiLogRowFlat = {
  agentUsername: string
  agentId: string
  category: string
  method: string
  statusCode: number
  durationMs: string
  success: boolean
  endpoint: string
  epShort: string
  apiKey: string
  clientIp: string
  userAgent: string
  errorMessage: string
  errorDetails: unknown
  requestTime: unknown
  responseTime: unknown
  createdAt: unknown
}

function mapTransferApiLogRowToFlat(row: Record<string, unknown>): TransferApiLogRowFlat {
  const ep = String(row.endpoint ?? row.Endpoint ?? '')
  const epShort = ep.length > 56 ? `${ep.slice(0, 54)}…` : ep
  const sc = row.statusCode ?? row.StatusCode
  const n = typeof sc === 'number' ? sc : Number(sc)
  const statusCode = Number.isFinite(n) ? n : 0
  const dur = row.duration ?? row.Duration
  const durationMs =
    typeof dur === 'object' && dur !== null && '$numberLong' in (dur as Record<string, unknown>)
      ? String((dur as { $numberLong: string }).$numberLong)
      : String(dur ?? '')
  const ok = row.success ?? row.Success
  const success = typeof ok === 'boolean' ? ok : ok === 'true' || ok === 1
  return {
    agentUsername: String(row.agentUsername ?? row.AgentUsername ?? ''),
    agentId: String(row.agentId ?? row.AgentId ?? ''),
    category: String(row.category ?? row.Category ?? ''),
    method: String(row.method ?? row.Method ?? '').toUpperCase() || '—',
    statusCode,
    durationMs,
    success,
    endpoint: ep,
    epShort,
    apiKey: String(row.apiKey ?? row.ApiKey ?? ''),
    clientIp: String(row.clientIp ?? row.ClientIp ?? ''),
    userAgent: String(row.userAgent ?? row.UserAgent ?? ''),
    errorMessage: String(row.errorMessage ?? row.ErrorMessage ?? ''),
    errorDetails: row.errorDetails ?? row.ErrorDetails ?? '',
    requestTime: row.requestTime ?? row.RequestTime ?? '',
    responseTime: row.responseTime ?? row.ResponseTime ?? '',
    createdAt: row.createdAt ?? row.CreatedAt ?? ''
  }
}

function TransferApiLogDetailPanel({ doc }: { doc: Record<string, unknown> }) {
  const f = mapTransferApiLogRowToFlat(doc)
  const rawId = ghPick(doc, '_id', 'id')
  const copy = (text: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => {})
  }
  const errRaw = f.errorDetails
  const errStr =
    errRaw == null || errRaw === ''
      ? ''
      : typeof errRaw === 'string'
        ? errRaw
        : JSON.stringify(errRaw)
  const errParsed = safeJsonParseLoose(errStr)
  const fmt = (v: unknown) =>
    v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2)

  return (
    <div className='max-h-[70vh] space-y-4 overflow-y-auto text-start'>
      <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
        {f.category ? (
          <span className='rounded-lg bg-indigo-700 px-2.5 py-1 text-xs font-bold text-white shadow-sm'>{f.category}</span>
        ) : null}
        <span className='rounded-md bg-slate-200 px-2 py-0.5 font-mono text-xs font-bold text-slate-900'>{f.method}</span>
        {f.statusCode > 0 ? (
          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${seamlessHttpBadgeClass(f.statusCode)}`}>
            HTTP {f.statusCode}
          </span>
        ) : null}
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${f.success ? 'bg-emerald-100 text-emerald-900 ring-emerald-200' : 'bg-rose-100 text-rose-900 ring-rose-200'}`}
        >
          {f.success ? '성공' : '실패'}
        </span>
        <span className='text-xs text-slate-500'>{f.durationMs ? `${f.durationMs} ms` : ''}</span>
      </div>

      <div className='grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2'>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>에이전트</span>
          <code className='break-all rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-900 ring-1 ring-slate-100'>
            {f.agentUsername || f.agentId || '—'}
          </code>
        </div>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500 shrink-0'>엔드포인트</span>
          <div className='min-w-0 flex-1'>
            <code className='break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800 ring-1 ring-slate-100'>
              {f.endpoint || '—'}
            </code>
            {f.endpoint ? (
              <button
                type='button'
                className='ms-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]'
                onClick={() => copy(f.endpoint)}
              >
                <Copy className='h-3 w-3' /> 복사
              </button>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>요청 시각 (KST)</span>
          <span className='font-mono text-[11px]'>{formatInstantToKstYyMmDdHhMmSs(f.requestTime)}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>응답 시각 (KST)</span>
          <span className='font-mono text-[11px]'>{formatInstantToKstYyMmDdHhMmSs(f.responseTime)}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>clientIp</span>
          <span className='font-mono text-[11px]'>{f.clientIp || '—'}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>apiKey</span>
          <span className='break-all font-mono text-[11px]'>{f.apiKey || '—'}</span>
        </div>
        <div className='flex flex-wrap gap-2 sm:col-span-2'>
          <span className='text-xs text-slate-500'>_id</span>
          <span className='break-all font-mono text-[11px]'>{ghStringifyId(rawId)}</span>
        </div>
        {f.userAgent ? (
          <div className='flex flex-wrap gap-2 sm:col-span-2'>
            <span className='text-xs text-slate-500 shrink-0'>User-Agent</span>
            <span className='break-all text-[11px] text-slate-700'>{f.userAgent}</span>
          </div>
        ) : null}
      </div>

      {f.errorMessage ? (
        <div className='rounded-xl border border-rose-100 bg-rose-50/50 p-3'>
          <div className='mb-1 text-xs font-semibold text-rose-900'>errorMessage</div>
          <pre className='whitespace-pre-wrap break-all text-[11px] text-rose-950'>{f.errorMessage}</pre>
        </div>
      ) : null}

      {errStr ? (
        <div className='rounded-xl border border-amber-100 bg-amber-50/40 p-3'>
          <div className='mb-2 text-xs font-semibold text-amber-950'>errorDetails</div>
          <pre className='max-h-[240px] overflow-auto rounded-lg bg-white p-2 text-[10px] leading-relaxed text-slate-800 ring-1 ring-amber-100'>
            {errParsed != null ? fmt(errParsed) : errStr}
          </pre>
        </div>
      ) : null}

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>원본 문서 JSON</summary>
        <pre className='mt-2 max-h-[220px] overflow-auto rounded bg-white p-2 text-[10px] text-slate-800 ring-1 ring-slate-100'>
          {JSON.stringify(doc, null, 2)}
        </pre>
      </details>
    </div>
  )
}

/** ErrorLog / API 오류 이력 목록 행 */
function mapErrorLogRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const ep = String(row.endpoint ?? row.Endpoint ?? '')
  const epShort = ep.length > 44 ? `${ep.slice(0, 42)}…` : ep
  const msg = String(row.errorMessage ?? row.ErrorMessage ?? '')
  const msgShort = msg.length > 56 ? `${msg.slice(0, 54)}…` : msg
  const sev = String(row.severity ?? row.Severity ?? '')
  const res = row.resolved ?? row.Resolved
  const resolved = typeof res === 'boolean' ? res : res === 'true' || res === 1
  return {
    errorType: String(row.errorType ?? row.ErrorType ?? ''),
    errorCode: String(row.errorCode ?? row.ErrorCode ?? ''),
    errorMessage: msg,
    msgShort,
    endpoint: ep,
    epShort,
    method: String(row.method ?? row.Method ?? '').toUpperCase() || '—',
    clientIp: String(row.clientIp ?? row.ClientIp ?? ''),
    agentUsername: String(row.agentUsername ?? row.AgentUsername ?? ''),
    userAgent: row.userAgent ?? row.UserAgent ?? '',
    severity: sev,
    createdAt: row.createdAt ?? row.CreatedAt ?? '',
    resolved
  }
}

function errorSeverityBadgeClass(sev: string): string {
  const u = sev.toUpperCase()
  if (u === 'CRITICAL' || u === 'FATAL') return 'bg-rose-700 text-white'
  if (u === 'ERROR') return 'bg-rose-100 text-rose-900 ring-rose-200'
  if (u === 'WARN' || u === 'WARNING') return 'bg-amber-100 text-amber-950 ring-amber-200'
  if (u === 'INFO') return 'bg-sky-100 text-sky-900 ring-sky-200'
  return 'bg-slate-100 text-slate-800 ring-slate-200'
}

function ErrorLogDetailPanel({ doc }: { doc: Record<string, unknown> }) {
  const f = mapErrorLogRowToFlat(doc)
  const rawId = ghPick(doc, '_id', 'id')
  const requestDataStr = String(ghPick(doc, 'requestData', 'RequestData') ?? '')
  const additionalStr = ghPick(doc, 'additionalInfo', 'AdditionalInfo')
  const additional =
    additionalStr == null || additionalStr === ''
      ? null
      : typeof additionalStr === 'string'
        ? safeJsonParseLoose(additionalStr) ?? additionalStr
        : additionalStr
  const reqParsed = safeJsonParseLoose(requestDataStr)

  const copy = (text: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  const fmt = (v: unknown) =>
    v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2)

  const resolvedAt = ghPick(doc, 'resolvedAt', 'ResolvedAt')
  const resolvedBy = String(ghPick(doc, 'resolvedBy', 'ResolvedBy') ?? '')

  return (
    <div className='max-h-[70vh] space-y-4 overflow-y-auto text-start'>
      <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
        {f.errorType ? (
          <span className='rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-xs font-bold text-white'>{String(f.errorType)}</span>
        ) : null}
        {f.errorCode ? (
          <span className='rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800 ring-1 ring-slate-200'>
            {String(f.errorCode)}
          </span>
        ) : null}
        {f.severity ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${errorSeverityBadgeClass(String(f.severity))}`}>
            {String(f.severity)}
          </span>
        ) : null}
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${f.resolved ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
          {f.resolved ? '해결됨' : '미해결'}
        </span>
      </div>

      <div className='grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2'>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>메시지</span>
          <span className='min-w-0 flex-1 break-words text-sm text-slate-900'>{String(f.errorMessage || '—')}</span>
        </div>
        <div className='flex flex-wrap items-center gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>엔드포인트</span>
          <code className='break-all rounded bg-white px-2 py-0.5 font-mono text-[11px] text-slate-800 ring-1 ring-slate-100'>
            {String(f.method)} {String(f.endpoint || '—')}
          </code>
          {f.endpoint ? (
            <button
              type='button'
              className='inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px]'
              onClick={() => copy(String(f.endpoint))}
            >
              <Copy className='h-3 w-3' /> 복사
            </button>
          ) : null}
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>클라이언트 IP</span>
          <span className='font-mono text-xs'>{String(f.clientIp || '—')}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>에이전트</span>
          <span className='text-xs'>{String(f.agentUsername || '—')}</span>
        </div>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>User-Agent</span>
          <span className='min-w-0 flex-1 break-all text-xs text-slate-700'>
            {String(f.userAgent || ghPick(doc, 'userAgent', 'UserAgent') || '—')}
          </span>
        </div>
        <div className='flex flex-wrap gap-2 sm:col-span-2'>
          <span className='text-xs text-slate-500'>시각 (KST)</span>
          <span className='font-mono text-sm'>{formatInstantToKstYyMmDdHhMmSs(f.createdAt)}</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-xs text-slate-500'>_id</span>
          <span className='break-all font-mono text-[11px]'>{ghStringifyId(rawId)}</span>
        </div>
        {f.resolved ? (
          <>
            <div className='flex flex-wrap gap-2'>
              <span className='text-xs text-slate-500'>해결 시각</span>
              <span className='font-mono text-xs'>{formatInstantToKstYyMmDdHhMmSs(resolvedAt)}</span>
            </div>
            <div className='flex flex-wrap gap-2'>
              <span className='text-xs text-slate-500'>처리자</span>
              <span className='text-xs'>{resolvedBy || '—'}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className='rounded-xl border border-violet-100 bg-violet-50/40 p-3'>
        <div className='mb-2 text-xs font-semibold text-violet-900'>요청 데이터 (requestData)</div>
        <pre className='max-h-[320px] overflow-auto rounded-lg bg-white p-2 text-[10px] leading-relaxed text-slate-800 ring-1 ring-violet-100'>
          {reqParsed != null ? fmt(reqParsed) : requestDataStr || '—'}
        </pre>
      </div>

      {additional != null ? (
        <div className='rounded-xl border border-slate-200 bg-slate-50/80 p-3'>
          <div className='mb-2 text-xs font-semibold text-slate-800'>추가 정보</div>
          <pre className='max-h-[200px] overflow-auto rounded-lg bg-white p-2 text-[10px] text-slate-800 ring-1 ring-slate-100'>
            {typeof additional === 'string' ? additional : fmt(additional)}
          </pre>
        </div>
      ) : null}

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>원본 문서 JSON</summary>
        <pre className='mt-2 max-h-[200px] overflow-auto rounded bg-white p-2 text-[10px] text-slate-800 ring-1 ring-slate-100'>
          {JSON.stringify(doc, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function mapLoginHistoryRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const userId = String(row.userId ?? row.UserId ?? '')
  const shortUser =
    userId.includes('.') && userId.length > 1
      ? userId.slice(userId.lastIndexOf('.') + 1)
      : userId.length > 14
        ? `${userId.slice(0, 12)}…`
        : userId
  const at = row.loginAt ?? row.LoginAt ?? row.loggedAt ?? row.LoggedAt ?? row.createdAt ?? row.CreatedAt ?? ''
  return {
    userId,
    shortUser,
    username: String(row.username ?? row.Username ?? ''),
    loginIp: String(row.loginIp ?? row.LoginIp ?? row.ip ?? row.Ip ?? ''),
    userAgent: String(row.userAgent ?? row.UserAgent ?? ''),
    loginAt: at
  }
}

function mapBannedUserRowToFlat(row: Record<string, unknown>): Record<string, unknown> {
  const displayName = String(
    row.username ??
      row.Username ??
      row.userName ??
      row.UserName ??
      row.userNameAlt ??
      row.UserNameAlt ??
      ''
  )
  const bannedAt =
    row.bannedAt ??
    row.BannedAt ??
    row.updatedAt ??
    row.UpdatedAt ??
    row.createdAt ??
    row.CreatedAt ??
    ''
  return {
    userId: String(row.userId ?? row.UserId ?? ''),
    username: displayName,
    bannedAt,
    reason: String(row.banReason ?? row.BanReason ?? row.reason ?? row.Reason ?? row.memo ?? row.Memo ?? ''),
    active: row.isActive ?? row.IsActive
  }
}

/** 고객센터 티켓 목록 행 */
function mapSupportTicketRowToFlat(row: Record<string, unknown>): {
  idStr: string
  shortId: string
  title: string
  shortTitle: string
  status: string
  createdLabel: string
  author: string
} {
  const rawId = row._id ?? row.id ?? row.ticketId ?? row.TicketId
  const idStr = ghStringifyId(rawId)
  const shortId = idStr.length > 14 ? `${idStr.slice(0, 12)}…` : idStr
  const title = String(row.title ?? row.subject ?? row.name ?? '')
  const shortTitle = title.length > 52 ? `${title.slice(0, 50)}…` : title
  const status = String(row.status ?? row.state ?? row.Status ?? '')
  const created = row.createdAt ?? row.CreatedAt ?? row.lastModified ?? row.updatedAt ?? row.UpdatedAt
  const createdLabel = created ? formatKstDateTimeLabel(String(created)) : '—'
  const author = String(row.createdBy ?? row.CreatedBy ?? row.author ?? row.username ?? row.Username ?? '')
  return { idStr, shortId, title, shortTitle, status, createdLabel, author }
}

const GH_SEAT_ORDER = ['D', 'B1', 'B2', 'B3', 'B4', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']

function ghPick(obj: Record<string, unknown> | undefined | null, ...keys: string[]): unknown {
  if (!obj) return undefined
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]
  }
  return undefined
}

function ghPickRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function ghUnwrapScalar(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '예' : '아니오'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    if ('$numberInt' in o) return String(o.$numberInt)
    if ('$numberLong' in o) return String(o.$numberLong)
    if ('$oid' in o) return String(o.$oid)
    if ('$date' in o) return formatInstantToKstYyMmDdHhMmSs(v)
  }
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function ghStringifyId(id: unknown): string {
  if (id == null) return '—'
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null && '$oid' in (id as Record<string, unknown>)) {
    return String((id as { $oid: string }).$oid)
  }
  return String(id)
}

function ghSortSeatKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = GH_SEAT_ORDER.indexOf(a)
    const ib = GH_SEAT_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

function ghCardPosition(card: Record<string, unknown>): number {
  const p = ghPick(card, 'position', 'Position')
  if (p == null) return 0
  const n = typeof p === 'number' ? p : Number(ghUnwrapScalar(p).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function GhCardChip({ code }: { code: string }) {
  const c = code.trim()
  if (c.length < 2) {
    return (
      <span className='inline-flex items-center rounded-md bg-slate-600 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white'>
        {c || '—'}
      </span>
    )
  }
  const suit = c[0]
  const rank = c.slice(1)
  const suitClass =
    suit === 'S'
      ? 'bg-slate-700 text-white'
      : suit === 'H'
        ? 'bg-red-600 text-white'
        : suit === 'D'
          ? 'bg-amber-500 text-slate-900'
          : suit === 'C'
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-500 text-white'
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold shadow-sm ${suitClass}`}
      title={c}
    >
      <span className='opacity-90'>{suit}</span>
      <span>{rank}</span>
    </span>
  )
}

function ghGameStateBadgeClass(state: string): string {
  const u = state.toUpperCase()
  if (u === 'RESULT') return 'bg-emerald-600 text-white'
  if (u.includes('BET') || u.includes('WAGER')) return 'bg-amber-500 text-slate-900'
  if (u.includes('CANCEL') || u.includes('VOID') || u.includes('ABORT')) return 'bg-slate-500 text-white'
  if (u.includes('DEAL') || u.includes('PLAY')) return 'bg-sky-600 text-white'
  return 'bg-indigo-600 text-white'
}

/** gameHistory 상세 — 배지·태그·카드 칩 시각화 (KST 시간) */
function GameHistoryDetailPanel({ doc }: { doc: Record<string, unknown> }) {
  const tableId = String(ghPick(doc, 'tableId', 'TableId') ?? '')
  const gameId = String(ghPick(doc, 'gameId', 'GameId') ?? '')
  const ghUid = String(ghPick(doc, 'ghUid', 'GhUid') ?? '')
  const gameType = String(ghPick(doc, 'gameType', 'GameType') ?? '')
  const gameKind = String(ghPick(doc, 'gameKind', 'GameKind') ?? '')
  const gameMode = String(ghPick(doc, 'gameMode', 'GameMode') ?? '')
  const gameOption = String(ghPick(doc, 'gameOption', 'GameOption') ?? '')
  const roundRaw = ghPick(doc, 'roundNumber', 'RoundNumber')
  const roundLabel = (() => {
    const s = ghUnwrapScalar(roundRaw)
    if (s === '—') return '—'
    const n = Number(String(s).replace(/,/g, ''))
    return Number.isFinite(n) ? n.toLocaleString('en-US') : s
  })()
  const gameState = String(ghPick(doc, 'gameState', 'GameState') ?? '')
  const createdAt = ghPick(doc, 'createdAt', 'CreatedAt')
  const updatedAt = ghPick(doc, 'updatedAt', 'UpdatedAt')
  const totalWagered = ghPick(doc, 'totalWagered', 'TotalWagered')
  const totalPayout = ghPick(doc, 'totalPayout', 'TotalPayout')
  const isIdx = ghPick(doc, 'isIdx', 'IsIdx')
  const optionCards = ghPick(doc, 'optionCards', 'OptionCards')
  const optionProperty = ghPick(doc, 'optionProperty', 'OptionProperty')
  const rawId = ghPick(doc, '_id', 'id')

  const gr = ghPickRecord(ghPick(doc, 'gameResult', 'GameResult'))
  const resultType = gr ? String(ghPick(gr, 'resultType', 'ResultType') ?? '') : ''
  const winPosition = gr ? String(ghPick(gr, 'winPosition', 'WinPosition') ?? '') : ''
  const winHandranking = gr ? String(ghPick(gr, 'winHandranking', 'WinHandranking') ?? '') : ''
  const winHandrankingText = gr ? String(ghPick(gr, 'winHandrankingText', 'WinHandrankingText') ?? '') : ''
  const positionResults = ghPickRecord(ghPick(gr, 'positionResults', 'PositionResults'))
  const players = ghPickRecord(ghPick(doc, 'players', 'Players'))

  const winSeatTokens = winPosition
    .split(/[,/\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const copy = (text: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className='max-h-[70vh] space-y-4 overflow-y-auto text-start'>
      <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
        {tableId ? (
          <span className='rounded-lg bg-indigo-600 px-2.5 py-1 text-sm font-bold text-white shadow-sm'>{tableId}</span>
        ) : null}
        <span className='rounded-lg bg-slate-800 px-2.5 py-1 font-mono text-sm font-semibold text-white'>R{roundLabel}</span>
        {gameState ? (
          <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm ${ghGameStateBadgeClass(gameState)}`}>{gameState}</span>
        ) : null}
        {gameKind ? (
          <span className='rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-900'>{gameKind}</span>
        ) : null}
        {gameMode ? (
          <span className='rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900'>{gameMode}</span>
        ) : null}
        {gameType ? (
          <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-800'>{gameType}</span>
        ) : null}
      </div>

      <div className='grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <span className='text-xs font-medium text-slate-500'>생성 (KST)</span>
          <span className='font-mono text-sm text-slate-900'>{formatInstantToKstYyMmDdHhMmSs(createdAt)}</span>
        </div>
        <div className='flex flex-wrap items-baseline gap-2'>
          <span className='text-xs font-medium text-slate-500'>갱신 (KST)</span>
          <span className='font-mono text-sm text-slate-900'>{formatInstantToKstYyMmDdHhMmSs(updatedAt)}</span>
        </div>
        <div className='flex flex-wrap items-baseline gap-2 sm:col-span-2'>
          <span className='text-xs font-medium text-slate-500'>정산</span>
          <span className='rounded-md bg-white px-2 py-0.5 font-mono text-sm text-slate-800 shadow-sm'>
            베팅 <span className='text-rose-700'>{ghUnwrapScalar(totalWagered)}</span>
            <span className='mx-1.5 text-slate-300'>|</span>
            지급 <span className='text-emerald-700'>{ghUnwrapScalar(totalPayout)}</span>
          </span>
        </div>
      </div>

      {gr && (
        <div className='rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-3 shadow-sm'>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900'>게임 결과</div>
          <div className='mb-3 flex flex-wrap gap-2'>
            {resultType ? (
              <span className='inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white'>결과 {resultType}</span>
            ) : null}
            {winHandrankingText ? (
              <span className='rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200'>{winHandrankingText}</span>
            ) : null}
            {winHandranking && winHandranking !== winHandrankingText ? (
              <span className='rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700'>{winHandranking}</span>
            ) : null}
          </div>
          {winSeatTokens.length > 0 ? (
            <div className='mb-3 flex flex-wrap items-center gap-1.5'>
              <span className='text-xs text-slate-600'>승자 좌석</span>
              {winSeatTokens.map(t => (
                <span key={t} className='rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 ring-1 ring-amber-200'>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {positionResults && Object.keys(positionResults).length > 0 ? (
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {ghSortSeatKeys(Object.keys(positionResults)).map(pos => {
                const pr = ghPickRecord(positionResults[pos])
                const win = !!(pr && (pr.isWin === true || pr.IsWin === true))
                const hr = String(pr?.handRanking ?? pr?.HandRanking ?? '')
                return (
                  <div
                    key={pos}
                    className={`rounded-lg border p-2 ${win ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-100 bg-white/90'}`}
                  >
                    <div className='mb-1 flex items-center justify-between gap-2'>
                      <span className='font-semibold text-slate-900'>{pos}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${win ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                      >
                        {win ? '승' : '패'}
                      </span>
                    </div>
                    <div className='truncate font-mono text-[11px] text-slate-600' title={hr}>
                      {hr || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      )}

      {players && Object.keys(players).length > 0 ? (
        <div className='space-y-3'>
          <div className='text-xs font-semibold uppercase tracking-wide text-slate-600'>플레이어 패</div>
          {ghSortSeatKeys(Object.keys(players)).map(seat => {
            const pl = ghPickRecord(players[seat])
            if (!pl) return null
            const cardsRaw = pl.cards ?? pl.Cards
            const cards = Array.isArray(cardsRaw) ? (cardsRaw as unknown[]) : []
            const sorted = [...cards]
              .map(c => ghPickRecord(c))
              .filter((x): x is Record<string, unknown> => !!x)
              .sort((a, b) => ghCardPosition(a) - ghCardPosition(b))
            const handRankingText = String(pl.handRankingText ?? pl.HandRankingText ?? '')
            const handRanking = String(pl.handRanking ?? pl.HandRanking ?? '')
            const madeRaw = pl.madeCodes ?? pl.MadeCodes
            const remRaw = pl.remainingCodes ?? pl.RemainingCodes
            const madeCodes = Array.isArray(madeRaw) ? madeRaw.map(String) : []
            const remainingCodes = Array.isArray(remRaw) ? remRaw.map(String) : []
            const prSeat = positionResults ? ghPickRecord(positionResults[seat]) : undefined
            const seatWin = prSeat && (prSeat.isWin === true || prSeat.IsWin === true)

            return (
              <div key={seat} className='rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
                <div className='mb-2 flex flex-wrap items-center gap-2'>
                  <span className='rounded-md bg-slate-900 px-2 py-0.5 text-sm font-bold text-white'>{seat}</span>
                  {seatWin != null ? (
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${seatWin ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}
                    >
                      {seatWin ? '승리' : '패배'}
                    </span>
                  ) : null}
                  {handRankingText ? (
                    <span className='rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-100'>{handRankingText}</span>
                  ) : null}
                  {handRanking && handRanking !== handRankingText ? (
                    <span className='font-mono text-[11px] text-slate-500'>{handRanking}</span>
                  ) : null}
                  <span className='ms-auto font-mono text-[11px] text-slate-400'>hand {ghUnwrapScalar(pl.handValue ?? pl.HandValue)}</span>
                </div>
                <div className='mb-2 flex flex-wrap gap-1'>
                  {sorted.map((card, idx) => {
                    const code = String(ghPick(card, 'code', 'Code') ?? '')
                    return <GhCardChip key={idx} code={code} />
                  })}
                </div>
                {(madeCodes.length > 0 || remainingCodes.length > 0) && (
                  <div className='flex flex-wrap gap-3 border-t border-slate-100 pt-2 text-[11px]'>
                    {madeCodes.length > 0 ? (
                      <div className='flex flex-wrap items-center gap-1'>
                        <span className='text-slate-500'>메이드</span>
                        {madeCodes.map(c => (
                          <span key={c} className='rounded bg-teal-100 px-1.5 py-0.5 font-mono text-teal-950'>
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {remainingCodes.length > 0 ? (
                      <div className='flex flex-wrap items-center gap-1'>
                        <span className='text-slate-500'>남음</span>
                        {remainingCodes.map(c => (
                          <span key={c} className='rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700'>
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {(Array.isArray(optionCards) && optionCards.length > 0) || (Array.isArray(optionProperty) && optionProperty.length > 0) ? (
        <div className='rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs'>
          <div className='mb-1 font-semibold text-slate-600'>옵션</div>
          {Array.isArray(optionCards) && optionCards.length > 0 ? (
            <div className='mb-1'>
              <span className='text-slate-500'>optionCards</span> <span className='font-mono text-slate-800'>{JSON.stringify(optionCards)}</span>
            </div>
          ) : null}
          {Array.isArray(optionProperty) && optionProperty.length > 0 ? (
            <div>
              <span className='text-slate-500'>optionProperty</span> <span className='font-mono text-slate-800'>{JSON.stringify(optionProperty)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className='rounded-lg border border-slate-200 bg-slate-50/80 p-3'>
        <summary className='cursor-pointer select-none text-xs font-medium text-slate-600'>식별자 · 메타 (부가)</summary>
        <div className='mt-3 space-y-2 text-xs'>
          <div className='flex flex-wrap items-start gap-2'>
            <span className='min-w-[4.5rem] shrink-0 text-slate-500'>gameId</span>
            <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
              <code className='break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800 shadow-sm ring-1 ring-slate-100' title={gameId}>
                {gameId || '—'}
              </code>
              {gameId ? (
                <button
                  type='button'
                  className='inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50'
                  onClick={() => copy(gameId)}
                  title='복사'
                >
                  <Copy className='h-3 w-3' /> 복사
                </button>
              ) : null}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <span className='min-w-[4.5rem] text-slate-500'>ghUid</span>
            <span className='rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-100'>{ghUid || '—'}</span>
            {ghUid ? (
              <button
                type='button'
                className='inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50'
                onClick={() => copy(ghUid)}
              >
                <Copy className='h-3 w-3' />
              </button>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-2'>
            <span className='min-w-[4.5rem] text-slate-500'>_id</span>
            <span className='break-all rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-100'>{ghStringifyId(rawId)}</span>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='min-w-[4.5rem] text-slate-500'>isIdx</span>
            <span className='rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px]'>{ghUnwrapScalar(isIdx)}</span>
            {gameOption ? (
              <>
                <span className='text-slate-400'>|</span>
                <span className='text-slate-500'>gameOption</span>
                <span className='rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-slate-100'>{gameOption}</span>
              </>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  )
}

function isResolvableAgentRefKey(key: string): boolean {
  const k = key.toLowerCase().replace(/_/g, '')
  return (
    k === 'parentagentid' ||
    k === 'parentid' ||
    k === 'agentid' ||
    k === 'subagentid' ||
    k === 'fromagentid' ||
    k === 'toagentid'
  )
}

type GridDisplayContext = { agentIdToUsername: Map<string, string> }

/** 긴 UID/ObjectId 형태 컬럼은 목록에서 제외 */
function shouldHideAdminColumnKey(key: string, rows: Record<string, unknown>[]): boolean {
  const lower = key.toLowerCase()
  if (isResolvableAgentRefKey(key)) return false
  if (lower === '_id' || lower === '__v') return true
  if (lower === 'id') {
    if (rows.length === 0) return false
    const samples = rows.slice(0, 15).map(r => r[key]).filter(v => v != null && v !== '')
    if (samples.length === 0) return false
    return samples.every(v => typeof v === 'string' && isMongoObjectIdString(v))
  }
  if (lower === 'password' || lower === 'passwordorg' || lower === 'hashedpassword') return true
  if (rows.length === 0) return false
  const samples = rows.slice(0, 15).map(r => r[key]).filter(v => v != null && v !== '')
  if (samples.length === 0) return false
  if (samples.every(isMongoObjectIdString)) return true
  const allLongUidLike = samples.every(v => {
    if (typeof v !== 'string') return false
    const s = v.trim()
    if (s.length < 28) return false
    if (isMongoObjectIdString(s)) return true
    return /^[a-zA-Z0-9\-_.:]+$/.test(s) && s.length >= 32
  })
  return allLongUidLike
}

function formatAdminCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (isMongoObjectIdString(s)) return '·'
  if (isLikelyDateTimeString(s)) return formatKstDateTimeLabel(s)
  const n = tryParseNumericValue(v)
  if (n !== null) return formatNumberWithCommas(n)
  if (s.length > 48 && /^[a-zA-Z0-9\-_.:/]+$/.test(s)) return `${s.slice(0, 14)}…${s.slice(-6)}`
  return s
}

function isLikelyDateTimeKey(key: string): boolean {
  const k = key.toLowerCase()
  return (
    k.endsWith('at') ||
    k.includes('date') ||
    k.includes('time') ||
    k.includes('timestamp') ||
    k === 'created' ||
    k === 'updated'
  )
}

/** 테이블 컬럼명이 금액·건수·비율 등 숫자 필드일 때 */
function isLikelyNumericColumnKey(key: string): boolean {
  if (isLikelyDateTimeKey(key)) return false
  const k = key.toLowerCase().replace(/_/g, '')
  const exact = new Set([
    'amount',
    'balance',
    'point',
    'betamount',
    'winamount',
    'loseamount',
    'totalamount',
    'beforebalance',
    'afterbalance',
    'transactionamount',
    'userbetting',
    'pnl',
    'fee',
    'tax',
    'rate',
    'odds',
    'multiplier',
    'minbet',
    'maxbet',
    'minplayers',
    'roundnumber',
    'totalusers',
    'totalsubagent',
    'totalsubagentrpoint',
    'replycount',
    'perpage',
    'page',
    'total',
    'count',
    'sum',
    'avg',
    'score',
    'rank',
    'duration',
    'volume',
    'price',
    'quantity',
    'deposit',
    'withdraw',
    'refund',
    'credit',
    'debit',
    'version',
    'responsecode',
    'statuscode',
    'players',
    'lose',
    'win',
    'bet',
    'size',
    'limit',
    'offset',
    'handicap',
    'stake',
    'payout',
    'commission',
    'rebate'
  ])
  if (exact.has(k)) return true
  return /(amount|balance|bet|win|lose|total|count|rate|pnl|fee|odds|sum|avg|min|max|players|users|betting|multiplier)$/i.test(k)
}

function formatAdminCellByKey(key: string, v: unknown, ctx?: GridDisplayContext): string {
  if (v === null || v === undefined) return ''
  if (isLikelyDateTimeKey(key)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      const ms = Math.abs(v) < 1_000_000_000_000 ? v * 1000 : v
      return formatKstDateTimeLabel(new Date(ms))
    }
    const s = String(v)
    if (s.trim() !== '') return formatKstDateTimeLabel(s)
  }
  if (isLikelyNumericColumnKey(key)) {
    const n = tryParseNumericValue(v)
    if (n !== null) return formatNumberWithCommas(n)
  }
  if (ctx?.agentIdToUsername && isResolvableAgentRefKey(key)) {
    const s = v == null ? '' : String(v).trim()
    if (isMongoObjectIdString(s)) return resolveAgentObjectIdToUsername(s, ctx.agentIdToUsername)
  }
  return formatAdminCell(v)
}

/** 게임룸 관리 목록 — 1920 폭 기준 최소 컬럼 */
const ROOMS_LIST_KEYS = ['tableId', 'tableName', 'gameType', 'minBet', 'maxBet', 'isActive', 'isDemo', 'updatedAt'] as const

function roomsListLabel(key: string): string {
  const m: Record<string, string> = {
    tableId: '룸 ID',
    tableName: '룸명',
    gameType: '게임종류',
    minBet: '최소 베팅',
    maxBet: '최대 베팅',
    isActive: '활성',
    isDemo: '데모',
    updatedAt: '수정일시'
  }
  return m[key] || adminFieldLabel(key)
}

function formatRoomListCell(key: string, v: unknown): string {
  if (key === 'isActive' || key === 'isDemo') {
    if (v === true || v === 'true') return '예'
    if (v === false || v === 'false') return '아니오'
    return v == null ? '' : String(v)
  }
  if (key === 'updatedAt') {
    if (v == null || v === '') return ''
    return formatKstDateTimeLabel(String(v))
  }
  return formatAdminCellByKey(key, v, undefined)
}

type RoomFormState = {
  mongoId: string
  tableId: string
  tableName: string
  gameType: string
  gameKind: string
  minPlayers: string
  minBet: string
  maxBet: string
  isActive: boolean
  isDemo: boolean
  stream1: string
  stream2: string
  stream3: string
  thumb1: string
  thumb2: string
  thumb3: string
}

function emptyRoomForm(): RoomFormState {
  return {
    mongoId: '',
    tableId: '',
    tableName: '',
    gameType: 'NIUNIU',
    gameKind: 'STANDARD',
    minPlayers: '1',
    minBet: '10000',
    maxBet: '1000000000',
    isActive: true,
    isDemo: false,
    stream1: '',
    stream2: '',
    stream3: '',
    thumb1: '',
    thumb2: '',
    thumb3: ''
  }
}

function rowToRoomForm(row: Record<string, unknown>): RoomFormState {
  const idVal = row.id ?? row._id ?? row.Id
  const id = idVal != null ? String(idVal) : ''
  const pick = (k: string) => {
    const v = row[k]
    if (v === null || v === undefined) return ''
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return {
    mongoId: id,
    tableId: pick('tableId'),
    tableName: pick('tableName'),
    gameType: pick('gameType') || 'NIUNIU',
    gameKind: pick('gameKind') || 'STANDARD',
    minPlayers: pick('minPlayers') || '1',
    minBet: pick('minBet') || '0',
    maxBet: pick('maxBet') || '0',
    isActive: Boolean(row.isActive ?? row.IsActive ?? true),
    isDemo: Boolean(row.isDemo ?? row.IsDemo ?? false),
    stream1: pick('stream1'),
    stream2: pick('stream2'),
    stream3: pick('stream3'),
    thumb1: pick('thumb1'),
    thumb2: pick('thumb2'),
    thumb3: pick('thumb3')
  }
}

type AgentEditForm = {
  type: string
  nickname: string
  callbackUrl: string
  balance: string
  rate: string
  grade: string
  memo: string
  country: string
  isActive: boolean
  email: string
  phone: string
  company: string
  allowedIPsText: string
  lastLogin: string
  settingsJson: string
}

type AgentReadonlyInfo = {
  id: string
  username: string
  parentAgentId: string | null
  totalSubAgentRpoint: number
  totalSubAgent: number
  totalUsers: number
  createdAt: string
  updatedAt: string
  currentApiKey: string
  secretKey: string
  version: number | null
}

function defaultAgentEditForm(): AgentEditForm {
  return {
    type: '유통',
    nickname: '',
    callbackUrl: '',
    balance: '0',
    rate: '0',
    grade: '',
    memo: '',
    country: 'KOR',
    isActive: true,
    email: '',
    phone: '',
    company: '',
    allowedIPsText: '',
    lastLogin: '',
    settingsJson: '{}'
  }
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mapAgentToForm(agent: Record<string, unknown>): AgentEditForm {
  const ips = agent.allowedIPs
  const last = agent.lastLogin
  return {
    type: String(agent.type ?? '유통'),
    nickname: String(agent.nickname ?? ''),
    callbackUrl: agent.callbackUrl != null ? String(agent.callbackUrl) : '',
    balance: String(agent.balance ?? 0),
    rate: String(agent.rate ?? 0),
    grade: String(agent.grade ?? ''),
    memo: agent.memo != null ? String(agent.memo) : '',
    country: String(agent.country ?? 'KOR'),
    isActive: agent.isActive !== false,
    email: agent.email != null ? String(agent.email) : '',
    phone: agent.phone != null ? String(agent.phone) : '',
    company: agent.company != null ? String(agent.company) : '',
    allowedIPsText: Array.isArray(ips) ? (ips as string[]).join('\n') : '',
    lastLogin: last ? isoToDatetimeLocal(String(last)) : '',
    settingsJson: agent.settings != null ? JSON.stringify(agent.settings, null, 2) : '{}'
  }
}

/** 회원 모달 — 서버 필드와 동일한 폼 (잠긴 필드는 읽기 전용 입력) */
type UserEditFormState = {
  id: string
  userId: string
  username: string
  nickname: string
  country: string
  currencyCode: string
  status: string
  role: string
  token: string
  balance: string
  point: string
  agentId: string
  loginIp: string
  createdAt: string
  updatedAt: string
  lastAccessAt: string
  settingsJson: string
}

function fmtIsoLocal(iso: string): string {
  if (!iso) return '—'
  return formatKstDateTimeLabel(iso)
}

function mapUserRecordToForm(rec: Record<string, unknown>): UserEditFormState {
  const s = (k: string) => (rec[k] != null && rec[k] !== '' ? String(rec[k]) : '')
  const settings = rec.settings
  let settingsJson = '{}'
  if (settings != null && typeof settings === 'object')
    try {
      settingsJson = JSON.stringify(settings, null, 2)
    } catch {
      settingsJson = '{}'
    }
  return {
    id: s('id'),
    userId: s('userId'),
    username: s('username'),
    nickname: s('nickname'),
    country: s('country') || 'KOR',
    currencyCode: s('currencyCode') || 'KRW',
    status: s('status') || 'ACTIVE',
    role: s('role') || 'USER',
    token: s('token'),
    balance: s('balance') || '0',
    point: s('point') || '0',
    agentId: s('agentId'),
    loginIp: s('loginIp'),
    createdAt: s('createdAt'),
    updatedAt: s('updatedAt'),
    lastAccessAt: s('lastAccessAt'),
    settingsJson
  }
}

/** 시스템 설정 편집 행 */
type SystemConfigDraft = {
  id?: string
  param: string
  value: string
  kind: string
  kindTitle: string
  paramComment: string
  isShow: string
}

function emptySystemConfigDraft(): SystemConfigDraft {
  return { param: '', value: '', kind: '', kindTitle: '', paramComment: '', isShow: '1' }
}

function formatSystemConfigValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v instanceof Date) return v.toISOString()
  return String(v)
}

function rowToSystemConfigDraft(r: Record<string, unknown>): SystemConfigDraft {
  const rawId = r._id ?? r.id ?? r.Id
  const id = rawId != null ? String(rawId) : undefined
  const isRaw = r.isShow ?? r.IsShow
  let isShow = '1'
  if (isRaw != null && isRaw !== '') {
    const n = Number(isRaw)
    isShow = Number.isFinite(n) ? String(Math.trunc(n)) : String(isRaw)
  }
  return {
    id,
    param: String(r.param ?? r.Param ?? ''),
    value: formatSystemConfigValue(r.value ?? r.Value),
    kind: String(r.kind ?? r.Kind ?? ''),
    kindTitle: String(r.kindTitle ?? r.KindTitle ?? ''),
    paramComment: String(r.paramComment ?? r.ParamComment ?? ''),
    isShow
  }
}

function fallbackUserFormFromList(u: UserItem): UserEditFormState {
  return {
    id: '',
    userId: '',
    username: u.username,
    nickname: u.nickname || '',
    country: 'KOR',
    currencyCode: 'KRW',
    status: 'ACTIVE',
    role: 'USER',
    token: '',
    balance: String(u.balance ?? 0),
    point: '0',
    agentId: u.agentId || '',
    loginIp: '',
    createdAt: u.createdAt ? String(u.createdAt) : '',
    updatedAt: '',
    lastAccessAt: u.lastAccessAt ? String(u.lastAccessAt) : '',
    settingsJson: '{}'
  }
}

function extractAgentReadonly(agent: Record<string, unknown>): AgentReadonlyInfo {
  return {
    id: String(agent.id ?? ''),
    username: String(agent.username ?? ''),
    parentAgentId: agent.parentAgentId != null ? String(agent.parentAgentId) : null,
    totalSubAgentRpoint: Number(agent.totalSubAgentRpoint ?? 0),
    totalSubAgent: Number(agent.totalSubAgent ?? 0),
    totalUsers: Number(agent.totalUsers ?? 0),
    createdAt: agent.createdAt ? String(agent.createdAt) : '',
    updatedAt: agent.updatedAt ? String(agent.updatedAt) : '',
    currentApiKey: String(agent.currentApiKey ?? ''),
    secretKey: String(agent.secretKey ?? ''),
    version: agent.version != null ? Number(agent.version) : null
  }
}

/** 관리자 콘솔 공통 카드 — 에이전트/회원 모달에서 재사용 */
function ConsoleModalSection({
  variant,
  badge: badgeProp,
  title,
  description,
  children
}: {
  variant: 'profile' | 'apitest'
  badge?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  const isApi = variant === 'apitest'
  const ring = isApi ? 'border-emerald-200/80' : 'border-slate-200'
  const headBg = isApi ? 'bg-emerald-50/80 text-emerald-900' : 'bg-slate-50 text-slate-900'
  const badge = badgeProp ?? (isApi ? 'API' : '정보')

  return (
    <section className={`mb-4 rounded-xl border ${ring} bg-white shadow-sm`}>
      <div className={`flex flex-wrap items-center gap-2 rounded-t-xl border-b border-slate-100 px-4 py-3 ${headBg}`}>
        <span className='rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80'>
          {badge}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='text-sm font-semibold'>{title}</div>
          {description && <div className='mt-0.5 text-xs font-normal text-slate-600'>{description}</div>}
        </div>
      </div>
      <div className='p-4'>{children}</div>
    </section>
  )
}

function EditablePanel({
  title,
  children,
  className = ''
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`pt-1 ${className}`}>
      <div className='mb-3 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500'>
        {title}
      </div>
      {children}
    </div>
  )
}

/** 조회 전용 필드 — 읽기 전용 입력과 동일한 톤 */
function ReadonlyInput({ value, className = '' }: { value: string; className?: string }) {
  return (
    <input
      readOnly
      tabIndex={-1}
      value={value}
      className={`form-control form-control-sm border-slate-200 bg-slate-50 text-slate-800 ${className}`}
    />
  )
}

function ReadonlyTextarea({ value, rows = 2, className = '' }: { value: string; rows?: number; className?: string }) {
  return (
    <textarea
      readOnly
      tabIndex={-1}
      rows={rows}
      value={value}
      className={`form-control form-control-sm border-slate-200 bg-slate-50 font-mono text-xs text-slate-800 ${className}`}
    />
  )
}

function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  overlayClassName = '',
  panelClassName = 'max-w-6xl'
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** 예: z-[1100] — 다른 모달 위에 겹칠 때 */
  overlayClassName?: string
  /** 패널 최대 너비 (Tailwind 클래스, 예: max-w-lg) */
  panelClassName?: string
}) {
  if (!open) return null
  return (
    <div
      className={`fixed inset-0 z-[1055] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px] ${overlayClassName}`.trim()}
      role='dialog'
      aria-modal='true'
    >
      <div
        className={`flex max-h-[min(92vh,920px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 ${panelClassName}`.trim()}
      >
        <div className='flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4'>
          <h2 className='m-0 text-base font-semibold text-slate-900'>{title}</h2>
          <button
            type='button'
            className='rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700'
            onClick={onClose}
            aria-label='닫기'
          >
            ✕
          </button>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>{children}</div>
        {footer && <div className='flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3'>{footer}</div>}
      </div>
    </div>
  )
}

/** 상단 알림 대신 사용 — 다른 모달보다 위에 표시 */
function AlertModal({
  open,
  variant,
  title,
  message,
  onClose
}: {
  open: boolean
  variant: 'danger' | 'success'
  title: string
  message: string
  onClose: () => void
}) {
  if (!open || !message.trim()) return null
  const panel =
    variant === 'danger'
      ? 'border-red-200/90 bg-red-50/95 text-red-950'
      : 'border-emerald-200/90 bg-emerald-50/95 text-emerald-950'
  const btn = variant === 'danger' ? 'btn-danger' : 'btn-success'
  return (
    <div
      className='fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm'
      role='alertdialog'
      aria-modal='true'
      aria-labelledby='admin-alert-title'
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${panel}`}
        onClick={e => e.stopPropagation()}
      >
        <div className='border-b border-black/10 px-5 py-4'>
          <h2 id='admin-alert-title' className='m-0 text-base font-semibold'>
            {title}
          </h2>
        </div>
        <div className='max-h-[min(60vh,320px)] overflow-y-auto px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap'>
          {message}
        </div>
        <div className='flex justify-end border-t border-black/10 bg-white/40 px-5 py-3'>
          <button type='button' className={`btn btn-sm ${btn}`} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

/** 트리 + 목록: 회원 목록과 동일한 Bootstrap 테이블 클래스 사용 */
function AgentTreeGrid({
  nodes,
  selectedId,
  onSelectRow,
  onDeleteRow,
  onMoneyAction,
  onAddSubAgent
}: {
  nodes: Agent[]
  selectedId: string
  onSelectRow: (a: Agent, mode: 'select' | 'open') => void
  onDeleteRow: (a: Agent, e: MouseEvent) => void | Promise<void>
  onMoneyAction?: (a: Agent, kind: 'give' | 'recall', e: MouseEvent) => void
  onAddSubAgent?: (a: Agent, e: MouseEvent) => void
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const collect = (arr: Agent[]): string[] => {
      const r: string[] = []
      for (const a of arr) {
        if (a.children?.length) {
          r.push(a.id)
          r.push(...collect(a.children))
        }
      }
      return r
    }
    setExpandedIds(new Set(collect(nodes)))
  }, [nodes])

  const toggleExpand = (id: string, e: MouseEvent) => {
    e.stopPropagation()
    setExpandedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const buildRows = (arr: Agent[], depth: number): ReactNode[] => {
    const out: ReactNode[] = []
    for (const node of arr) {
      const hasChildren = !!(node.children?.length)
      const expanded = hasChildren && expandedIds.has(node.id)
      const indentPx = 6 + depth * 18
      const canNormalMoneyAction = !!node.parentId
      const canAdminSelfMoneyAction = !node.parentId && node.username === 'admin'

      out.push(
        <tr
          key={node.id}
          role='row'
          title='한 번 클릭: 부모 선택 · 두 번 클릭: 상세 편집'
          className={`admin-console-data-row border-bottom border-slate-200 transition-colors hover:bg-slate-50/90 ${selectedId === node.id ? 'bg-sky-50/80' : 'bg-white'}`}
          onClick={() => onSelectRow(node, 'select')}
          onDoubleClick={() => onSelectRow(node, 'open')}
        >
          <td>
            <div className='flex min-w-0 items-start gap-1.5' style={{ paddingLeft: indentPx }}>
              <div className='flex shrink-0 items-center pt-0.5'>
                {hasChildren ? (
                  <button
                    type='button'
                    className='btn btn-sm btn-outline-secondary py-0 px-1'
                    onClick={e => toggleExpand(node.id, e)}
                    aria-expanded={expanded}
                    aria-label={expanded ? '접기' : '펼치기'}
                  >
                    {expanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                  </button>
                ) : (
                  <span className='inline-flex h-8 w-8 items-center justify-center text-muted'>·</span>
                )}
              </div>
              <div className='min-w-0 flex-1 border-start border-secondary-subtle ps-2'>
                <div className='d-flex align-items-center gap-1'>
                  <div className='fw-medium text-truncate'>{node.username}</div>
                  {onAddSubAgent && (
                    <button
                      type='button'
                    className='btn btn-sm btn-success py-0 px-1'
                      title='이 노드 하위 에이전트 추가'
                      onClick={e => {
                        e.stopPropagation()
                        onAddSubAgent(node, e)
                      }}
                    >
                      +
                    </button>
                  )}
                  <button
                    type='button'
                    className='btn btn-sm btn-danger py-0 px-1'
                    disabled={!node.parentId || hasChildren}
                    title={!node.parentId ? '최상위는 삭제 불가' : hasChildren ? '하위 트리가 있으면 삭제 불가' : '이 노드 삭제'}
                    onClick={e => void onDeleteRow(node, e)}
                  >
                    x
                  </button>
                </div>
                <div className='small text-muted text-truncate'>{node.nickname || '—'}</div>
              </div>
            </div>
          </td>
          <td>{node.grade || '—'}</td>
          <td className='tabular-nums text-end'>{formatNumberWithCommas(node.rate ?? 0)}</td>
          <td className='tabular-nums text-end'>{formatNumberWithCommas(node.totalUsers ?? 0)}</td>
          <td className='tabular-nums text-end'>{formatNumberWithCommas(node.balance ?? 0)}</td>
          <td>
            {node.isActive ? (
              <span className='badge text-bg-success'>Active</span>
            ) : (
              <span className='badge text-bg-secondary'>Off</span>
            )}
          </td>
          <td className='text-end text-nowrap'>
            {(canNormalMoneyAction || canAdminSelfMoneyAction) && onMoneyAction && (
              <>
                <button
                  type='button'
                  className={`btn btn-sm me-1 ${canAdminSelfMoneyAction ? 'btn-danger' : 'btn-success'}`}
                  title={canAdminSelfMoneyAction ? 'admin 강제 지급' : '상위 에이전트 잔액에서 이 하위 에이전트로 지급'}
                  onClick={e => {
                    e.stopPropagation()
                    onMoneyAction(node, 'give', e)
                  }}
                >
                  지급
                </button>
                <button
                  type='button'
                  className={`btn btn-sm me-1 ${canAdminSelfMoneyAction ? 'btn-danger' : 'btn-warning'}`}
                  title={canAdminSelfMoneyAction ? 'admin 강제 회수' : '이 하위 에이전트 잔액을 상위로 회수'}
                  onClick={e => {
                    e.stopPropagation()
                    onMoneyAction(node, 'recall', e)
                  }}
                >
                  회수
                </button>
              </>
            )}
            <button
              type='button'
              className='btn btn-sm btn-outline-primary me-1'
              onClick={e => {
                e.stopPropagation()
                onSelectRow(node, 'open')
              }}
            >
              편집
            </button>
          </td>
        </tr>
      )
      if (hasChildren && expanded) {
        out.push(...buildRows(node.children!, depth + 1))
      }
    }
    return out
  }

  return (
    <div className='admin-console-grid admin-console-grid--agent-tree w-100'>
      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
        <div className='table-responsive min-w-0 overflow-hidden rounded-xl'>
          <table
            className='table table-sm align-middle mb-0'
            style={{ fontSize: '0.8125rem' }}
            role='treegrid'
            aria-label='에이전트 트리'
          >
            <thead className='border-b border-slate-200 bg-slate-100/90'>
              <tr>
                <th className='text-muted small fw-semibold py-2 ps-2'>에이전트</th>
                <th className='text-muted small fw-semibold py-2'>등급</th>
                <th className='text-muted small fw-semibold py-2 text-end'>요율</th>
                <th className='text-muted small fw-semibold py-2 text-end'>회원수</th>
                <th className='text-muted small fw-semibold py-2 text-end'>머니</th>
                <th className='text-muted small fw-semibold py-2'>상태</th>
                <th className='text-muted small fw-semibold py-2 text-end pe-2'>작업</th>
              </tr>
            </thead>
            <tbody>{buildRows(nodes, 0)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function AdminConsole() {
  const locale: LocaleKey = 'ko' // 기본 표시는 한국어
  const labels = I18N_LABELS[locale]
  const [clockNow, setClockNow] = useState(() => new Date())
  const [menu, setMenu] = useState('agents-list')
  const effectiveMenu = MENU_KEY_ALIASES[menu] ?? menu
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [jwt, setJwt] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [agentRoots, setAgentRoots] = useState<Agent[]>([])
  const [agentFlat, setAgentFlat] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [users, setUsers] = useState<UserItem[]>([])
  const [filterText, setFilterText] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterMinBalance, setFilterMinBalance] = useState('')
  const [filterMaxBalance, setFilterMaxBalance] = useState('')
  const [swaggerOk, setSwaggerOk] = useState('')
  const [niuniuTableCount, setNiuniuTableCount] = useState<number | null>(null)
  const [niuniuTableBusy, setNiuniuTableBusy] = useState(false)
  const [systemConfigTab, setSystemConfigTab] = useState<'detail' | 'db'>('detail')
  const [systemConfigDrafts, setSystemConfigDrafts] = useState<SystemConfigDraft[]>([])
  const [systemConfigLoading, setSystemConfigLoading] = useState(false)
  const [systemConfigBusyKey, setSystemConfigBusyKey] = useState<string | null>(null)

  const [adminDayFrom, setAdminDayFrom] = useState(() => startOfTodayLocalDateTimeInput())
  const [adminDayTo, setAdminDayTo] = useState(() => endOfTodayLocalDateTimeInput())
  const [adminUserIdFilter, setAdminUserIdFilter] = useState('')
  const [adminTableIdFilter, setAdminTableIdFilter] = useState('')
  const [adminRows, setAdminRows] = useState<Record<string, unknown>[]>([])
  const [adminTotal, setAdminTotal] = useState(0)
  const [adminPage, setAdminPage] = useState(1)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminBanKey, setAdminBanKey] = useState('')
  const [abnormalOnlyFailed, setAbnormalOnlyFailed] = useState(true)
  const [abnormalKeyword, setAbnormalKeyword] = useState('')
  const [historyTableIdFilter, setHistoryTableIdFilter] = useState('')
  const [historyGameIdFilter, setHistoryGameIdFilter] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('')

  const [showRoomModal, setShowRoomModal] = useState(false)
  const [showGameHistoryDetailModal, setShowGameHistoryDetailModal] = useState(false)
  const [gameHistoryDetailDoc, setGameHistoryDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [showBetHistoryDetailModal, setShowBetHistoryDetailModal] = useState(false)
  const [betHistoryDetailDoc, setBetHistoryDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [showSeamlessCallbackDetailModal, setShowSeamlessCallbackDetailModal] = useState(false)
  const [seamlessCallbackDetailDoc, setSeamlessCallbackDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [showTransferApiLogDetailModal, setShowTransferApiLogDetailModal] = useState(false)
  const [transferApiLogDetailDoc, setTransferApiLogDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [showErrorLogDetailModal, setShowErrorLogDetailModal] = useState(false)
  const [errorLogDetailDoc, setErrorLogDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [showAdminJsonDetailModal, setShowAdminJsonDetailModal] = useState(false)
  const [adminJsonDetailDoc, setAdminJsonDetailDoc] = useState<Record<string, unknown> | null>(null)
  const [adminJsonDetailTitle, setAdminJsonDetailTitle] = useState('')
  const [showTicketCreateModal, setShowTicketCreateModal] = useState(false)
  const [ticketCreateCategory, setTicketCreateCategory] = useState('문의')
  const [ticketCreateTitle, setTicketCreateTitle] = useState('')
  const [ticketCreateContent, setTicketCreateContent] = useState('')
  const [showTicketEditModal, setShowTicketEditModal] = useState(false)
  const [ticketEditRow, setTicketEditRow] = useState<Record<string, unknown> | null>(null)
  const [ticketEditStatus, setTicketEditStatus] = useState('created')
  const [ticketEditReply, setTicketEditReply] = useState('')
  const [showTicketDeleteModal, setShowTicketDeleteModal] = useState(false)
  const [ticketDeleteRow, setTicketDeleteRow] = useState<Record<string, unknown> | null>(null)
  const [ticketModalBusy, setTicketModalBusy] = useState(false)
  const [roomModalMode, setRoomModalMode] = useState<'create' | 'edit'>('edit')
  const [roomForm, setRoomForm] = useState<RoomFormState>(() => emptyRoomForm())
  const [roomSaveBusy, setRoomSaveBusy] = useState(false)

  const [showUserEdit, setShowUserEdit] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)

  /** 목록 — 지급 전용 모달 */
  const [userGiveAmount, setUserGiveAmount] = useState('0')
  const [showUserGiveModal, setShowUserGiveModal] = useState(false)
  const [userGiveBusy, setUserGiveBusy] = useState(false)
  const [showUserGiveLimitWarning, setShowUserGiveLimitWarning] = useState(false)
  /** 목록 — 회수 전용 모달 (지급 모달과 동일 레이아웃) */
  const [userRecallAmount, setUserRecallAmount] = useState('0')
  const [showUserRecallModal, setShowUserRecallModal] = useState(false)
  const [userRecallBusy, setUserRecallBusy] = useState(false)
  const [userRecallFullAll, setUserRecallFullAll] = useState(false)
  const [showUserRecallLimitWarning, setShowUserRecallLimitWarning] = useState(false)

  const [showAgentModal, setShowAgentModal] = useState(false)
  const [modalAgent, setModalAgent] = useState<Agent | null>(null)
  const [modalApiKey, setModalApiKey] = useState('')
  const [modalTestUserId, setModalTestUserId] = useState('')
  const [modalJoinLink, setModalJoinLink] = useState('')
  const [showKeyConfirm, setShowKeyConfirm] = useState(false)

  const [agentEditForm, setAgentEditForm] = useState<AgentEditForm>(() => defaultAgentEditForm())
  const [agentReadonly, setAgentReadonly] = useState<AgentReadonlyInfo | null>(null)
  const [agentFormLoading, setAgentFormLoading] = useState(false)
  const [agentSaveBusy, setAgentSaveBusy] = useState(false)
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [showAgentMoneyModal, setShowAgentMoneyModal] = useState(false)
  const [agentMoneyKind, setAgentMoneyKind] = useState<'give' | 'recall'>('give')
  const [agentMoneyTarget, setAgentMoneyTarget] = useState<Agent | null>(null)
  const [agentMoneyAmount, setAgentMoneyAmount] = useState('')
  const [agentMoneyBusy, setAgentMoneyBusy] = useState(false)
  const [agentMoneyHistRows, setAgentMoneyHistRows] = useState<Record<string, unknown>[]>([])
  const [agentMoneyHistTotal, setAgentMoneyHistTotal] = useState(0)
  const [agentMoneyHistPage, setAgentMoneyHistPage] = useState(1)
  const [agentMoneyHistLoading, setAgentMoneyHistLoading] = useState(false)
  const [agentMoneyHistFrom, setAgentMoneyHistFrom] = useState(() => daysAgoLocalDateTimeInput(30))
  const [agentMoneyHistTo, setAgentMoneyHistTo] = useState(() => endOfTodayLocalDateTimeInput())
  const [addAgentForm, setAddAgentForm] = useState({
    username: '',
    password: '',
    nickname: '',
    rate: '0',
    grade: 'partner',
    memo: ''
  })
  const [addAgentBusy, setAddAgentBusy] = useState(false)

  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [addUserForm, setAddUserForm] = useState({ agentUsername: '', username: '', nickname: '' })
  const [addUserBusy, setAddUserBusy] = useState(false)

  const [userDetailRecord, setUserDetailRecord] = useState<Record<string, unknown> | null>(null)
  const [userDetailLoading, setUserDetailLoading] = useState(false)
  const [userEditForm, setUserEditForm] = useState<UserEditFormState | null>(null)
  const [userSaveBusy, setUserSaveBusy] = useState(false)
  const adminBalance = useMemo(() => Number(agentRoots[0]?.balance ?? 0), [agentRoots])

  /** 지급 한도: 소속 에이전트(출처) 잔액 */
  const selectedUserAgentBalance = useMemo(() => {
    if (!selectedUser?.agentId) return 0
    const parent = agentFlat.find(a => a.username === selectedUser.agentId)
    return Number(parent?.balance ?? 0)
  }, [agentFlat, selectedUser])

  /** 회수 한도: 회원 잔액 (상세 로드 후 userEditForm 반영) */
  const selectedUserMemberBalance = useMemo(() => {
    if (!selectedUser) return 0
    const raw = userEditForm?.balance ?? selectedUser.balance
    const n = Number(raw ?? 0)
    return Number.isFinite(n) ? n : 0
  }, [selectedUser, userEditForm])

  const agentUsernames = useMemo(
    () => Array.from(new Set(agentFlat.map(a => a.username).filter(Boolean))),
    [agentFlat]
  )

  const agentIdToUsername = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agentFlat) {
      const id = String(a.id ?? '').trim()
      const u = String(a.username ?? '').trim()
      if (id && u) m.set(id, u)
    }
    return m
  }, [agentFlat])

  const activeMenuItem = useMemo(() => allMenuItems().find(i => i.key === menu), [menu])

  const breadcrumbTrail = useMemo(() => {
    for (const s of MENU_SECTIONS) {
      for (const g of s.groups) {
        const item = g.items.find(i => i.key === menu)
        if (item) return { sectionTitle: s.title, groupTitle: g.title, item }
      }
    }
    return null
  }, [menu])

  const breadcrumbSubline = breadcrumbTrail?.groupTitle
    ? `${breadcrumbTrail.sectionTitle} > ${breadcrumbTrail.groupTitle}`
    : breadcrumbTrail?.sectionTitle

  const pageTitle = activeMenuItem?.label || '홈'

  const filteredUsers = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    const min = filterMinBalance === '' ? Number.NEGATIVE_INFINITY : Number(filterMinBalance)
    const max = filterMaxBalance === '' ? Number.POSITIVE_INFINITY : Number(filterMaxBalance)
    const filtered = users.filter(u => {
      const b = Number(u.balance || 0)
      return (
        (q === '' || u.username.toLowerCase().includes(q) || (u.nickname || '').toLowerCase().includes(q)) &&
        (filterAgent === '' || (u.agentId || '').toLowerCase() === filterAgent.toLowerCase()) &&
        b >= min &&
        b <= max
      )
    })
    return sortRowsByUidDesc(filtered as Record<string, unknown>[]) as UserItem[]
  }, [users, filterText, filterAgent, filterMinBalance, filterMaxBalance])

  const adminTableKeys = useMemo(() => {
    const s = new Set<string>()
    adminRows.forEach(r => Object.keys(r).forEach(k => s.add(k)))
    const keys = Array.from(s)
      .sort()
      .filter(k => !shouldHideAdminColumnKey(k, adminRows))
    if (
      effectiveMenu === 'manage-history-transactions' ||
      effectiveMenu === 'manage-history-sessions' ||
      effectiveMenu === 'game-user-betting'
    ) {
      const priority = [
        'userId',
        'UserId',
        'username',
        'Username',
        'betId',
        'BetId',
        'betUid',
        'BetUid',
        'tableId',
        'TableId',
        'gameId',
        'GameId',
        'roundId',
        'RoundId',
        'roundNumber',
        'RoundNumber',
        'lastUpdateTime',
        'LastUpdateTime',
        'betTime',
        'BetTime',
        'status',
        'resultStatus',
        'transactionStatus',
        'amount',
        'betAmount',
        'winAmount',
        'createdAt',
        'updatedAt'
      ]
      const score = (k: string) => {
        const i = priority.indexOf(k)
        return i === -1 ? 999 : i
      }
      return [...keys].sort((a, b) => {
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
    }
    if (effectiveMenu === 'users-list' || effectiveMenu === 'agents-list' || effectiveMenu === 'manage-users-funds') {
      const priority = [
        'userId',
        'UserId',
        'username',
        'Username',
        'nickname',
        'Nickname',
        'agentId',
        'AgentId',
        'agentUsername',
        'AgentUsername',
        'balance',
        'Balance',
        'createdAt',
        'CreatedAt',
        'lastAccessAt',
        'LastAccessAt'
      ]
      const score = (k: string) => {
        const i = priority.indexOf(k)
        return i === -1 ? 999 : i
      }
      return [...keys].sort((a, b) => {
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
    }
    if (effectiveMenu === 'manage-history-abnormal') {
      const priority = [
        'createdAt',
        'CreatedAt',
        'severity',
        'Severity',
        'errorType',
        'ErrorType',
        'errorCode',
        'ErrorCode',
        'errorMessage',
        'ErrorMessage',
        'endpoint',
        'Endpoint',
        'method',
        'Method',
        'clientIp',
        'ClientIp',
        'agentUsername',
        'AgentUsername',
        'resolved',
        'Resolved'
      ]
      const score = (k: string) => {
        const i = priority.indexOf(k)
        return i === -1 ? 999 : i
      }
      return [...keys].sort((a, b) => {
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
    }
    if (effectiveMenu === 'manage-logs-transfer-api') {
      const priority = [
        'createdAt',
        'CreatedAt',
        'requestTime',
        'RequestTime',
        'responseTime',
        'ResponseTime',
        'agentId',
        'AgentId',
        'agentUsername',
        'AgentUsername',
        'category',
        'Category',
        'method',
        'Method',
        'statusCode',
        'StatusCode',
        'success',
        'Success',
        'duration',
        'Duration',
        'endpoint',
        'Endpoint',
        'apiKey',
        'ApiKey',
        'clientIp',
        'ClientIp',
        'userAgent',
        'UserAgent',
        'errorMessage',
        'ErrorMessage',
        'errorDetails',
        'ErrorDetails'
      ]
      const score = (k: string) => {
        const i = priority.indexOf(k)
        return i === -1 ? 999 : i
      }
      return [...keys].sort((a, b) => {
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
    }
    if (effectiveMenu === 'manage-logs-callback-errors') {
      const priority = [
        'createdAt',
        'CreatedAt',
        'txId',
        'TxId',
        'agentId',
        'AgentId',
        'userId',
        'UserId',
        'username',
        'Username',
        'status',
        'Status',
        'responseStatus',
        'ResponseStatus',
        'latencyMs',
        'LatencyMs',
        'attempt',
        'Attempt',
        'finalUrl',
        'FinalUrl',
        'url',
        'Url',
        'requestBody',
        'responseBody'
      ]
      const score = (k: string) => {
        const i = priority.indexOf(k)
        return i === -1 ? 999 : i
      }
      return [...keys].sort((a, b) => {
        const sa = score(a)
        const sb = score(b)
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
      })
    }
    return keys
  }, [adminRows, effectiveMenu])

  const adminPerPage = effectiveMenu === 'rooms-manage' ? 100 : 50
  const adminDisplayRows = useMemo(() => {
    if (
      effectiveMenu !== 'manage-history-abnormal' &&
      effectiveMenu !== 'manage-history-transactions' &&
      effectiveMenu !== 'manage-history-sessions' &&
      effectiveMenu !== 'game-user-betting'
    ) {
      return adminRows
    }

    const num = (row: Record<string, unknown>) => {
      const candidates = [row.amount, row.betAmount, row.winAmount, row.transactionAmount]
      for (const c of candidates) {
        const n = Number(c)
        if (Number.isFinite(n)) return n
      }
      return 0
    }
    const statusVal = (row: Record<string, unknown>) => String(row.status ?? row.resultStatus ?? row.transactionStatus ?? '').toLowerCase()
    const rowText = (row: Record<string, unknown>) => Object.values(row).map(v => String(v ?? '')).join(' ').toLowerCase()
    const tableVal = (row: Record<string, unknown>) => String(row.tableId ?? row.TableId ?? '').toLowerCase()
    const gameVal = (row: Record<string, unknown>) => String(row.gameId ?? row.GameId ?? row.roundId ?? row.RoundId ?? '').toLowerCase()

    let out = adminRows

    if (effectiveMenu === 'manage-history-abnormal') {
      if (abnormalOnlyFailed) {
        out = out.filter(r => {
          const sev = String(r.severity ?? r.Severity ?? '').toUpperCase()
          const res = r.resolved ?? r.Resolved
          return sev === 'ERROR' || sev === 'CRITICAL' || res === false
        })
      }
      if (abnormalKeyword.trim()) {
        const q = abnormalKeyword.trim().toLowerCase()
        out = out.filter(r => rowText(r).includes(q))
      }
    } else {
      if (historyTableIdFilter.trim()) {
        const q = historyTableIdFilter.trim().toLowerCase()
        out = out.filter(r => tableVal(r).includes(q))
      }
      if (historyGameIdFilter.trim()) {
        const q = historyGameIdFilter.trim().toLowerCase()
        out = out.filter(r => gameVal(r).includes(q))
      }
      if (historyStatusFilter.trim()) {
        const q = historyStatusFilter.trim().toLowerCase()
        out = out.filter(r => statusVal(r).includes(q))
      }
    }
    if (effectiveMenu === 'manage-history-sessions') {
      return sortRowsByTimeFieldDesc(out, ['updatedAt', 'UpdatedAt', 'createdAt', 'CreatedAt'])
    }
    if (effectiveMenu === 'manage-history-transactions' || effectiveMenu === 'game-user-betting') {
      return sortRowsByTimeFieldDesc(out, ['betTime', 'BetTime', 'createdAt', 'CreatedAt'])
    }
    return sortRowsByUidDesc(out)
  }, [
    effectiveMenu,
    adminRows,
    abnormalOnlyFailed,
    abnormalKeyword,
    historyTableIdFilter,
    historyGameIdFilter,
    historyStatusFilter
  ])

  const adminDisplayTotal =
    effectiveMenu === 'manage-history-abnormal' ||
    effectiveMenu === 'manage-history-transactions' ||
    effectiveMenu === 'manage-history-sessions' ||
    effectiveMenu === 'game-user-betting'
      ? adminDisplayRows.length
      : adminTotal

  const api = async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string>), Authorization: `Bearer ${jwt}` }
    if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) {
      localStorage.removeItem('zp_admin_jwt')
      setJwt('')
      setAgentRoots([])
      setAgentFlat([])
      setUsers([])
      setSelectedAgentId('')
      const msg = data?.error || data?.message || '세션이 만료되었거나 토큰이 유효하지 않습니다. 다시 로그인해 주세요.'
      throw new Error(typeof msg === 'string' ? msg : 'Unauthorized')
    }
    if (res.status === 403) {
      throw new Error(
        typeof data?.message === 'string'
          ? data.message
          : '권한이 없습니다. 시스템 설정·일부 데이터는 admin 전용이며, 에이전트는 본인 트리 범위만 사용할 수 있습니다.'
      )
    }
    if (!res.ok) throw new Error(data?.message || data?.error || `요청 실패 (${res.status})`)
    return data
  }

  const login = async () => {
    setError('')
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json().catch(() => ({}))
    const tok = data?.token ?? data?.Token
    if (!res.ok || !tok) return setError(data?.message || data?.error || '로그인 실패')
    localStorage.setItem('zp_admin_jwt', tok)
    setJwt(tok)
  }

  const logout = () => {
    localStorage.removeItem('zp_admin_jwt')
    setJwt('')
    setAgentRoots([])
    setAgentFlat([])
    setUsers([])
    setSelectedAgentId('')
  }

  const nestedSubAgents = (res: any): any[] => {
    const raw = res?.data ?? res?.Data ?? res?.subAgents ?? res?.SubAgents
    return Array.isArray(raw) ? raw : []
  }

  const fetchChildAgents = async (parent: Agent, depth: number): Promise<Agent[]> => {
    if (depth > 6) return []
    const pid = parent.id?.trim()
    if (!pid) return []
    try {
      const res = await api(`/api/auth/agents/${encodeURIComponent(pid)}/sub-agents`)
      const rows: Agent[] = nestedSubAgents(res).map((x: any) => ({
        id: x.id || x.Id || '',
        username: x.username || x.Username || '',
        nickname: x.nickname || x.Nickname || '',
        grade: x.grade || x.Grade,
        rate: x.rate ?? x.Rate,
        balance: x.balance ?? x.Balance ?? 0,
        isActive: x.isActive ?? x.IsActive ?? true,
        totalUsers: x.totalUsers ?? x.TotalUsers ?? 0,
        parentId: parent.id,
        callbackUrl: x.callbackUrl || x.CallbackUrl || '',
        currentApiKey: x.currentApiKey || x.CurrentApiKey || ''
      }))
      for (const row of rows) {
        try {
          row.children = await fetchChildAgents(row, depth + 1)
        } catch {
          row.children = []
        }
      }
      return rows
    } catch {
      return []
    }
  }

  const flattenAgents = (nodes: Agent[]): Agent[] => {
    const out: Agent[] = []
    const walk = (arr: Agent[]) =>
      arr.forEach(n => {
        out.push(n)
        if (n.children?.length) walk(n.children)
      })
    walk(nodes)
    return out
  }

  const loadAgentTree = async () => {
    setError('')
    const info = await api('/api/auth/agent-info')
    const root: Agent = {
      id: info.id ?? info.Id ?? '',
      username: info.username ?? info.Username ?? '',
      nickname: info.nickname ?? info.Nickname ?? '',
      grade: info.grade ?? info.Grade,
      rate: info.rate ?? info.Rate,
      balance: info.balance ?? info.Balance ?? 0,
      totalUsers: info.totalUsers ?? info.TotalUsers ?? 0,
      isActive: true,
      parentId: null,
      callbackUrl: info.callbackUrl || info.CallbackUrl || '',
      currentApiKey: info.currentApiKey || info.CurrentApiKey || '',
      children: []
    }
    if (!root.id) throw new Error('에이전트 id가 없습니다. 서버 응답을 확인하세요.')
    const direct = await api('/api/auth/sub-agents?perPage=1000')
    const raw = direct?.subAgents ?? direct?.SubAgents ?? []
    const rows: Agent[] = (Array.isArray(raw) ? raw : []).map((x: any) => ({
      id: x.id || x.Id || '',
      username: x.username || x.Username || '',
      nickname: x.nickname || x.Nickname || '',
      grade: x.grade || x.Grade,
      rate: x.rate ?? x.Rate,
      balance: x.balance ?? x.Balance ?? 0,
      isActive: x.isActive ?? x.IsActive ?? true,
      totalUsers: x.totalUsers ?? x.TotalUsers ?? 0,
      parentId: root.id,
      callbackUrl: x.callbackUrl || x.CallbackUrl || '',
      currentApiKey: x.currentApiKey || x.CurrentApiKey || ''
    }))
    for (const r of rows) {
      try {
        r.children = await fetchChildAgents(r, 1)
      } catch {
        r.children = []
      }
    }
    root.children = rows
    setAgentRoots([root])
    const flat = flattenAgents([root])
    setAgentFlat(flat)
    if (!selectedAgentId && flat[0]) setSelectedAgentId(flat[0].id)
  }

  const loadUsersForAgent = async (agentUsername: string) => {
    const data = await api(`/api/auth/my-users?page=1&perPage=1000&agentId=${encodeURIComponent(agentUsername)}`)
    return (data?.users || []).map((u: any) => ({
      username: u.username,
      nickname: u.nickname,
      balance: u.balance,
      agentId: agentUsername,
      userId: u.userId ?? u.UserId,
      createdAt: u.createdAt,
      lastAccessAt: u.lastAccessAt
    })) as UserItem[]
  }

  const loadAllUsers = async () => {
    const info = await api('/api/auth/agent-info')
    const direct = await api('/api/auth/sub-agents?perPage=1000')
    const subs = (direct?.subAgents ?? direct?.SubAgents ?? []) as any[]
    const list: string[] = [info?.username, ...subs.map((x: any) => x.username)]
    const all: UserItem[] = []
    for (const uname of list)
      if (uname)
        try {
          all.push(...(await loadUsersForAgent(uname)))
        } catch {
          /* skip */
        }
    setUsers(sortRowsByUidDesc(all as Record<string, unknown>[]) as UserItem[])
  }

  useEffect(() => {
    try {
      setJwt(localStorage.getItem('zp_admin_jwt') || '')
    } catch {
      /* 브라우저 외 환경 */
    }
  }, [])

  useEffect(() => {
    if (!jwt) return
    const run = async () => {
      try {
        await loadAgentTree()
        await loadAllUsers()
      } catch (e: any) {
        setError(e?.message || String(e))
      }
    }
    void run()
  }, [jwt])

  useEffect(() => {
    const t = window.setInterval(() => setClockNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!jwt || effectiveMenu !== 'manage-users-point-moves') return
    void loadAgentMoneyHistory(1).catch(e => setError(e?.message || String(e)))
  }, [jwt, menu, effectiveMenu])

  /** 회수 모달: 전체 회수 체크 시 상세 로드 후 잔액이 갱신되면 금액 필드에 전액 반영 */
  useEffect(() => {
    if (!showUserRecallModal || !userRecallFullAll || !selectedUser) return
    setUserRecallAmount(String(selectedUserMemberBalance))
  }, [showUserRecallModal, userRecallFullAll, selectedUserMemberBalance, selectedUser?.username])

  const openAgentModal = async (a: Agent) => {
    setModalAgent(a)
    setModalApiKey((a as any).currentApiKey || '')
    setModalJoinLink('')
    setModalTestUserId('')
    setAgentReadonly(null)
    setAgentEditForm(defaultAgentEditForm())
    setAgentFormLoading(true)
    setShowAgentModal(true)
    try {
      const d = await api(`/api/admin/agents/${encodeURIComponent(a.id)}`)
      const ag = (d?.agent ?? d) as Record<string, unknown>
      setAgentEditForm(mapAgentToForm(ag))
      setAgentReadonly(extractAgentReadonly(ag))
    } catch {
      setAgentEditForm(defaultAgentEditForm())
      setAgentReadonly(null)
      setError('에이전트 상세를 불러오지 못했습니다.')
    } finally {
      setAgentFormLoading(false)
    }
  }

  const saveAgentEdit = async () => {
    if (!modalAgent) return
    setAgentSaveBusy(true)
    setError('')
    setStatus('')
    try {
      const raw = agentEditForm.settingsJson.trim() || '{}'
      JSON.parse(raw)
      let lastLoginIso: string | null = null
      if (agentEditForm.lastLogin.trim()) {
        const d = new Date(agentEditForm.lastLogin)
        if (isNaN(d.getTime())) throw new Error('마지막 로그인 시각 형식이 올바르지 않습니다.')
        lastLoginIso = d.toISOString()
      }
      const allowedIPs = agentEditForm.allowedIPsText
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
      await api(`/api/admin/agents/${encodeURIComponent(modalAgent.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          type: agentEditForm.type,
          nickname: agentEditForm.nickname,
          callbackUrl: agentEditForm.callbackUrl || null,
          balance: Number(agentEditForm.balance) || 0,
          rate: Number(agentEditForm.rate) || 0,
          grade: agentEditForm.grade,
          memo: agentEditForm.memo.trim() || null,
          country: agentEditForm.country,
          isActive: agentEditForm.isActive,
          email: agentEditForm.email.trim() || null,
          phone: agentEditForm.phone.trim() || null,
          company: agentEditForm.company.trim() || null,
          allowedIPs,
          lastLogin: lastLoginIso,
          settingsJson: raw
        })
      })
      setStatus('에이전트 정보가 저장되었습니다.')
      const d = await api(`/api/admin/agents/${encodeURIComponent(modalAgent.id)}`)
      const ag = (d?.agent ?? d) as Record<string, unknown>
      setAgentEditForm(mapAgentToForm(ag))
      setAgentReadonly(extractAgentReadonly(ag))
      await loadAgentTree()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setAgentSaveBusy(false)
    }
  }

  const submitAddAgent = async () => {
    const parent = agentFlat.find(x => x.id === selectedAgentId)
    if (!parent?.id) {
      setError('트리에서 부모 에이전트를 선택하세요.')
      return
    }
    setAddAgentBusy(true)
    setError('')
    setStatus('')
    try {
      await api('/api/admin/agents/sub-agents', {
        method: 'POST',
        body: JSON.stringify({
          parentAgentId: parent.id,
          username: addAgentForm.username.trim(),
          password: addAgentForm.password,
          nickname: addAgentForm.nickname.trim(),
          rate: Number(addAgentForm.rate) || 0,
          grade: addAgentForm.grade.trim() || 'partner',
          memo: addAgentForm.memo.trim() || null
        })
      })
      setShowAddAgentModal(false)
      setAddAgentForm({ username: '', password: '', nickname: '', rate: '0', grade: 'partner', memo: '' })
      setStatus('하위 에이전트가 생성되었습니다.')
      await loadAgentTree()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setAddAgentBusy(false)
    }
  }

  const openAddSubAgentModal = (parent: Agent, e?: MouseEvent) => {
    e?.stopPropagation()
    setSelectedAgentId(parent.id)
    setError('')
    setShowAddAgentModal(true)
  }

  const deleteSubAgentAdmin = async (a: Agent, e?: MouseEvent) => {
    e?.stopPropagation()
    if (!a.parentId) {
      setError('최상위 에이전트는 삭제할 수 없습니다.')
      return
    }
    if (a.children?.length) {
      setError('하위 트리가 있는 에이전트는 삭제할 수 없습니다.')
      return
    }
    if (!window.confirm(`「${a.username}」 하위 에이전트를 삭제할까요? (하위 에이전트·소속 회원 없음, 잔액 0)`)) return
    setError('')
    try {
      await api(
        `/api/admin/agents/sub-agents/${encodeURIComponent(a.id)}?parentAgentId=${encodeURIComponent(a.parentId)}`,
        { method: 'DELETE' }
      )
      setStatus('에이전트가 삭제되었습니다.')
      await loadAgentTree()
    } catch (err: any) {
      setError(err?.message || String(err))
    }
  }

  const openAgentMoneyModal = (node: Agent, kind: 'give' | 'recall') => {
    if (!node.parentId && node.username !== 'admin') return
    setAgentMoneyTarget(node)
    setAgentMoneyKind(kind)
    setAgentMoneyAmount('')
    setShowAgentMoneyModal(true)
    setError('')
  }

  const submitAgentMoney = async () => {
    if (!agentMoneyTarget) return
    const amount = Number(agentMoneyAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('0보다 큰 금액을 입력하세요.')
      return
    }
    setAgentMoneyBusy(true)
    setError('')
    setStatus('')
    try {
      if (!agentMoneyTarget.parentId && agentMoneyTarget.username === 'admin') {
        await api('/api/admin/agent-money/admin-self-adjust', {
          method: 'POST',
          body: JSON.stringify({
            agentId: agentMoneyTarget.id,
            amount,
            mode: agentMoneyKind === 'give' ? 'add' : 'sub'
          })
        })
      } else {
        const path = agentMoneyKind === 'give' ? '/api/admin/agent-money/transfer' : '/api/admin/agent-money/recall'
        await api(path, {
          method: 'POST',
          body: JSON.stringify({
            parentAgentId: agentMoneyTarget.parentId,
            subAgentId: agentMoneyTarget.id,
            amount
          })
        })
      }
      setShowAgentMoneyModal(false)
      setAgentMoneyTarget(null)
      setStatus(
        !agentMoneyTarget.parentId && agentMoneyTarget.username === 'admin'
          ? agentMoneyKind === 'give'
            ? 'admin 잔액이 강제 지급 처리되었습니다.'
            : 'admin 잔액이 강제 회수 처리되었습니다.'
          : agentMoneyKind === 'give'
            ? '머니가 지급되었습니다.'
            : '머니가 회수되었습니다.'
      )
      await loadAgentTree()
      if (effectiveMenu === 'manage-users-point-moves') await loadAgentMoneyHistory(1)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setAgentMoneyBusy(false)
    }
  }

  const loadAgentMoneyHistory = async (pageNum = 1) => {
    setAgentMoneyHistLoading(true)
    setError('')
    try {
      const from = parseDateTimeFilterInput(agentMoneyHistFrom)
      const toEnd = endOfLocalCalendarDay(parseDateTimeFilterInput(agentMoneyHistTo) ?? new Date())
      if (!from) {
        throw new Error('날짜 형식은 yy-MM-dd HH:mm:ss 로 입력해 주세요.')
      }
      const q = new URLSearchParams({
        fromUtc: from.toISOString(),
        toUtc: toEnd.toISOString(),
        page: String(pageNum),
        perPage: '50'
      })
      const data = await api(`/api/admin/agent-money/history?${q}`)
      const rows = (data?.data ?? data?.Data ?? []) as Record<string, unknown>[]
      setAgentMoneyHistRows(sortRowsByUidDesc(Array.isArray(rows) ? rows : []))
      setAgentMoneyHistTotal(Number(data?.total ?? data?.Total ?? 0))
      setAgentMoneyHistPage(pageNum)
    } catch (e: any) {
      setError(e?.message || String(e))
      setAgentMoneyHistRows([])
      setAgentMoneyHistTotal(0)
    } finally {
      setAgentMoneyHistLoading(false)
    }
  }

  const submitAddUser = async () => {
    if (!addUserForm.agentUsername.trim() || !addUserForm.username.trim()) {
      setError('소속 에이전트와 회원 아이디를 입력하세요.')
      return
    }
    setAddUserBusy(true)
    setError('')
    setStatus('')
    try {
      await api('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          agentUsername: addUserForm.agentUsername.trim(),
          username: addUserForm.username.trim(),
          nickname: addUserForm.nickname.trim() || undefined
        })
      })
      setShowAddUserModal(false)
      setAddUserForm({ agentUsername: '', username: '', nickname: '' })
      setStatus('회원이 생성되었습니다.')
      await loadAllUsers()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setAddUserBusy(false)
    }
  }

  const deleteUserAdmin = async (u: UserItem, ev?: MouseEvent) => {
    ev?.stopPropagation()
    if (!window.confirm(`「${u.username}」 회원을 삭제할까요? (잔액·포인트 0만 가능)`)) return
    setError('')
    try {
      await api(
        `/api/admin/members?agentUsername=${encodeURIComponent(u.agentId || '')}&username=${encodeURIComponent(u.username)}`,
        { method: 'DELETE' }
      )
      setStatus('회원이 삭제되었습니다.')
      if (selectedUser?.username === u.username) setShowUserEdit(false)
      await loadAllUsers()
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  const loadUserDetailForModal = async (u: UserItem) => {
    setUserDetailRecord(null)
    setUserEditForm(fallbackUserFormFromList(u))
    setUserDetailLoading(true)
    try {
      const d = await api(
        `/api/admin/members/detail?agentUsername=${encodeURIComponent(u.agentId || '')}&username=${encodeURIComponent(u.username)}`
      )
      const raw = (d?.user ?? d) as Record<string, unknown> | null
      setUserDetailRecord(raw)
      if (raw && typeof raw === 'object') setUserEditForm(mapUserRecordToForm(raw))
    } catch {
      setUserDetailRecord(null)
    } finally {
      setUserDetailLoading(false)
    }
  }

  const saveUserMember = async () => {
    if (!selectedUser || !userEditForm) return
    setError('')
    setStatus('')
    setUserSaveBusy(true)
    try {
      JSON.parse(userEditForm.settingsJson.trim() || '{}')
      await api('/api/admin/members', {
        method: 'PUT',
        body: JSON.stringify({
          agentUsername: selectedUser.agentId || '',
          username: selectedUser.username,
          nickname: userEditForm.nickname,
          country: userEditForm.country,
          currencyCode: userEditForm.currencyCode,
          status: userEditForm.status,
          role: userEditForm.role,
          loginIp: userEditForm.loginIp.trim() || null,
          settingsJson: userEditForm.settingsJson.trim() || '{}'
        })
      })
      setStatus('회원 정보가 저장되었습니다.')
      await loadAllUsers()
      await loadUserDetailForModal(selectedUser)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setUserSaveBusy(false)
    }
  }

  const submitUserGive = async () => {
    if (!selectedUser) return
    const agentId = (selectedUser.agentId || '').trim()
    if (!agentId) {
      setError('회원 소속 에이전트 정보가 없어 지급할 수 없습니다.')
      return
    }
    const amt = Number(userGiveAmount)
    if (!Number.isFinite(amt) || amt < 1) {
      setError('지급 금액은 1 이상의 숫자로 입력해 주세요.')
      return
    }
    if (amt > selectedUserAgentBalance) {
      setShowUserGiveLimitWarning(true)
      return
    }
    const agentPart = `&agentUsername=${encodeURIComponent(agentId)}`
    const path = `/api/user/add-balance?username=${encodeURIComponent(selectedUser.username)}&amount=${encodeURIComponent(String(amt))}${agentPart}`
    setUserGiveBusy(true)
    setError('')
    setStatus('')
    try {
      await api(path, { method: 'POST' })
      setStatus('머니가 지급되었습니다.')
      setShowUserGiveModal(false)
      await loadAgentTree()
      await loadAllUsers()
      if (selectedUser) await loadUserDetailForModal(selectedUser)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setUserGiveBusy(false)
    }
  }

  const submitUserRecall = async () => {
    if (!selectedUser) return
    const agentId = (selectedUser.agentId || '').trim()
    if (!agentId) {
      setError('회원 소속 에이전트(agentId)가 없어 회수할 수 없습니다.')
      return
    }
    if (!userRecallFullAll) {
      const amt = Number(userRecallAmount)
      if (!Number.isFinite(amt) || amt < 1) {
        setError('회수 금액은 1 이상의 숫자로 입력해 주세요.')
        return
      }
      if (amt > selectedUserMemberBalance) {
        setShowUserRecallLimitWarning(true)
        return
      }
    }
    const agentPart = `&agentUsername=${encodeURIComponent(agentId)}`
    setUserRecallBusy(true)
    setError('')
    setStatus('')
    try {
      if (userRecallFullAll) {
        const path = `/api/user/sub-balance-all?username=${encodeURIComponent(selectedUser.username)}${agentPart}`
        await api(path, { method: 'POST' })
        setStatus('전체 회수 처리되었습니다.')
      } else {
        const amt = Number(userRecallAmount)
        const path = `/api/user/sub-balance?username=${encodeURIComponent(selectedUser.username)}&amount=${encodeURIComponent(String(amt))}${agentPart}`
        await api(path, { method: 'POST' })
        setStatus('회원 잔액에서 회수되었습니다.')
      }
      setShowUserRecallModal(false)
      await loadAgentTree()
      await loadAllUsers()
      if (selectedUser) await loadUserDetailForModal(selectedUser)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setUserRecallBusy(false)
    }
  }

  const issueModalApiKey = async () => {
    if (!modalAgent) return
    const data = await api('/api/auth/generate-token', { method: 'POST', body: JSON.stringify({ agentId: modalAgent.id }) })
    const key = data?.apiKey || data?.ApiKey || ''
    if (!key) throw new Error('API Key 응답값이 없습니다.')
    setModalApiKey(key)
    setStatus(`${modalAgent.username} API 키 발급 완료`)
    try {
      const d = await api(`/api/admin/agents/${encodeURIComponent(modalAgent.id)}`)
      const ag = (d?.agent ?? d) as Record<string, unknown>
      setAgentEditForm(mapAgentToForm(ag))
      setAgentReadonly(extractAgentReadonly(ag))
    } catch {
      /* ignore */
    }
  }

  const generateModalJoinLink = async () => {
    if (!modalApiKey) return setError('먼저 API 키를 발급해주세요.')
    setError('')
    setStatus('')
    const uid = modalTestUserId.trim() === '' ? `auto_${Date.now()}` : modalTestUserId.trim()
    const authHeader = modalApiKey.trim().startsWith('Bearer ') ? modalApiKey.trim() : `Bearer ${modalApiKey.trim()}`
    try {
      const res = await fetch(`${API_BASE_URL}/api/game-launch-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ username: uid })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.message || data?.error || `요청 실패 (${res.status})`
        const str = typeof msg === 'string' ? msg : String(msg)
        if (res.status === 403 && /ip/i.test(str)) {
          setError(`허용 IP가 아닙니다. 에이전트 허용 IP에 현재 접속 IP를 등록한 뒤 다시 시도하세요. (${str})`)
          return
        }
        throw new Error(str)
      }
      const link = data?.launchUrl || data?.gameLink || data?.url || data?.data?.url || ''
      if (!link) throw new Error('조인 링크 응답 필드가 없습니다.')
      setModalJoinLink(link)
      setStatus(`테스트 접속 링크 생성 완료 (userId: ${uid})`)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  const openModalJoinLinkInNewTab = () => {
    const url = modalJoinLink.trim()
    if (!url) {
      setError('먼저 링크 생성을 눌러 접속 URL을 만드세요.')
      return
    }
    setError('')
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyModalJoinLink = async () => {
    const url = modalJoinLink.trim()
    if (!url) {
      setError('먼저 링크 생성을 눌러 접속 URL을 만드세요.')
      return
    }
    setError('')
    try {
      await navigator.clipboard.writeText(url)
      setStatus('접속 URL을 클립보드에 복사했습니다.')
    } catch {
      setError('클립보드 복사에 실패했습니다. URL을 직접 선택해 복사해 주세요.')
    }
  }

  const checkSwagger = async () => {
    const res = await fetch(`${API_BASE_URL}/docs`, { redirect: 'follow' })
    setSwaggerOk(res.ok ? `정상 (${res.status})` : `실패 (${res.status})`)
  }

  const loadNiuniuTableStatus = async () => {
    setError('')
    const data = await api('/api/admin/system/niuniu-tables/status')
    setNiuniuTableCount(typeof data?.tableDocumentCount === 'number' ? data.tableDocumentCount : null)
  }

  const loadSystemConfigs = async () => {
    setSystemConfigLoading(true)
    setError('')
    try {
      const data = await api('/api/admin/system/system-config')
      const rows = (data.data ?? []) as Record<string, unknown>[]
      setSystemConfigDrafts(rows.map(rowToSystemConfigDraft))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSystemConfigLoading(false)
    }
  }

  const upsertSystemConfigRow = async (d: SystemConfigDraft, index: number) => {
    if (!d.param.trim()) {
      setError('항목 이름(파라미터)은 필수입니다.')
      return
    }
    const rowKey = d.id ?? `new-${index}`
    setSystemConfigBusyKey(rowKey)
    setError('')
    setStatus('')
    try {
      const isShowNum = (() => {
        const n = parseInt(d.isShow, 10)
        return Number.isFinite(n) ? n : 1
      })()
      const payload = {
        param: d.param.trim(),
        value: d.value,
        kind: d.kind,
        kindTitle: d.kindTitle,
        paramComment: d.paramComment,
        isShow: isShowNum
      }
      if (!d.id) {
        await api('/api/admin/system/system-config', { method: 'POST', body: JSON.stringify(payload) })
        setStatus('설정 항목이 추가되었습니다.')
      } else {
        await api(`/api/admin/system/system-config/${encodeURIComponent(d.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        setStatus('설정이 저장되었습니다.')
      }
      await loadSystemConfigs()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSystemConfigBusyKey(null)
    }
  }

  const deleteSystemConfigRow = async (d: SystemConfigDraft, index: number) => {
    if (!d.id) {
      setSystemConfigDrafts(rows => rows.filter((_, i) => i !== index))
      return
    }
    if (!window.confirm(`「${d.param}」 항목을 삭제할까요?`)) return
    setSystemConfigBusyKey(d.id)
    setError('')
    try {
      await api(`/api/admin/system/system-config/${encodeURIComponent(d.id)}`, { method: 'DELETE' })
      setStatus('삭제되었습니다.')
      await loadSystemConfigs()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSystemConfigBusyKey(null)
    }
  }

  const updateSystemConfigDraft = (index: number, patch: Partial<SystemConfigDraft>) => {
    setSystemConfigDrafts(rows => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const initNiuniuTables = async (replace: boolean) => {
    setNiuniuTableBusy(true)
    setError('')
    setStatus('')
    try {
      const data = await api(`/api/admin/system/niuniu-tables/initialize-defaults?replace=${replace ? 'true' : 'false'}`, {
        method: 'POST'
      })
      setStatus(data?.message || '처리 완료')
      await loadNiuniuTableStatus()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setNiuniuTableBusy(false)
    }
  }

  const loadAdminListData = async (pageNum = 1) => {
    setAdminLoading(true)
    setError('')
    try {
      const perPage = effectiveMenu === 'rooms-manage' ? 100 : 50
      if (effectiveMenu === 'users-ban') {
        const uid = adminUserIdFilter.trim() ? `&userId=${encodeURIComponent(adminUserIdFilter.trim())}` : ''
        const data = await api(`/api/admin/users/banned?page=${pageNum}&perPage=${perPage}${uid}`)
        setAdminRows(sortRowsByUidDesc((data.data ?? []) as Record<string, unknown>[]))
        setAdminTotal(data.total ?? 0)
        setAdminPage(pageNum)
        return
      }
      const q = utcDayRangeQuery(adminDayFrom, adminDayTo)
      const tableIdPart = historyTableIdFilter.trim() ? `&tableId=${encodeURIComponent(historyTableIdFilter.trim())}` : ''
      const gameIdPart = historyGameIdFilter.trim()
        ? `&gameId=${encodeURIComponent(historyGameIdFilter.trim())}&roundId=${encodeURIComponent(historyGameIdFilter.trim())}`
        : ''
      const statusPart = historyStatusFilter.trim() ? `&status=${encodeURIComponent(historyStatusFilter.trim())}` : ''
      const uid = adminUserIdFilter.trim() ? `&userId=${encodeURIComponent(adminUserIdFilter.trim())}` : ''
      const ticketSearchPart = adminUserIdFilter.trim()
        ? `&searchType=title&searchKeyword=${encodeURIComponent(adminUserIdFilter.trim())}`
        : ''
      let path = ''
      if (effectiveMenu === 'users-activity' || effectiveMenu === 'manage-users-live') {
        path = `/api/admin/data/login-histories?${q}&page=${pageNum}&perPage=${perPage}${uid}`
      } else if (effectiveMenu === 'game-user-betting' || effectiveMenu === 'manage-users-funds') {
        path = `/api/admin/data/bet-histories?${q}&page=${pageNum}&perPage=${perPage}${uid}${tableIdPart}${gameIdPart}${statusPart}`
      } else if (effectiveMenu === 'manage-history-transactions') {
        path = `/api/admin/data/bet-histories?${q}&page=${pageNum}&perPage=${perPage}${uid}${tableIdPart}${gameIdPart}${statusPart}`
      } else if (effectiveMenu === 'manage-history-abnormal') {
        const fromDt = parseDateTimeFilterInput(adminDayFrom) ?? new Date()
        let toEnd = endOfLocalCalendarDay(parseDateTimeFilterInput(adminDayTo) ?? new Date())
        if (fromDt.getTime() >= toEnd.getTime()) toEnd = new Date(fromDt.getTime() + 24 * 60 * 60 * 1000)
        path = `/api/ErrorLog?startDate=${encodeURIComponent(fromDt.toISOString())}&endDate=${encodeURIComponent(toEnd.toISOString())}&page=${pageNum}&perPage=${perPage}`
      } else if (effectiveMenu === 'manage-history-sessions') {
        path = `/api/admin/data/game-histories?${q}&page=${pageNum}&perPage=${perPage}${uid}${tableIdPart}${gameIdPart}${statusPart}`
      } else if (effectiveMenu === 'support-desk') {
        path = `/api/tickets?page=${pageNum}&perPage=${perPage}${statusPart}${ticketSearchPart}`
      } else if (effectiveMenu === 'manage-logs-transfer-api') {
        const fromDt = parseDateTimeFilterInput(adminDayFrom) ?? new Date()
        let toDt = endOfLocalCalendarDay(parseDateTimeFilterInput(adminDayTo) ?? new Date())
        if (fromDt.getTime() >= toDt.getTime()) toDt = new Date(fromDt.getTime() + 24 * 60 * 60 * 1000)
        const catQ = historyStatusFilter.trim() ? `&category=${encodeURIComponent(historyStatusFilter.trim())}` : ''
        path = `/api/TransferApiLog?page=${pageNum}&perPage=${perPage}&startDate=${encodeURIComponent(fromDt.toISOString())}&endDate=${encodeURIComponent(toDt.toISOString())}${uid}${catQ}`
      } else if (effectiveMenu === 'manage-logs-callback-errors') {
        const fromDt = parseDateTimeFilterInput(adminDayFrom) ?? new Date()
        let toDt = endOfLocalCalendarDay(parseDateTimeFilterInput(adminDayTo) ?? new Date())
        if (fromDt.getTime() >= toDt.getTime()) toDt = new Date(fromDt.getTime() + 24 * 60 * 60 * 1000)
        const statusQ = historyStatusFilter.trim() ? `&status=${encodeURIComponent(historyStatusFilter.trim())}` : ''
        path = `/api/SeamlessCallbackLog?page=${pageNum}&perPage=${perPage}&startDate=${encodeURIComponent(fromDt.toISOString())}&endDate=${encodeURIComponent(toDt.toISOString())}${uid}${statusQ}`
      } else if (effectiveMenu === 'rooms-manage') {
        path = `/api/admin/data/tables?page=${pageNum}&perPage=${perPage}`
        if (adminTableIdFilter.trim()) path += `&tableId=${encodeURIComponent(adminTableIdFilter.trim())}`
      } else return
      const data = await api(path)
      const rawRows = (
        effectiveMenu === 'manage-logs-transfer-api' || effectiveMenu === 'manage-logs-callback-errors'
          ? (data.data ?? data.logs ?? data.Data ?? data.Logs ?? [])
          : effectiveMenu === 'manage-history-abnormal'
            ? (data.logs ?? data.Logs ?? [])
            : (data.data ?? [])
      ) as Record<string, unknown>[]
      const list = Array.isArray(rawRows) ? rawRows : []
      if (effectiveMenu === 'manage-logs-transfer-api' || effectiveMenu === 'manage-logs-callback-errors') {
        setAdminRows(sortRowsByTimeFieldDesc(list, ['createdAt', 'updatedAt']))
      } else if (effectiveMenu === 'game-user-betting' || effectiveMenu === 'manage-history-transactions') {
        setAdminRows(sortRowsByTimeFieldDesc(list, ['betTime', 'BetTime', 'createdAt']))
      } else if (effectiveMenu === 'manage-history-sessions') {
        setAdminRows(sortRowsByTimeFieldDesc(list, ['lastUpdateTime', 'LastUpdateTime', 'betTime']))
      } else {
        setAdminRows(sortRowsByUidDesc(list))
      }
      {
        const t = data as { total?: unknown; totalCount?: unknown; TotalCount?: unknown }
        setAdminTotal(Number(t.total ?? t.totalCount ?? t.TotalCount ?? 0))
      }
      setAdminPage(pageNum)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setAdminLoading(false)
    }
  }

  const postBanAction = async (unban: boolean) => {
    setError('')
    setStatus('')
    try {
      await api(unban ? '/api/admin/users/unban' : '/api/admin/users/ban', {
        method: 'POST',
        body: JSON.stringify({ userKey: adminBanKey.trim() })
      })
      setStatus(unban ? '해제 처리됨' : '차단 처리됨')
      await loadAdminListData(1)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  const openTicketCreateModal = () => {
    setError('')
    setTicketCreateCategory('문의')
    setTicketCreateTitle('')
    setTicketCreateContent('')
    setShowTicketCreateModal(true)
  }

  const submitTicketCreate = async () => {
    const title = ticketCreateTitle.trim()
    const content = ticketCreateContent.trim()
    if (!title || !content) {
      setError('제목과 내용을 모두 입력하세요.')
      return
    }
    setTicketModalBusy(true)
    setError('')
    setStatus('')
    try {
      const fd = new FormData()
      fd.append('category', ticketCreateCategory.trim() || '문의')
      fd.append('title', title)
      fd.append('content', content)
      await api('/api/tickets', { method: 'POST', body: fd })
      setStatus('문의가 생성되었습니다.')
      setShowTicketCreateModal(false)
      await loadAdminListData(1)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setTicketModalBusy(false)
    }
  }

  const openTicketEditModal = (row: Record<string, unknown>) => {
    setError('')
    setTicketEditRow(row)
    setTicketEditStatus(String(row.status ?? 'created'))
    setTicketEditReply('')
    setShowTicketEditModal(true)
  }

  const submitTicketEdit = async () => {
    if (!ticketEditRow) return
    const id = String(ticketEditRow.id ?? ticketEditRow._id ?? '').trim()
    if (!id) return
    const nextStatus = ticketEditStatus.trim()
    if (!nextStatus) {
      setError('상태를 선택하세요.')
      return
    }
    const reply = ticketEditReply.trim()
    setTicketModalBusy(true)
    setError('')
    setStatus('')
    try {
      await api(`/api/tickets/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      })
      if (reply) {
        await api(`/api/tickets/${encodeURIComponent(id)}/replies`, {
          method: 'POST',
          body: JSON.stringify({ content: reply, attachments: [] })
        })
      }
      setStatus('문의 상태/답변이 저장되었습니다.')
      setShowTicketEditModal(false)
      setTicketEditRow(null)
      await loadAdminListData(adminPage)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setTicketModalBusy(false)
    }
  }

  const openTicketDeleteModal = (row: Record<string, unknown>) => {
    setTicketDeleteRow(row)
    setShowTicketDeleteModal(true)
  }

  const confirmTicketDelete = async () => {
    if (!ticketDeleteRow) return
    const id = String(ticketDeleteRow.id ?? ticketDeleteRow._id ?? '').trim()
    if (!id) return
    setTicketModalBusy(true)
    setError('')
    setStatus('')
    try {
      await api(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setStatus('문의가 삭제되었습니다.')
      setShowTicketDeleteModal(false)
      setTicketDeleteRow(null)
      await loadAdminListData(Math.max(1, adminPage))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setTicketModalBusy(false)
    }
  }

  const openRoomModalCreate = () => {
    setError('')
    setRoomModalMode('create')
    setRoomForm(emptyRoomForm())
    setShowRoomModal(true)
  }

  const openRoomModalEdit = (row: Record<string, unknown>) => {
    setError('')
    setRoomModalMode('edit')
    setRoomForm(rowToRoomForm(row))
    setShowRoomModal(true)
  }

  const saveRoomModal = async () => {
    if (roomModalMode === 'create') {
      if (!roomForm.tableId.trim() || !roomForm.tableName.trim()) {
        setError('룸 ID와 룸명을 입력하세요.')
        return
      }
      setRoomSaveBusy(true)
      setError('')
      try {
        await api('/api/admin/data/tables', {
          method: 'POST',
          body: JSON.stringify({
            tableId: roomForm.tableId.trim(),
            tableName: roomForm.tableName.trim(),
            gameType: roomForm.gameType.trim() || 'NIUNIU',
            gameKind: roomForm.gameKind.trim() || 'STANDARD',
            minPlayers: Number(roomForm.minPlayers) || 1,
            minBet: Number(roomForm.minBet) || 0,
            maxBet: Number(roomForm.maxBet) || 0,
            isActive: roomForm.isActive,
            isDemo: roomForm.isDemo,
            stream1: roomForm.stream1.trim() || null,
            stream2: roomForm.stream2.trim() || null,
            stream3: roomForm.stream3.trim() || null,
            thumb1: roomForm.thumb1.trim() || null,
            thumb2: roomForm.thumb2.trim() || null,
            thumb3: roomForm.thumb3.trim() || null
          })
        })
        setStatus('게임룸이 추가되었습니다.')
        setShowRoomModal(false)
        await loadAdminListData(adminPage)
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setRoomSaveBusy(false)
      }
      return
    }
    if (!roomForm.mongoId) {
      setError('저장할 항목 식별 정보가 없습니다.')
      return
    }
    setRoomSaveBusy(true)
    setError('')
    try {
      await api(`/api/admin/data/tables/${encodeURIComponent(roomForm.mongoId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          tableName: roomForm.tableName.trim(),
          gameType: roomForm.gameType.trim(),
          gameKind: roomForm.gameKind.trim(),
          minPlayers: Number(roomForm.minPlayers) || 1,
          minBet: Number(roomForm.minBet),
          maxBet: Number(roomForm.maxBet),
          isActive: roomForm.isActive,
          isDemo: roomForm.isDemo,
          stream1: roomForm.stream1.trim() || null,
          stream2: roomForm.stream2.trim() || null,
          stream3: roomForm.stream3.trim() || null,
          thumb1: roomForm.thumb1.trim() || null,
          thumb2: roomForm.thumb2.trim() || null,
          thumb3: roomForm.thumb3.trim() || null
        })
      })
      setStatus('게임룸이 저장되었습니다.')
      setShowRoomModal(false)
      await loadAdminListData(adminPage)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setRoomSaveBusy(false)
    }
  }

  const deleteRoomRow = async (row: Record<string, unknown>, e?: MouseEvent) => {
    e?.stopPropagation()
    const idVal = row.id ?? row._id ?? row.Id
    const tid = String(row.tableId ?? row.TableId ?? '')
    if (idVal == null || String(idVal) === '') {
      setError('삭제할 항목을 찾을 수 없습니다.')
      return
    }
    if (!window.confirm(`룸 「${tid || '알 수 없음'}」를 삭제할까요?`)) return
    setError('')
    try {
      await api(`/api/admin/data/tables/${encodeURIComponent(String(idVal))}`, { method: 'DELETE' })
      setStatus('게임룸이 삭제되었습니다.')
      setShowRoomModal(false)
      await loadAdminListData(adminPage)
    } catch (err: any) {
      setError(err?.message || String(err))
    }
  }

  useEffect(() => {
    if (effectiveMenu !== 'rooms-manage') setShowRoomModal(false)
  }, [menu, effectiveMenu])

  useEffect(() => {
    if (!jwt || effectiveMenu !== 'system-config') return
    void loadNiuniuTableStatus().catch(e => setError(e?.message || String(e)))
    void loadSystemConfigs().catch(e => setError(e?.message || String(e)))
  }, [jwt, menu, effectiveMenu])

  useEffect(() => {
    if (!jwt) return
    if (!ADMIN_DATA_MENUS.includes(effectiveMenu as (typeof ADMIN_DATA_MENUS)[number])) return
    setAdminPage(1)
    void loadAdminListData(1).catch(e => setError(e?.message || String(e)))
  }, [jwt, menu, effectiveMenu])

  const handleRefresh = () => {
    if (effectiveMenu === 'agents-list') void loadAgentTree().catch(e => setError(e?.message || String(e)))
    else if (effectiveMenu === 'manage-users-point-moves')
      void loadAgentMoneyHistory(agentMoneyHistPage).catch(e => setError(e?.message || String(e)))
    else if (effectiveMenu === 'users-list') void loadAllUsers().catch(e => setError(e?.message || String(e)))
    else if (effectiveMenu === 'system-config') {
      void loadNiuniuTableStatus().catch(e => setError(e?.message || String(e)))
      void loadSystemConfigs().catch(e => setError(e?.message || String(e)))
    }
    else if (ADMIN_DATA_MENUS.includes(effectiveMenu as (typeof ADMIN_DATA_MENUS)[number]))
      void loadAdminListData(adminPage).catch(e => setError(e?.message || String(e)))
  }

  if (!jwt) {
    return (
      <>
        <AlertModal
          open={!!error}
          variant='danger'
          title='로그인 오류'
          message={formatUserFacingMessage(error)}
          onClose={() => setError('')}
        />
      <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4'>
        <div className='w-full max-w-[400px]'>
          <div className='mb-8 text-center'>
            <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15'>
              <Shield className='h-6 w-6' strokeWidth={1.75} />
            </div>
            <h1 className='text-xl font-semibold tracking-tight text-slate-900'>
              ZENITHPARK <span className='font-normal text-slate-500'>API Admin</span>
            </h1>
            <p className='mt-1 text-sm text-slate-500'>Office 콘솔</p>
          </div>
          <div className='rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-900/5'>
            <p className='mb-6 text-center text-sm text-slate-600'>관리자 계정으로 로그인하세요</p>
            <div className='mb-4'>
              <label className='mb-1.5 block text-xs font-medium text-slate-600'>Username</label>
              <div className='relative'>
                <User className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                <input
                  type='text'
                  className='form-control ps-10'
                  placeholder='아이디'
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete='username'
                />
              </div>
            </div>
            <div className='mb-4'>
              <label className='mb-1.5 block text-xs font-medium text-slate-600'>Password</label>
              <div className='relative'>
                <Lock className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                <input
                  type='password'
                  className='form-control ps-10'
                  placeholder='비밀번호'
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void login()}
                  autoComplete='current-password'
                />
              </div>
            </div>
            <button
              type='button'
              className='btn btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-medium shadow-sm'
              onClick={() => void login()}
            >
              <LogIn className='h-4 w-4' />
              로그인
            </button>
          </div>
          <p className='mt-6 text-center text-xs text-slate-400'>운영 콘솔</p>
        </div>
      </div>
      </>
    )
  }

  return (
    <>
      <AlertModal
        open={!!error || !!status}
        variant={error ? 'danger' : 'success'}
        title={error ? '오류' : '알림'}
        message={formatUserFacingMessage(error || status)}
        onClose={() => {
          setError('')
          setStatus('')
        }}
      />
      <div className='flex min-h-screen bg-[#f4f6fb]'>
      <aside className='flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-[1px_0_0_rgba(15,23,42,0.04)]'>
        <div className='flex h-14 items-center gap-2.5 border-b border-slate-100 px-4'>
          <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white'>
            <Shield className='h-[18px] w-[18px]' strokeWidth={2} />
          </div>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold tracking-tight text-slate-900'>ZENITHPARK</div>
            <div className='text-[11px] font-medium uppercase tracking-wider text-slate-400'>Admin</div>
          </div>
        </div>
        <nav className='flex-1 overflow-y-auto px-2 py-3' aria-label='메인 메뉴'>
          {MENU_SECTIONS.map(section => {
            const SecIcon = section.icon
            return (
              <Fragment key={section.title}>
                <div className='flex items-center gap-2 px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:pt-0'>
                  <SecIcon className='h-3.5 w-3.5 opacity-70' strokeWidth={2} />
                  {section.title}
                </div>
                {section.groups.map((group, gi) => (
                  <Fragment key={`${section.title}-g${gi}`}>
                    {group.title && (
                      <div className='px-3 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-slate-500 first:pt-0'>
                        {group.title}
                      </div>
                    )}
                    <ul className='m-0 list-none space-y-0.5 p-0'>
                      {group.items.map(item => (
                        <li key={item.key}>
                          <button
                            type='button'
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              menu === item.key
                                ? 'bg-slate-900 font-medium text-white shadow-sm'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                            onClick={() => setMenu(item.key)}
                          >
                            <span>{item.label}</span>
                            {!item.enabled && (
                              <span className='rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'>준비중</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Fragment>
                ))}
              </Fragment>
            )
          })}
        </nav>
      </aside>

      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md md:px-6'>
          <div className='flex min-w-0 items-center gap-3'>
            <span className='hidden rounded-lg border border-slate-200 p-2 text-slate-500 md:inline-flex' aria-hidden>
              <Menu className='h-4 w-4' />
            </span>
            <div className='min-w-0'>
              <h1 className='truncate text-base font-semibold text-slate-900'>{pageTitle}</h1>
              {breadcrumbSubline && <p className='truncate text-xs text-slate-500'>{breadcrumbSubline}</p>}
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <div className='hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 md:inline-flex'>
              <span className='tabular-nums'>{formatClockYyMmDdHhMmSs(clockNow)}</span>
            </div>
            <div className='hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 md:inline-flex'>
              admin 잔액: <span className='ms-1 tabular-nums'>{formatNumberWithCommas(adminBalance)}</span>
            </div>
            <button
              type='button'
              className='btn btn-outline-secondary btn-sm inline-flex items-center gap-1.5 rounded-lg border-slate-200'
              onClick={handleRefresh}
            >
              <RefreshCw className='h-3.5 w-3.5' />
              {labels.refresh}
            </button>
            <button
              type='button'
              className='btn btn-outline-danger btn-sm inline-flex items-center gap-1.5 rounded-lg'
              onClick={logout}
            >
              <LogOut className='h-3.5 w-3.5' />
              {labels.logout}
            </button>
          </div>
        </header>

        <div className='border-b border-slate-200/60 bg-white/60 px-4 py-3 md:px-6'>
          <nav className='text-xs text-slate-500' aria-label='breadcrumb'>
            <ol className='m-0 flex flex-wrap items-center gap-1.5 p-0 list-none'>
              <li>
                <span className='text-slate-400'>Home</span>
              </li>
              {breadcrumbTrail && (
                <>
                  <li className='text-slate-300'>/</li>
                  <li>{breadcrumbTrail.sectionTitle}</li>
                </>
              )}
              {breadcrumbTrail?.groupTitle && (
                <>
                  <li className='text-slate-300'>/</li>
                  <li>{breadcrumbTrail.groupTitle}</li>
                </>
              )}
              <li className='text-slate-300'>/</li>
              <li className='font-medium text-slate-800'>{pageTitle}</li>
            </ol>
          </nav>
        </div>

        <main className='min-h-0 flex-1 overflow-y-auto'>
          <div className='container-fluid max-w-[1600px] px-4 py-6 md:px-6'>
            {effectiveMenu === 'agents-list' && (
              <section className='card mb-3 rounded-xl border border-slate-200/90 shadow-sm'>
                <div className='card-header flex flex-wrap items-center justify-content-between gap-2 border-b border-slate-100 bg-slate-50/80 py-3'>
                  <div>
                    <h3 className='card-title m-0 text-lg font-semibold text-slate-900'>에이전트 목록</h3>
                    <p className='mb-0 mt-1 text-xs text-slate-500'>
                      노드의 <strong>+</strong> 버튼으로 하위 에이전트를 추가하고, <strong>x</strong> 버튼으로 삭제합니다. 두 번 클릭으로 상세·편집.
                    </p>
                  </div>
                  <div className='card-tools d-flex flex-wrap align-items-center gap-2'>
                    <span className='rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600'>
                      트리·목록 통합
                    </span>
                  </div>
                </div>
                <div className='card-body pt-3'>
                  <p className='mb-3 text-sm text-slate-600'>
                    왼쪽은 트리(접기·펼치기)와 아이디·닉네임이 한 줄에 묶여 있고, 오른쪽은 등급·요율·회원 수·상태가 이어집니다.{' '}
                    <strong>지급</strong>은 상위 에이전트 잔액에서 하위로, <strong>회수</strong>는 하위에서 상위로 이동합니다.                     이력은{' '}
                    <strong>머니 이력</strong> 메뉴에서 조회합니다. 삭제는 하위 에이전트·소속 회원이 없고 잔액이 0일 때만 가능합니다.
                  </p>
                  <AgentTreeGrid
                    nodes={agentRoots}
                    selectedId={selectedAgentId}
                    onSelectRow={(a, mode) => {
                      setSelectedAgentId(a.id)
                      if (mode === 'open') void openAgentModal(a)
                    }}
                    onDeleteRow={deleteSubAgentAdmin}
                    onMoneyAction={(node, kind) => openAgentMoneyModal(node, kind)}
                    onAddSubAgent={(node, e) => openAddSubAgentModal(node, e)}
                  />
                </div>
              </section>
            )}

            {effectiveMenu === 'manage-users-point-moves' && (
              <section className='card mb-3 rounded-xl border border-slate-200/90 shadow-sm'>
                <div className='card-header flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 py-3'>
                  <span className='rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600'>
                    이력
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='font-semibold text-slate-900'>머니 이력</div>
                    <div className='text-muted small fw-normal text-slate-500'>
                      상·하위 에이전트 간 지급·회수 내역입니다.
                    </div>
                  </div>
                </div>
                <div className='card-body'>
                  <EditablePanel title='필터' className='mb-3'>
                    <div className='row g-2 align-items-end'>
                      <div className='col-12 col-md-4'>
                        <AdminDateTimeFilter
                          id='agent-money-hist-from'
                          label='시작일시'
                          value={agentMoneyHistFrom}
                          onChange={setAgentMoneyHistFrom}
                        />
                      </div>
                      <div className='col-12 col-md-4'>
                        <AdminDateTimeFilter
                          id='agent-money-hist-to'
                          label='종료일시'
                          value={agentMoneyHistTo}
                          onChange={setAgentMoneyHistTo}
                          endOfDay
                        />
                      </div>
                      <div className='col-12 col-md-4'>
                        <button
                          type='button'
                          className='btn btn-primary w-100'
                          disabled={agentMoneyHistLoading}
                          onClick={() => void loadAgentMoneyHistory(1)}
                        >
                          조회
                        </button>
                      </div>
                    </div>
                  </EditablePanel>

                  {agentMoneyHistLoading && <p className='text-muted small mb-2'>불러오는 중…</p>}

                  <div className='admin-console-grid w-100'>
                    <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                      <div style={{ minWidth: '920px' }} className='overflow-hidden rounded-xl'>
                        <div
                          className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                          style={{
                            gridTemplateColumns:
                              'minmax(108px,1fr) minmax(56px,0.55fr) minmax(72px,0.85fr) minmax(88px,0.95fr) minmax(72px,0.75fr) minmax(72px,0.75fr) minmax(52px,0.55fr) 24px',
                            gap: '0.35rem 0.45rem',
                            fontSize: '0.72rem'
                          }}
                        >
                          <span>일시</span>
                          <span>유형</span>
                          <span>아이디</span>
                          <span>에이전트</span>
                          <span className='text-end'>금액</span>
                          <span className='text-end'>처리 전</span>
                          <span>상태</span>
                          <span />
                        </div>
                        {!agentMoneyHistLoading && agentMoneyHistRows.length === 0 ? (
                          <p className='text-muted small mb-0 p-3 text-center'>조회 결과가 없습니다. 필터를 바꾼 뒤 조회하세요.</p>
                        ) : (
                          agentMoneyHistRows.map((row, i) => {
                            const rid = String(row.id ?? row._id ?? i)
                            const dt = row.createdAt
                              ? formatKstDateTimeLabel(String(row.createdAt))
                              : row.CreatedAt
                                ? formatKstDateTimeLabel(String(row.CreatedAt))
                                : '—'
                            const st = String(row.status ?? row.Status ?? '')
                            return (
                              <div
                                key={rid}
                                className='w-100 border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row'
                                style={{
                                  gridTemplateColumns:
                                    'minmax(108px,1fr) minmax(56px,0.55fr) minmax(72px,0.85fr) minmax(88px,0.95fr) minmax(72px,0.75fr) minmax(72px,0.75fr) minmax(52px,0.55fr) 24px',
                                  gap: '0.35rem 0.45rem',
                                  fontSize: '0.78rem'
                                }}
                              >
                                <span className='text-truncate small text-slate-600' title={dt}>
                                  {dt}
                                </span>
                                <span>
                                  <code className='small text-truncate d-inline-block max-w-100' title={String(row.type ?? row.Type ?? '')}>
                                    {String(row.type ?? row.Type ?? '—')}
                                  </code>
                                </span>
                                <span className='text-truncate' title={String(row.username ?? row.Username ?? '')}>
                                  {String(row.username ?? row.Username ?? '—')}
                                </span>
                                <span className='text-truncate small' title={formatMoneyHistoryAgentDisplay(row, agentIdToUsername)}>
                                  {formatMoneyHistoryAgentDisplay(row, agentIdToUsername)}
                                </span>
                                <span className='text-end tabular-nums'>
                                  {formatNumberWithCommas(String(row.amount ?? row.Amount ?? '0'))}
                                </span>
                                <span className='text-end tabular-nums'>
                                  {formatNumberWithCommas(String(row.before ?? row.Before ?? '0'))}
                                </span>
                                <span className='text-truncate small' title={st}>
                                  {st ? (
                                    <span className='rounded px-1.5 py-0.5 small fw-bold bg-slate-100 text-slate-800 ring-1 ring-slate-200'>
                                      {st}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </span>
                                <span className='text-slate-300 d-flex align-items-center justify-content-end' aria-hidden>
                                  <ChevronRight className='h-3.5 w-3.5' />
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {agentMoneyHistTotal > 0 && (
                    <div className='d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3'>
                      <span className='text-muted small'>
                        총 {agentMoneyHistTotal}건 · 페이지 {agentMoneyHistPage} /{' '}
                        {Math.max(1, Math.ceil(agentMoneyHistTotal / 50))}
                      </span>
                      <div className='btn-group'>
                        <button
                          type='button'
                          className='btn btn-sm btn-outline-secondary'
                          disabled={agentMoneyHistPage <= 1 || agentMoneyHistLoading}
                          onClick={() => void loadAgentMoneyHistory(agentMoneyHistPage - 1)}
                        >
                          이전
                        </button>
                        <button
                          type='button'
                          className='btn btn-sm btn-outline-secondary'
                          disabled={
                            agentMoneyHistLoading || agentMoneyHistPage * 50 >= agentMoneyHistTotal
                          }
                          onClick={() => void loadAgentMoneyHistory(agentMoneyHistPage + 1)}
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {effectiveMenu === 'users-list' && (
              <section className='card mb-3 rounded-xl border border-slate-200/90 shadow-sm'>
                <div className='card-header flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 py-3'>
                  <span className='rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600'>
                    정보
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='font-semibold text-slate-900'>유저 목록</div>
                    <div className='text-muted small fw-normal text-slate-500'>검색·필터로 좁힌 뒤 편집·삭제합니다.</div>
                  </div>
                  <button
                    type='button'
                    className='btn btn-sm btn-success'
                    onClick={() => {
                      setError('')
                      setAddUserForm(f => ({
                        ...f,
                        agentUsername: filterAgent.trim() || agentUsernames[0] || ''
                      }))
                      setShowAddUserModal(true)
                    }}
                  >
                    회원 추가
                  </button>
                </div>
                <div className='card-body'>
                  <EditablePanel title='검색·필터' className='mb-3'>
                    <div className='row g-2'>
                      <div className='col-12 col-md-4'>
                        <input
                          className='form-control'
                          placeholder='아이디/닉네임 검색'
                          value={filterText}
                          onChange={e => setFilterText(e.target.value)}
                        />
                      </div>
                      <div className='col-12 col-md-3'>
                        <input
                          className='form-control'
                          placeholder='에이전트 아이디'
                          value={filterAgent}
                          onChange={e => setFilterAgent(e.target.value)}
                        />
                      </div>
                      <div className='col-6 col-md-2'>
                        <input
                          className='form-control'
                          type='number'
                          placeholder='최소 잔액'
                          value={filterMinBalance}
                          onChange={e => setFilterMinBalance(e.target.value)}
                        />
                      </div>
                      <div className='col-6 col-md-2'>
                        <input
                          className='form-control'
                          type='number'
                          placeholder='최대 잔액'
                          value={filterMaxBalance}
                          onChange={e => setFilterMaxBalance(e.target.value)}
                        />
                      </div>
                    </div>
                  </EditablePanel>

                  <div className='admin-console-grid w-100'>
                    <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                      <div style={{ minWidth: '960px' }} className='overflow-hidden rounded-xl'>
                        <div
                          className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                          style={{
                            gridTemplateColumns:
                              'minmax(72px,1fr) minmax(56px,0.85fr) minmax(64px,0.65fr) minmax(72px,0.9fr) minmax(108px,1.1fr) minmax(220px,1.2fr) 24px',
                            gap: '0.35rem 0.45rem',
                            fontSize: '0.72rem'
                          }}
                        >
                          <span>아이디</span>
                          <span>닉네임</span>
                          <span className='text-end'>잔액</span>
                          <span>에이전트</span>
                          <span>생성일시</span>
                          <span className='text-end'>작업</span>
                          <span />
                        </div>
                        {filteredUsers.length === 0 ? (
                          <p className='text-muted small mb-0 p-3'>조건에 맞는 회원이 없습니다.</p>
                        ) : (
                          filteredUsers.map(u => {
                            const created = u.createdAt ? formatKstDateTimeLabel(u.createdAt) : '—'
                            return (
                              <div
                                key={`${u.agentId}:${u.username}`}
                                className='d-flex w-100 align-items-stretch border-0 border-bottom border-slate-200 bg-white'
                              >
                                <button
                                  type='button'
                                  className='min-w-0 flex-grow-1 border-0 bg-transparent py-2 px-2 px-lg-3 text-start text-body game-history-compact-row hover:bg-slate-50 d-grid align-items-center'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(72px,1fr) minmax(56px,0.85fr) minmax(64px,0.65fr) minmax(72px,0.9fr) minmax(108px,1.1fr)',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  onClick={() => {
                                    setSelectedUser(u)
                                    setUserEditForm(fallbackUserFormFromList(u))
                                    setShowUserEdit(true)
                                    void loadUserDetailForModal(u)
                                  }}
                                >
                                  <span className='fw-semibold text-truncate' title={u.username}>
                                    {u.username}
                                  </span>
                                  <span className='text-truncate' title={u.nickname || ''}>
                                    {u.nickname || '—'}
                                  </span>
                                  <span className='text-end tabular-nums'>{formatNumberWithCommas(u.balance ?? 0)}</span>
                                  <span className='text-truncate small'>
                                    {resolveAgentObjectIdToUsername(u.agentId, agentIdToUsername)}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={created}>
                                    {created}
                                  </span>
                                </button>
                                <div
                                  className='d-flex flex-wrap align-items-center justify-content-end gap-1 border-start border-slate-100 bg-slate-50/40 py-1.5 px-2'
                                  style={{ maxWidth: 280 }}
                                  onClick={e => e.stopPropagation()}
                                  onKeyDown={e => e.stopPropagation()}
                                >
                                  <button
                                    type='button'
                                    className='btn btn-sm btn-outline-primary'
                                    onClick={() => {
                                      setSelectedUser(u)
                                      setUserEditForm(fallbackUserFormFromList(u))
                                      setShowUserEdit(true)
                                      void loadUserDetailForModal(u)
                                    }}
                                  >
                                    편집
                                  </button>
                                  <button
                                    type='button'
                                    className='btn btn-sm btn-success'
                                    onClick={() => {
                                      setSelectedUser(u)
                                      setUserGiveAmount('0')
                                      setShowUserGiveModal(true)
                                      void loadUserDetailForModal(u)
                                    }}
                                  >
                                    지급
                                  </button>
                                  <button
                                    type='button'
                                    className='btn btn-sm btn-warning'
                                    onClick={() => {
                                      setSelectedUser(u)
                                      setUserRecallAmount('0')
                                      setUserRecallFullAll(false)
                                      setShowUserRecallModal(true)
                                      void loadUserDetailForModal(u)
                                    }}
                                  >
                                    회수
                                  </button>
                                  <button
                                    type='button'
                                    className='btn btn-sm btn-outline-danger'
                                    onClick={e => void deleteUserAdmin(u, e)}
                                  >
                                    삭제
                                  </button>
                                </div>
                                <div className='d-flex align-items-center px-1 text-slate-300' aria-hidden>
                                  <ChevronRight className='h-3.5 w-3.5' />
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {(ADMIN_DATA_MENUS as readonly string[]).includes(effectiveMenu) && (
              <div className='card mb-3 rounded-xl border border-slate-200/90 shadow-sm'>
                <div className='card-header d-flex flex-wrap justify-content-between align-items-center gap-2 border-b border-slate-100 bg-slate-50/80 py-3'>
                  <h3 className='card-title m-0 text-lg font-semibold text-slate-900'>{pageTitle}</h3>
                  <div className='d-flex flex-wrap gap-2'>
                    {effectiveMenu === 'rooms-manage' && (
                      <button type='button' className='btn btn-sm btn-success inline-flex items-center gap-1' onClick={openRoomModalCreate}>
                        <Plus className='h-3.5 w-3.5' aria-hidden />
                        추가
                      </button>
                    )}
                    {effectiveMenu === 'support-desk' && (
                      <button type='button' className='btn btn-sm btn-success inline-flex items-center gap-1' onClick={() => openTicketCreateModal()}>
                        <Plus className='h-3.5 w-3.5' aria-hidden />
                        문의 추가
                      </button>
                    )}
                    <button
                      type='button'
                      className='btn btn-sm btn-outline-primary'
                      disabled={adminLoading}
                      onClick={() => void loadAdminListData(1)}
                    >
                      조회
                    </button>
                  </div>
                </div>
                <div className='card-body'>
                  {effectiveMenu === 'users-ban' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>userId / username 검색</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='부분 검색'
                        />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>차단·해제 대상 (userKey)</label>
                        <input
                          className='form-control'
                          value={adminBanKey}
                          onChange={e => setAdminBanKey(e.target.value)}
                          placeholder='username 또는 userId'
                        />
                      </div>
                      <div className='col-12 col-md-4 d-flex align-items-end gap-2 flex-wrap'>
                        <button
                          type='button'
                          className='btn btn-danger'
                          disabled={adminLoading || !adminBanKey.trim()}
                          onClick={() => void postBanAction(false)}
                        >
                          차단
                        </button>
                        <button
                          type='button'
                          className='btn btn-outline-success'
                          disabled={adminLoading || !adminBanKey.trim()}
                          onClick={() => void postBanAction(true)}
                        >
                          해제
                        </button>
                      </div>
                    </div>
                  ) : effectiveMenu === 'rooms-manage' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>테이블 ID</label>
                        <input
                          className='form-control'
                          value={adminTableIdFilter}
                          onChange={e => setAdminTableIdFilter(e.target.value)}
                          placeholder='전체 — 설정 컬렉션(tables), 날짜 필터 없음'
                        />
                      </div>
                    </div>
                  ) : effectiveMenu === 'manage-history-abnormal' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='abnormal-from' label='시작일시' value={adminDayFrom} onChange={setAdminDayFrom} />
                      </div>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='abnormal-to' label='종료일시' value={adminDayTo} onChange={setAdminDayTo} endOfDay />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>키워드 (클라이언트 필터)</label>
                        <input
                          className='form-control'
                          value={abnormalKeyword}
                          onChange={e => setAbnormalKeyword(e.target.value)}
                          placeholder='메시지·엔드포인트·에러유형 등'
                        />
                      </div>
                      <div className='col-12 col-md-4 d-flex align-items-end'>
                        <div className='form-check mb-2'>
                          <input
                            className='form-check-input'
                            type='checkbox'
                            id='abnormalOnlyFailed'
                            checked={abnormalOnlyFailed}
                            onChange={e => setAbnormalOnlyFailed(e.target.checked)}
                          />
                          <label className='form-check-label' htmlFor='abnormalOnlyFailed'>
                            미해결·ERROR/CRITICAL만
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : effectiveMenu === 'manage-history-transactions' ||
                    effectiveMenu === 'manage-history-sessions' ||
                    effectiveMenu === 'game-user-betting' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='hist-sess-from' label='시작일시' value={adminDayFrom} onChange={setAdminDayFrom} />
                      </div>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='hist-sess-to' label='종료일시' value={adminDayTo} onChange={setAdminDayTo} endOfDay />
                      </div>
                      <div className='col-12 col-md-3'>
                        <label className='form-label small mb-0'>유저 ID</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='부분 검색 (선택)'
                        />
                      </div>
                      <div className='col-12 col-md-2'>
                        <label className='form-label small mb-0'>테이블 ID</label>
                        <input
                          className='form-control'
                          value={historyTableIdFilter}
                          onChange={e => setHistoryTableIdFilter(e.target.value)}
                          placeholder='부분 검색'
                        />
                      </div>
                      <div className='col-12 col-md-3'>
                        <label className='form-label small mb-0'>게임 ID / 라운드 ID</label>
                        <input
                          className='form-control'
                          value={historyGameIdFilter}
                          onChange={e => setHistoryGameIdFilter(e.target.value)}
                          placeholder='부분 검색'
                        />
                      </div>
                      <div className='col-12 col-md-3'>
                        <label className='form-label small mb-0'>상태</label>
                        <input
                          className='form-control'
                          value={historyStatusFilter}
                          onChange={e => setHistoryStatusFilter(e.target.value)}
                          placeholder='예: CONFIRMED / WIN'
                        />
                      </div>
                    </div>
                  ) : effectiveMenu === 'support-desk' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-12 col-md-3'>
                        <label className='form-label small mb-0'>상태</label>
                        <input
                          className='form-control'
                          value={historyStatusFilter}
                          onChange={e => setHistoryStatusFilter(e.target.value)}
                          placeholder='created / processing / completed …'
                        />
                      </div>
                      <div className='col-12 col-md-5'>
                        <label className='form-label small mb-0'>키워드</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='제목/내용/작성자'
                        />
                      </div>
                    </div>
                  ) : effectiveMenu === 'manage-logs-transfer-api' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='transfer-from' label='시작일시' value={adminDayFrom} onChange={setAdminDayFrom} />
                      </div>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='transfer-to' label='종료일시' value={adminDayTo} onChange={setAdminDayTo} endOfDay />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>검색 (엔드포인트·쿼리)</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='경로·username 등 부분 검색'
                        />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>카테고리</label>
                        <input
                          className='form-control'
                          value={historyStatusFilter}
                          onChange={e => setHistoryStatusFilter(e.target.value)}
                          placeholder='예: Money, User, Agent (선택)'
                        />
                      </div>
                    </div>
                  ) : effectiveMenu === 'manage-logs-callback-errors' ? (
                    <div className='row g-2 mb-3'>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='seamless-from' label='시작일시' value={adminDayFrom} onChange={setAdminDayFrom} />
                      </div>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='seamless-to' label='종료일시' value={adminDayTo} onChange={setAdminDayTo} endOfDay />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>유저 ID</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='선택'
                        />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>상태</label>
                        <input
                          className='form-control'
                          value={historyStatusFilter}
                          onChange={e => setHistoryStatusFilter(e.target.value)}
                          placeholder='콜백 상태 (선택)'
                        />
                      </div>
                    </div>
                  ) : (
                    <div className='row g-2 mb-3'>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='admin-data-from' label='시작일시' value={adminDayFrom} onChange={setAdminDayFrom} />
                      </div>
                      <div className='col-6 col-md-2'>
                        <AdminDateTimeFilter id='admin-data-to' label='종료일시' value={adminDayTo} onChange={setAdminDayTo} endOfDay />
                      </div>
                      <div className='col-12 col-md-4'>
                        <label className='form-label small mb-0'>유저 ID</label>
                        <input
                          className='form-control'
                          value={adminUserIdFilter}
                          onChange={e => setAdminUserIdFilter(e.target.value)}
                          placeholder='선택'
                        />
                      </div>
                    </div>
                  )}

                  {adminLoading && <p className='text-muted mb-2'>불러오는 중…</p>}
                  <div
                    className={`admin-console-grid w-100${effectiveMenu === 'rooms-manage' ? ' mx-auto' : ''}`}
                    style={{ maxWidth: effectiveMenu === 'rooms-manage' ? 1920 : undefined }}
                  >
                    <div className='table-responsive'>
                    {effectiveMenu === 'rooms-manage' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '1080px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(72px,0.85fr) minmax(88px,1fr) minmax(56px,0.55fr) minmax(52px,0.5fr) minmax(52px,0.5fr) minmax(48px,0.45fr) minmax(48px,0.45fr) minmax(100px,0.95fr) minmax(72px,auto) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            {ROOMS_LIST_KEYS.map(k => (
                              <span key={k}>{roomsListLabel(k)}</span>
                            ))}
                            <span className='text-end'>관리</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((row, i) => {
                              const rid = String(row.id ?? row._id ?? i)
                              return (
                                <div
                                  key={rid}
                                  className='d-flex w-100 align-items-stretch border-0 border-bottom border-slate-200 bg-white'
                                >
                                  <button
                                    type='button'
                                    className='min-w-0 flex-grow-1 border-0 bg-transparent py-2 px-2 px-lg-3 text-start text-body game-history-compact-row hover:bg-slate-50 d-grid align-items-center'
                                    style={{
                                      gridTemplateColumns:
                                        'minmax(72px,0.85fr) minmax(88px,1fr) minmax(56px,0.55fr) minmax(52px,0.5fr) minmax(52px,0.5fr) minmax(48px,0.45fr) minmax(48px,0.45fr) minmax(100px,0.95fr)',
                                      gap: '0.35rem 0.45rem',
                                      fontSize: '0.78rem'
                                    }}
                                    onClick={() => openRoomModalEdit(row)}
                                  >
                                    {ROOMS_LIST_KEYS.map(k => (
                                      <span
                                        key={k}
                                        className='text-truncate small'
                                        title={formatRoomListCell(k, row[k])}
                                      >
                                        {formatRoomListCell(k, row[k])}
                                      </span>
                                    ))}
                                  </button>
                                  <div
                                    className='d-flex align-items-center border-start border-slate-100 bg-slate-50/40 px-2'
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={e => e.stopPropagation()}
                                  >
                                    <button
                                      type='button'
                                      className='btn btn-sm btn-outline-danger'
                                      onClick={e => void deleteRoomRow(row, e)}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                  <div className='d-flex align-items-center px-1 text-slate-300' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'manage-history-sessions' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '720px' }} className='overflow-hidden rounded-xl'>
                        <div
                          className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                          style={{
                            gridTemplateColumns:
                              'minmax(72px,1fr) minmax(88px,1.1fr) minmax(52px,0.55fr) minmax(56px,0.6fr) minmax(100px,1.2fr) minmax(64px,0.75fr) minmax(64px,0.75fr) minmax(108px,1fr) 24px',
                            gap: '0.35rem 0.45rem',
                            fontSize: '0.72rem'
                          }}
                        >
                          <span>테이블</span>
                          <span>종류</span>
                          <span>라운드</span>
                          <span>상태</span>
                          <span>승자</span>
                          <span className='text-end'>베팅</span>
                          <span className='text-end'>지급</span>
                          <span>갱신</span>
                          <span />
                        </div>
                        {adminDisplayRows.length === 0 ? (
                          <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                        ) : (
                          adminDisplayRows.map((raw, i) => {
                            const s = mapGameHistoryRowToFlat(raw)
                            const rid = String(raw._id ?? raw.id ?? i)
                            const upd = s.updatedAt ? formatKstDateTimeLabel(String(s.updatedAt)) : '—'
                            return (
                              <button
                                key={rid}
                                type='button'
                                className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                style={{
                                  gridTemplateColumns:
                                    'minmax(72px,1fr) minmax(88px,1.1fr) minmax(52px,0.55fr) minmax(56px,0.6fr) minmax(100px,1.2fr) minmax(64px,0.75fr) minmax(64px,0.75fr) minmax(108px,1fr) 24px',
                                  gap: '0.35rem 0.45rem',
                                  fontSize: '0.78rem'
                                }}
                                onClick={() => {
                                  setGameHistoryDetailDoc(raw)
                                  setShowGameHistoryDetailModal(true)
                                }}
                              >
                                <span className='fw-semibold text-truncate' title={String(s.tableId)}>
                                  {String(s.tableId || '—')}
                                </span>
                                <span className='text-truncate' title={String(s.gameKind)}>
                                  {String(s.gameKind || '—')}
                                </span>
                                <span className='tabular-nums text-truncate'>{String(s.roundNumber ?? '—')}</span>
                                <span className='text-truncate' title={String(s.gameState)}>
                                  {String(s.gameState || '—')}
                                </span>
                                <span className='text-truncate' title={String(s.winnerSeats || s.winPosition)}>
                                  {String(s.winnerSeats || s.winPosition || '—')}
                                </span>
                                <span className='text-end tabular-nums'>{formatReadonlyNumeric(s.totalWagered)}</span>
                                <span className='text-end tabular-nums'>{formatReadonlyNumeric(s.totalPayout)}</span>
                                <span className='text-truncate small text-slate-600' title={upd}>
                                  {upd}
                                </span>
                                <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                  <ChevronRight className='h-3.5 w-3.5' />
                                </span>
                              </button>
                            )
                          })
                        )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'game-user-betting' || effectiveMenu === 'manage-history-transactions' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '960px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(56px,0.75fr) minmax(44px,0.5fr) minmax(80px,1.1fr) minmax(40px,0.5fr) minmax(52px,0.65fr) minmax(64px,0.75fr) minmax(44px,0.55fr) minmax(56px,0.7fr) minmax(56px,0.7fr) minmax(100px,1.05fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>테이블</span>
                            <span>R</span>
                            <span>유저</span>
                            <span>좌석</span>
                            <span>타입</span>
                            <span>상태</span>
                            <span>결과</span>
                            <span className='text-end'>배팅</span>
                            <span className='text-end'>당첨</span>
                            <span>배팅시각</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapBetHistoryRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const bt = s.betTime ? formatKstDateTimeLabel(String(s.betTime)) : '—'
                              const st = String(s.status || '')
                              const rs = String(s.result || '')
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(56px,0.75fr) minmax(44px,0.5fr) minmax(80px,1.1fr) minmax(40px,0.5fr) minmax(52px,0.65fr) minmax(64px,0.75fr) minmax(44px,0.55fr) minmax(56px,0.7fr) minmax(56px,0.7fr) minmax(100px,1.05fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  onClick={() => {
                                    setBetHistoryDetailDoc(raw)
                                    setShowBetHistoryDetailModal(true)
                                  }}
                                >
                                  <span className='fw-semibold text-truncate' title={String(s.tableId)}>
                                    {String(s.tableId || '—')}
                                  </span>
                                  <span className='tabular-nums text-truncate'>{String(s.roundNumber ?? '—')}</span>
                                  <span className='text-truncate' title={String(s.userId)}>{String(s.shortUser || '—')}</span>
                                  <span className='text-truncate' title={String(s.betPosition)}>
                                    {String(s.betPosition || '—')}
                                  </span>
                                  <span className='text-truncate' title={String(s.betType)}>
                                    {String(s.betType || '—')}
                                  </span>
                                  <span className='text-truncate' title={st}>
                                    {st ? (
                                      <span
                                        className={`d-inline-block max-w-100 text-truncate rounded px-1.5 py-0.5 small fw-bold ring-1 ${betStatusBadgeClass(st)}`}
                                      >
                                        {st}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span className='text-truncate' title={rs}>
                                    {rs ? (
                                      <span className={`rounded px-1.5 py-0.5 small fw-bold ${betResultBadgeClass(rs)}`}>
                                        {rs}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span className='text-end tabular-nums'>{formatReadonlyNumeric(s.betAmount)}</span>
                                  <span className='text-end tabular-nums'>{formatReadonlyNumeric(s.winAmount)}</span>
                                  <span className='text-truncate small text-slate-600' title={bt}>
                                    {bt}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'manage-history-abnormal' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '980px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(56px,0.55fr) minmax(52px,0.45fr) minmax(72px,0.85fr) minmax(44px,0.35fr) minmax(72px,0.65fr) minmax(56px,0.5fr) minmax(44px,0.4fr) minmax(52px,0.45fr) minmax(100px,1fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>유형</span>
                            <span>코드</span>
                            <span>메시지</span>
                            <span>M</span>
                            <span>경로</span>
                            <span>IP</span>
                            <span>심각도</span>
                            <span>상태</span>
                            <span>시각</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapErrorLogRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const ct = s.createdAt ? formatKstDateTimeLabel(String(s.createdAt)) : '—'
                              const sev = String(s.severity || '')
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(56px,0.55fr) minmax(52px,0.45fr) minmax(72px,0.85fr) minmax(44px,0.35fr) minmax(72px,0.65fr) minmax(56px,0.5fr) minmax(44px,0.4fr) minmax(52px,0.45fr) minmax(100px,1fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  title={String(s.errorMessage)}
                                  onClick={() => {
                                    setErrorLogDetailDoc(raw)
                                    setShowErrorLogDetailModal(true)
                                  }}
                                >
                                  <span className='fw-semibold text-truncate' title={String(s.errorType)}>
                                    {String(s.errorType || '—')}
                                  </span>
                                  <span className='font-mono text-truncate small' title={String(s.errorCode)}>
                                    {String(s.errorCode || '—')}
                                  </span>
                                  <span className='text-truncate' title={String(s.errorMessage)}>
                                    {String(s.msgShort || '—')}
                                  </span>
                                  <span className='font-mono small'>{String(s.method)}</span>
                                  <span className='text-truncate small' title={String(s.endpoint)}>
                                    {String(s.epShort || '—')}
                                  </span>
                                  <span className='text-truncate font-mono small' title={String(s.clientIp)}>
                                    {String(s.clientIp || '—')}
                                  </span>
                                  <span>
                                    {sev ? (
                                      <span
                                        className={`rounded px-1.5 py-0.5 small fw-bold ring-1 ${errorSeverityBadgeClass(sev)}`}
                                      >
                                        {sev}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 small fw-bold ${s.resolved ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}
                                    >
                                      {s.resolved ? '해결' : '미해결'}
                                    </span>
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={ct}>
                                    {ct}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'manage-logs-transfer-api' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '960px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(72px,0.85fr) minmax(52px,0.55fr) minmax(40px,0.4fr) minmax(44px,0.5fr) minmax(40px,0.45fr) minmax(44px,0.5fr) minmax(36px,0.4fr) minmax(120px,1.2fr) minmax(100px,1fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>에이전트</span>
                            <span>카테고리</span>
                            <span>메서드</span>
                            <span>HTTP</span>
                            <span>ms</span>
                            <span>성공</span>
                            <span>IP</span>
                            <span>엔드포인트</span>
                            <span>시각</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapTransferApiLogRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const ct = s.createdAt ? formatKstDateTimeLabel(String(s.createdAt)) : '—'
                              const httpCode = Number(s.statusCode) || 0
                              const ipShort = String(s.clientIp || '').length > 14 ? `${String(s.clientIp).slice(0, 12)}…` : String(s.clientIp || '—')
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(72px,0.85fr) minmax(52px,0.55fr) minmax(40px,0.4fr) minmax(44px,0.5fr) minmax(40px,0.45fr) minmax(44px,0.5fr) minmax(36px,0.4fr) minmax(120px,1.2fr) minmax(100px,1fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  title={String(s.endpoint || '')}
                                  onClick={() => {
                                    setTransferApiLogDetailDoc(raw)
                                    setShowTransferApiLogDetailModal(true)
                                  }}
                                >
                                  <span className='fw-semibold text-truncate' title={String(s.agentUsername)}>
                                    {String(s.agentUsername || s.agentId || '—')}
                                  </span>
                                  <span className='text-truncate small' title={String(s.category)}>
                                    {String(s.category || '—')}
                                  </span>
                                  <span className='font-mono small'>{String(s.method || '—')}</span>
                                  <span>
                                    {httpCode > 0 ? (
                                      <span
                                        className={`rounded px-1.5 py-0.5 font-mono small fw-bold ${seamlessHttpBadgeClass(httpCode)}`}
                                      >
                                        {httpCode}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span className='tabular-nums small text-slate-700'>{String(s.durationMs || '—')}</span>
                                  <span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 small fw-bold ring-1 ${s.success ? 'bg-emerald-100 text-emerald-900 ring-emerald-200' : 'bg-rose-100 text-rose-900 ring-rose-200'}`}
                                    >
                                      {s.success ? 'Y' : 'N'}
                                    </span>
                                  </span>
                                  <span className='text-truncate font-mono small' title={String(s.clientIp)}>
                                    {ipShort}
                                  </span>
                                  <span className='text-truncate small text-slate-700' title={String(s.endpoint)}>
                                    {String(s.epShort || '—')}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={ct}>
                                    {ct}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'manage-logs-callback-errors' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '920px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(52px,0.65fr) minmax(72px,1fr) minmax(56px,0.7fr) minmax(40px,0.45fr) minmax(36px,0.4fr) minmax(44px,0.5fr) minmax(52px,0.65fr) minmax(56px,0.65fr) minmax(100px,1.1fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>에이전트</span>
                            <span>유저</span>
                            <span>금액</span>
                            <span>타입</span>
                            <span>게임</span>
                            <span>HTTP</span>
                            <span>ms</span>
                            <span>결과</span>
                            <span>시각</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapSeamlessCallbackRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const ct = s.createdAt ? formatKstDateTimeLabel(String(s.createdAt)) : '—'
                              const st = String(s.status || '')
                              const httpCode = Number(s.responseStatus) || 0
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(52px,0.65fr) minmax(72px,1fr) minmax(56px,0.7fr) minmax(40px,0.45fr) minmax(36px,0.4fr) minmax(44px,0.5fr) minmax(52px,0.65fr) minmax(56px,0.65fr) minmax(100px,1.1fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  title={String(s.finalUrl || '')}
                                  onClick={() => {
                                    setSeamlessCallbackDetailDoc(raw)
                                    setShowSeamlessCallbackDetailModal(true)
                                  }}
                                >
                                  <span className='fw-semibold text-truncate' title={String(s.agentId)}>
                                    {String(s.agentId || '—')}
                                  </span>
                                  <span className='text-truncate' title={String(s.userId)}>
                                    {String(s.shortUser || '—')}
                                  </span>
                                  <span className='tabular-nums text-truncate' title={String(s.amountSummary)}>
                                    {s.amountSummary ? formatReadonlyNumeric(s.amountSummary) : '—'}
                                  </span>
                                  <span className='text-truncate' title={String(s.txnType)}>
                                    {String(s.txnType || '—')}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={String(s.gameHint)}>
                                    {String(s.gameHint || '—')}
                                  </span>
                                  <span>
                                    {httpCode > 0 ? (
                                      <span
                                        className={`rounded px-1.5 py-0.5 font-mono small fw-bold ${seamlessHttpBadgeClass(httpCode)}`}
                                      >
                                        {httpCode}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span className='tabular-nums small text-slate-700'>{String(s.latencyMs || '—')}</span>
                                  <span className='text-truncate'>
                                    {st ? (
                                      <span
                                        className={`rounded px-1.5 py-0.5 small fw-bold ring-1 ${seamlessCallbackStatusBadgeClass(st)}`}
                                      >
                                        {st}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={ct}>
                                    {ct}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'users-activity' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '880px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(80px,1fr) minmax(56px,0.7fr) minmax(88px,0.85fr) minmax(100px,1.1fr) minmax(108px,1.1fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>유저</span>
                            <span>아이디</span>
                            <span>IP</span>
                            <span>UA</span>
                            <span>시각</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapLoginHistoryRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const ct = s.loginAt ? formatKstDateTimeLabel(String(s.loginAt)) : '—'
                              const ua = String(s.userAgent || '')
                              const uaShort = ua.length > 36 ? `${ua.slice(0, 34)}…` : ua
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(80px,1fr) minmax(56px,0.7fr) minmax(88px,0.85fr) minmax(100px,1.1fr) minmax(108px,1.1fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  onClick={() => {
                                    setAdminJsonDetailDoc(raw)
                                    setAdminJsonDetailTitle('활동 로그 상세')
                                    setShowAdminJsonDetailModal(true)
                                  }}
                                >
                                  <span className='text-truncate fw-semibold' title={String(s.userId)}>
                                    {String(s.shortUser || '—')}
                                  </span>
                                  <span className='text-truncate small' title={String(s.username)}>
                                    {String(s.username || '—')}
                                  </span>
                                  <span className='text-truncate font-mono small' title={String(s.loginIp)}>
                                    {String(s.loginIp || '—')}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={ua}>
                                    {uaShort || '—'}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={ct}>
                                    {ct}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'users-ban' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '720px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(88px,1fr) minmax(72px,0.9fr) minmax(108px,1.1fr) minmax(100px,1.2fr) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>유저 ID</span>
                            <span>아이디</span>
                            <span>시각</span>
                            <span>사유</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((raw, i) => {
                              const s = mapBannedUserRowToFlat(raw)
                              const rid = String(raw._id ?? raw.id ?? i)
                              const bt = s.bannedAt ? formatKstDateTimeLabel(String(s.bannedAt)) : '—'
                              const rs = String(s.reason || '')
                              const rsShort = rs.length > 40 ? `${rs.slice(0, 38)}…` : rs
                              return (
                                <button
                                  key={rid}
                                  type='button'
                                  className='w-100 text-start border-0 border-bottom border-slate-200 bg-white py-2 px-2 px-lg-3 d-grid align-items-center text-body game-history-compact-row hover:bg-slate-50'
                                  style={{
                                    gridTemplateColumns:
                                      'minmax(88px,1fr) minmax(72px,0.9fr) minmax(108px,1.1fr) minmax(100px,1.2fr) 24px',
                                    gap: '0.35rem 0.45rem',
                                    fontSize: '0.78rem'
                                  }}
                                  onClick={() => {
                                    setAdminJsonDetailDoc(raw)
                                    setAdminJsonDetailTitle('차단/해제 상세')
                                    setShowAdminJsonDetailModal(true)
                                  }}
                                >
                                  <span className='text-truncate font-mono small' title={String(s.userId)}>
                                    {String(s.userId || '—')}
                                  </span>
                                  <span className='text-truncate' title={String(s.username)}>
                                    {String(s.username || '—')}
                                  </span>
                                  <span className='text-truncate small text-slate-600' title={bt}>
                                    {bt}
                                  </span>
                                  <span className='text-truncate small' title={rs}>
                                    {rsShort || '—'}
                                  </span>
                                  <span className='text-slate-400 d-flex align-items-center justify-content-end' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : effectiveMenu === 'support-desk' ? (
                      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                        <div style={{ minWidth: '880px' }} className='overflow-hidden rounded-xl'>
                          <div
                            className='d-none d-lg-grid px-2 py-1.5 border-bottom border-slate-200 bg-slate-100/90 text-muted small fw-semibold align-items-center'
                            style={{
                              gridTemplateColumns:
                                'minmax(88px,0.75fr) minmax(120px,1.4fr) minmax(72px,0.65fr) minmax(72px,0.7fr) minmax(108px,1fr) minmax(140px,auto) 24px',
                              gap: '0.35rem 0.45rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>티켓 ID</span>
                            <span>제목</span>
                            <span>상태</span>
                            <span>작성자</span>
                            <span>생성일시</span>
                            <span className='text-end'>관리</span>
                            <span />
                          </div>
                          {adminDisplayRows.length === 0 ? (
                            <p className='text-muted small mb-0 p-3'>데이터가 없습니다.</p>
                          ) : (
                            adminDisplayRows.map((row, i) => {
                              const s = mapSupportTicketRowToFlat(row)
                              const rid = String(row._id ?? row.id ?? row.ticketId ?? i)
                              return (
                                <div
                                  key={rid}
                                  className='d-flex w-100 align-items-stretch border-0 border-bottom border-slate-200 bg-white'
                                >
                                  <button
                                    type='button'
                                    className='min-w-0 flex-grow-1 border-0 bg-transparent py-2 px-2 px-lg-3 text-start text-body game-history-compact-row hover:bg-slate-50 d-grid align-items-center'
                                    style={{
                                      gridTemplateColumns:
                                        'minmax(88px,0.75fr) minmax(120px,1.4fr) minmax(72px,0.65fr) minmax(72px,0.7fr) minmax(108px,1fr)',
                                      gap: '0.35rem 0.45rem',
                                      fontSize: '0.78rem'
                                    }}
                                    title={s.title}
                                    onClick={() => openTicketEditModal(row)}
                                  >
                                    <span className='font-mono text-truncate small' title={s.idStr}>
                                      {s.shortId}
                                    </span>
                                    <span className='text-truncate fw-medium' title={s.title}>
                                      {s.shortTitle || '—'}
                                    </span>
                                    <span>
                                      {s.status ? (
                                        <span className='rounded px-1.5 py-0.5 small fw-bold bg-violet-100 text-violet-900 ring-1 ring-violet-200'>
                                          {s.status}
                                        </span>
                                      ) : (
                                        '—'
                                      )}
                                    </span>
                                    <span className='text-truncate small' title={s.author}>
                                      {s.author || '—'}
                                    </span>
                                    <span className='text-truncate small text-slate-600' title={s.createdLabel}>
                                      {s.createdLabel}
                                    </span>
                                  </button>
                                  <div
                                    className='d-flex flex-wrap align-items-center justify-content-end gap-1 border-start border-slate-100 bg-slate-50/40 py-1.5 px-2'
                                    onClick={e => e.stopPropagation()}
                                    onKeyDown={e => e.stopPropagation()}
                                  >
                                    <button
                                      type='button'
                                      className='btn btn-sm btn-outline-primary'
                                      onClick={() => openTicketEditModal(row)}
                                    >
                                      편집
                                    </button>
                                    <button
                                      type='button'
                                      className='btn btn-sm btn-outline-danger'
                                      onClick={() => openTicketDeleteModal(row)}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                  <div className='d-flex align-items-center px-1 text-slate-300' aria-hidden>
                                    <ChevronRight className='h-3.5 w-3.5' />
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <table className='table table-sm table-hover table-striped align-middle'>
                        <thead className='table-light'>
                          <tr>
                            {adminTableKeys.map(k => (
                              <th key={k} className='text-nowrap small'>
                                {adminFieldLabel(k)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {adminDisplayRows.map((row, i) => (
                            <tr key={i}>
                              {adminTableKeys.map(k => (
                                <td key={k} className='small text-break' style={{ maxWidth: 280 }}>
                                  {formatAdminCellByKey(k, row[k], { agentIdToUsername })}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    </div>
                  </div>
                  {adminDisplayTotal > 0 && (
                    <div className='d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3'>
                      <span className='text-secondary small'>총 {adminDisplayTotal}건</span>
                      <div className='btn-group'>
                        <button
                          type='button'
                          className='btn btn-sm btn-outline-secondary'
                          disabled={adminPage <= 1 || adminLoading}
                          onClick={() => void loadAdminListData(adminPage - 1)}
                        >
                          이전
                        </button>
                        <span className='btn btn-sm btn-outline-secondary disabled'>
                          {adminPage} / {Math.max(1, Math.ceil(adminDisplayTotal / adminPerPage))}
                        </span>
                        <button
                          type='button'
                          className='btn btn-sm btn-outline-secondary'
                          disabled={adminLoading || adminPage * adminPerPage >= adminDisplayTotal}
                          onClick={() => void loadAdminListData(adminPage + 1)}
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {effectiveMenu === 'system-config' && (
              <div className='card mb-3 rounded-xl border border-slate-200/90 shadow-sm'>
                <div className='card-header d-flex flex-wrap justify-content-between align-items-center gap-2 border-b border-slate-100 bg-slate-50/80 py-3'>
                  <h3 className='card-title m-0 text-lg font-semibold text-slate-900'>시스템 설정</h3>
                </div>
                <div className='card-body p-0'>
                  <ul className='nav nav-tabs px-3 pt-3 mb-0 border-bottom-0'>
                    <li className='nav-item'>
                      <button
                        type='button'
                        className={`nav-link ${systemConfigTab === 'detail' ? 'active' : ''}`}
                        onClick={() => setSystemConfigTab('detail')}
                      >
                        시스템 세부 설정
                      </button>
                    </li>
                    <li className='nav-item'>
                      <button
                        type='button'
                        className={`nav-link ${systemConfigTab === 'db' ? 'active' : ''}`}
                        onClick={() => setSystemConfigTab('db')}
                      >
                        게임 테이블
                      </button>
                    </li>
                  </ul>

                  {systemConfigTab === 'detail' && (
                    <div className='p-3 p-md-4 border-top'>
                      <p className='text-secondary small mb-3'>
                        각 행을 수정한 뒤 <strong>저장</strong>합니다. (최고 권한 계정 또는 개발용 토큰 필요)
                      </p>
                      {systemConfigLoading && <p className='text-muted small mb-2'>불러오는 중…</p>}
                      <div className='admin-console-grid'>
                        <div className='overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40'>
                          <div className='table-responsive min-w-0 rounded-xl'>
                        <table className='table table-sm align-middle mb-0' style={{ fontSize: '0.8125rem' }}>
                          <thead className='border-b border-slate-200 bg-slate-100/90'>
                            <tr>
                              <th className='small text-nowrap text-muted fw-semibold py-2 ps-2'>{adminFieldLabel('_id')}</th>
                              <th className='small text-muted fw-semibold py-2'>{adminFieldLabel('param')}</th>
                              <th className='small text-muted fw-semibold py-2'>{adminFieldLabel('value')}</th>
                              <th className='small text-muted fw-semibold py-2'>{adminFieldLabel('kind')}</th>
                              <th className='small text-muted fw-semibold py-2'>{adminFieldLabel('kindTitle')}</th>
                              <th className='small text-muted fw-semibold py-2'>{adminFieldLabel('paramComment')}</th>
                              <th className='small text-muted fw-semibold py-2' style={{ width: 72 }}>
                                {adminFieldLabel('isShow')}
                              </th>
                              <th className='small text-nowrap text-muted fw-semibold py-2 pe-2' style={{ width: 150 }}>
                                작업
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemConfigDrafts.map((d, i) => {
                              const rowKey = d.id ?? `new-${i}`
                              const busy = systemConfigBusyKey === rowKey
                              return (
                                <tr key={`${rowKey}-${i}`} className='border-bottom border-slate-200 bg-white transition-colors hover:bg-slate-50/90'>
                                  <td className='small font-monospace text-break' style={{ maxWidth: 120 }}>
                                    {d.id ?? <span className='text-muted'>(신규)</span>}
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.param}
                                      onChange={e => updateSystemConfigDraft(i, { param: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.value}
                                      onChange={e => updateSystemConfigDraft(i, { value: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.kind}
                                      onChange={e => updateSystemConfigDraft(i, { kind: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.kindTitle}
                                      onChange={e => updateSystemConfigDraft(i, { kindTitle: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.paramComment}
                                      onChange={e => updateSystemConfigDraft(i, { paramComment: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className='form-control form-control-sm'
                                      value={d.isShow}
                                      onChange={e => updateSystemConfigDraft(i, { isShow: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <div className='d-flex flex-wrap gap-1'>
                                      <button
                                        type='button'
                                        className='btn btn-sm btn-primary'
                                        disabled={busy}
                                        onClick={() => void upsertSystemConfigRow(d, i)}
                                      >
                                        {busy ? '…' : '저장'}
                                      </button>
                                      <button
                                        type='button'
                                        className='btn btn-sm btn-outline-danger'
                                        disabled={busy}
                                        onClick={() => void deleteSystemConfigRow(d, i)}
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                          </div>
                        </div>
                      </div>
                      <button
                        type='button'
                        className='btn btn-sm btn-outline-primary mt-3'
                        onClick={() => setSystemConfigDrafts(r => [...r, emptySystemConfigDraft()])}
                      >
                        행 추가
                      </button>
                    </div>
                  )}

                  {systemConfigTab === 'db' && (
                    <div className='p-3 p-md-4 border-top border-slate-100'>
                      <div className='d-flex flex-wrap align-items-center gap-2 mb-3'>
                        <span className='badge text-bg-secondary'>게임 테이블</span>
                        <span className='text-secondary small'>니우니우 테이블 초기화</span>
                      </div>
                      <p className='text-secondary'>
                        기본 게임 테이블이 비어 있을 때 초기 데이터를 넣습니다. (<strong>admin</strong> 계정 또는 개발용 토큰만 실행 가능)
                      </p>
                      <p className='mb-3'>
                        현재 등록 건수:{' '}
                        {niuniuTableCount === null ? (
                          <span className='text-muted'>조회 중…</span>
                        ) : (
                          <strong>{niuniuTableCount}</strong>
                        )}
                      </p>
                      <div className='d-flex flex-wrap gap-2'>
                        <button
                          type='button'
                          className='btn btn-primary inline-flex items-center gap-1.5'
                          disabled={niuniuTableBusy}
                          onClick={() => void initNiuniuTables(false)}
                        >
                          <Database className='h-4 w-4' />
                          테이블 없을 때만 초기화
                        </button>
                        <button
                          type='button'
                          className='btn btn-outline-danger inline-flex items-center gap-1.5'
                          disabled={niuniuTableBusy}
                          onClick={() => {
                            if (!window.confirm('기존 게임 테이블 데이터를 모두 지우고 기본 구성으로 다시 넣습니다. 계속할까요?')) return
                            void initNiuniuTables(true)
                          }}
                        >
                          <RotateCcw className='h-4 w-4' />
                          전체 교체 (replace)
                        </button>
                        <button
                          type='button'
                          className='btn btn-outline-secondary'
                          disabled={niuniuTableBusy}
                          onClick={() => void loadNiuniuTableStatus().catch(e => setError(e?.message || String(e)))}
                        >
                          상태 새로고침
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {effectiveMenu === 'api-reference' && (
              <div className='card shadow-sm'>
                <div className='card-body d-flex flex-wrap gap-2 align-items-center'>
                  <button type='button' className='btn btn-primary' onClick={() => void checkSwagger()}>
                    문서 서버 상태 확인
                  </button>
                  <a className='btn btn-outline-primary' href={`${API_BASE_URL}/docs`} target='_blank' rel='noreferrer'>
                    API 문서 열기
                  </a>
                  {swaggerOk && <span className='badge text-bg-success'>{swaggerOk}</span>}
                </div>
                <div className='card-footer small text-muted'>
                  <span className='d-block'>
                    문서 화면에서 백오피스(내부) 스펙을 선택하면 운영·에이전트 관련 API를 확인할 수 있습니다.
                  </span>
                </div>
              </div>
            )}

          </div>
        </main>

        <footer className='mt-auto border-t border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500 md:px-6'>
          <div className='mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2'>
            <span className='font-medium text-slate-700'>
              ZENITHPARK <span className='font-normal text-slate-500'>Admin Console</span>
            </span>
            <span className='hidden sm:inline'>Niuniu API</span>
          </div>
        </footer>
      </div>
    </div>

      <Modal
        open={showAgentModal}
        title={`에이전트 설정/유저상세 (${modalAgent?.username || '-'})`}
        onClose={() => setShowAgentModal(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' onClick={() => setShowAgentModal(false)}>
              닫기
            </button>
            <button
              type='button'
              className='btn btn-primary'
              disabled={agentFormLoading || agentSaveBusy}
              onClick={() => void saveAgentEdit()}
            >
              {agentSaveBusy ? '저장 중…' : '변경사항 저장'}
            </button>
          </>
        }
      >
        {modalAgent && (
          <div className='row g-3'>
            {agentFormLoading && (
              <div className='col-12 text-muted small py-2'>정보를 불러오는 중…</div>
            )}

            {!agentFormLoading && (
              <div className='col-12'>
                <ConsoleModalSection
                  variant='profile'
                  title='에이전트 정보'
                  description='읽기전용 필드는 서버·보안상 잠겨 있습니다. 나머지는 수정 후 「변경사항 저장」으로 반영합니다.'
                >
                  {(() => {
                    const ro: AgentReadonlyInfo =
                      agentReadonly ??
                      ({
                        id: modalAgent.id,
                        username: modalAgent.username,
                        parentAgentId: modalAgent.parentId ?? null,
                        totalSubAgentRpoint: 0,
                        totalSubAgent: 0,
                        totalUsers: modalAgent.totalUsers ?? 0,
                        createdAt: '',
                        updatedAt: '',
                        currentApiKey: '',
                        secretKey: '',
                        version: null
                      } as AgentReadonlyInfo)
                    return (
                  <div className='row g-2'>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      로그인 아이디 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={ro.username} />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      상위 에이전트 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={resolveAgentObjectIdToUsername(ro.parentAgentId, agentIdToUsername)} />
                  </div>
                  <div className='col-md-4 col-lg-3'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      하위 에이전트 수 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={formatReadonlyNumeric(ro.totalSubAgent)} />
                  </div>
                  <div className='col-md-4 col-lg-3'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      소속 회원 수 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={formatReadonlyNumeric(ro.totalUsers)} />
                  </div>
                  <div className='col-md-4 col-lg-3'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      하위 R포인트 합 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={formatReadonlyNumeric(ro.totalSubAgentRpoint)} />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      생성 시각 (서버) <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={ro.createdAt ? formatKstDateTimeLabel(ro.createdAt) : '—'} />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      수정 시각 (서버) <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={ro.updatedAt ? formatKstDateTimeLabel(ro.updatedAt) : '—'} />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      API 키 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyTextarea value={ro.currentApiKey || '—'} rows={2} />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      시크릿 키 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyTextarea value={ro.secretKey || '—'} rows={2} />
                  </div>
                  <div className='col-12 col-lg-2'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      버전 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={ro.version != null ? formatReadonlyNumeric(ro.version) : '—'} />
                  </div>

                  <div className='col-12 border-top pt-3 mt-1' />

                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label'>유형</label>
                    <input
                      type='text'
                      className='form-control'
                      value={agentEditForm.type}
                      onChange={e => setAgentEditForm(f => ({ ...f, type: e.target.value }))}
                    />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label'>닉네임</label>
                    <input
                      type='text'
                      className='form-control'
                      value={agentEditForm.nickname}
                      onChange={e => setAgentEditForm(f => ({ ...f, nickname: e.target.value }))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>콜백 URL (비우면 저장 시 null)</label>
                    <input
                      type='url'
                      className='form-control'
                      value={agentEditForm.callbackUrl}
                      onChange={e => setAgentEditForm(f => ({ ...f, callbackUrl: e.target.value }))}
                      placeholder='https://...'
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>에이전트 잔액</label>
                    <input
                      type='number'
                      className='form-control'
                      step='0.01'
                      value={agentEditForm.balance}
                      onChange={e => setAgentEditForm(f => ({ ...f, balance: e.target.value }))}
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>수수료율 (%)</label>
                    <input
                      type='number'
                      className='form-control'
                      step='0.01'
                      min='0'
                      value={agentEditForm.rate}
                      onChange={e => setAgentEditForm(f => ({ ...f, rate: e.target.value }))}
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>등급</label>
                    <input
                      type='text'
                      className='form-control'
                      value={agentEditForm.grade}
                      onChange={e => setAgentEditForm(f => ({ ...f, grade: e.target.value }))}
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>국가 코드</label>
                    <input
                      type='text'
                      className='form-control'
                      value={agentEditForm.country}
                      onChange={e => setAgentEditForm(f => ({ ...f, country: e.target.value }))}
                      placeholder='KOR'
                    />
                  </div>
                  <div className='col-md-4 d-flex align-items-end'>
                    <div className='form-check mb-0'>
                      <input
                        className='form-check-input'
                        type='checkbox'
                        id='agentIsActive'
                        checked={agentEditForm.isActive}
                        onChange={e => setAgentEditForm(f => ({ ...f, isActive: e.target.checked }))}
                      />
                      <label className='form-check-label' htmlFor='agentIsActive'>
                        계정 활성
                      </label>
                    </div>
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label'>이메일</label>
                    <input
                      type='email'
                      className='form-control'
                      value={agentEditForm.email}
                      onChange={e => setAgentEditForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label'>전화번호</label>
                    <input
                      type='tel'
                      className='form-control'
                      value={agentEditForm.phone}
                      onChange={e => setAgentEditForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>회사명</label>
                    <input
                      type='text'
                      className='form-control'
                      value={agentEditForm.company}
                      onChange={e => setAgentEditForm(f => ({ ...f, company: e.target.value }))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>메모</label>
                    <textarea
                      className='form-control'
                      rows={2}
                      value={agentEditForm.memo}
                      onChange={e => setAgentEditForm(f => ({ ...f, memo: e.target.value }))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>허용 IP (쉼표 또는 줄바꿈)</label>
                    <textarea
                      className='form-control font-monospace small'
                      rows={3}
                      value={agentEditForm.allowedIPsText}
                      onChange={e => setAgentEditForm(f => ({ ...f, allowedIPsText: e.target.value }))}
                      placeholder='192.168.0.1'
                    />
                  </div>
                  <div className='col-md-6'>
                    <label className='form-label'>마지막 로그인 (비우면 미설정)</label>
                    <input
                      type='datetime-local'
                      className='form-control'
                      value={agentEditForm.lastLogin}
                      onChange={e => setAgentEditForm(f => ({ ...f, lastLogin: e.target.value }))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>게임/베팅 설정 (JSON)</label>
                    <textarea
                      className='form-control font-monospace small'
                      rows={8}
                      value={agentEditForm.settingsJson}
                      onChange={e => setAgentEditForm(f => ({ ...f, settingsJson: e.target.value }))}
                    />
                  </div>
                </div>
                    )
                  })()}
                </ConsoleModalSection>
              </div>
            )}

            <div className='col-12'>
              <ConsoleModalSection
                variant='apitest'
                title='API 테스트'
                description='API 키 재발급과 게임 접속 테스트 링크입니다. 위쪽 읽기전용 API 키와 맞추려면 저장 후 모달을 다시 열거나 목록을 새로고침하세요.'
              >
                <div className='mb-3'>
                  <button type='button' className='btn btn-outline-primary btn-sm' onClick={() => setShowKeyConfirm(true)}>
                    API 키 발급
                  </button>
                  <p className='text-muted small mt-2 mb-0'>
                    발급 직후 아래에만 전체 키가 표시됩니다. 상단 읽기전용 필드와 동기화하려면 저장 후 모달을 닫았다가 다시 열거나 목록을 새로고침하세요.
                  </p>
                  <label className='form-label small text-secondary mt-2 mb-0'>방금 발급·복사용 API 키</label>
                  <textarea className='form-control font-monospace small' rows={2} value={modalApiKey} readOnly />
                </div>
                <div className='border-top border-success border-opacity-25 pt-3'>
                  <label className='form-label'>테스트 접속 userId (비우면 자동 생성)</label>
                  <div className='d-flex flex-wrap gap-2 align-items-stretch'>
                    <input
                      className='form-control'
                      style={{ flex: '1 1 200px', minWidth: '140px' }}
                      value={modalTestUserId}
                      onChange={e => setModalTestUserId(e.target.value)}
                      placeholder='userId'
                    />
                    <div className='d-flex flex-wrap gap-2 align-items-center'>
                      <button type='button' className='btn btn-success btn-sm' onClick={() => void generateModalJoinLink()}>
                        링크 생성
                      </button>
                      <button
                        type='button'
                        className='btn btn-outline-secondary btn-sm'
                        onClick={openModalJoinLinkInNewTab}
                        disabled={!modalJoinLink.trim()}
                        title={!modalJoinLink.trim() ? '먼저 링크를 생성하세요' : '새 브라우저 탭에서 열기'}
                      >
                        새창으로 열기
                      </button>
                      <button
                        type='button'
                        className='btn btn-outline-secondary btn-sm'
                        onClick={() => void copyModalJoinLink()}
                        disabled={!modalJoinLink.trim()}
                        title={!modalJoinLink.trim() ? '먼저 링크를 생성하세요' : 'URL 복사'}
                      >
                        URL 복사
                      </button>
                    </div>
                  </div>
                  <label className='form-label small text-secondary mt-2 mb-0'>생성된 접속 URL</label>
                  <textarea className='form-control font-monospace small' rows={2} value={modalJoinLink} readOnly placeholder='생성된 URL' />
                </div>
              </ConsoleModalSection>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showKeyConfirm}
        title='API 키 재발급 확인'
        onClose={() => setShowKeyConfirm(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' onClick={() => setShowKeyConfirm(false)}>
              취소
            </button>
            <button
              type='button'
              className='btn btn-danger'
              onClick={async () => {
                setShowKeyConfirm(false)
                await issueModalApiKey()
              }}
            >
              OK (덮어쓰기 진행)
            </button>
          </>
        }
      >
        기존 키가 덮어쓰기 됩니다. 계속 진행하시겠습니까?
      </Modal>

      <Modal
        open={showUserEdit}
        title={`회원 정보 (${selectedUser?.username || '-'})`}
        onClose={() => setShowUserEdit(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' onClick={() => setShowUserEdit(false)}>
              닫기
            </button>
            <button
              type='button'
              className='btn btn-primary'
              disabled={userSaveBusy || !userEditForm}
              onClick={() => void saveUserMember()}
            >
              {userSaveBusy ? '저장 중…' : '변경사항 저장'}
            </button>
          </>
        }
      >
        {selectedUser && userEditForm && (
          <div className='row g-3'>
            <div className='col-12'>
              <ConsoleModalSection
                variant='profile'
                title='회원 정보'
                description='읽기전용 필드는 식별·잔액·토큰·서버 시각입니다. 닉네임·국가·상태·설정(JSON)은 저장 시 반영됩니다.'
              >
                {userDetailLoading && <p className='text-muted small mb-2'>서버 상세를 불러오는 중…</p>}
                {!userDetailLoading && !userDetailRecord && (
                  <p className='text-warning small mb-2'>상세 API를 불러오지 못했습니다. 목록 기준으로 일부만 표시됩니다.</p>
                )}

                <div className='row g-2'>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      유저 ID <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={userEditForm.userId || '—'} />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      아이디 (username) <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={userEditForm.username} />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      소속 에이전트 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={resolveAgentObjectIdToUsername(userEditForm.agentId, agentIdToUsername)} />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      잔액 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={formatReadonlyNumeric(userEditForm.balance)} />
                  </div>
                  <div className='col-md-6 col-lg-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      포인트 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={formatReadonlyNumeric(userEditForm.point)} />
                  </div>
                  <div className='col-12'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      토큰 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyTextarea value={userEditForm.token || '—'} rows={2} />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      생성 시각 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={userEditForm.createdAt ? fmtIsoLocal(userEditForm.createdAt) : '—'} />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      수정 시각 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={userEditForm.updatedAt ? fmtIsoLocal(userEditForm.updatedAt) : '—'} />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label small d-flex align-items-center gap-2'>
                      마지막 접속 <span className='badge rounded-pill bg-secondary bg-opacity-25 text-secondary'>읽기전용</span>
                    </label>
                    <ReadonlyInput value={userEditForm.lastAccessAt ? fmtIsoLocal(userEditForm.lastAccessAt) : '—'} />
                  </div>

                  <div className='col-12 border-top pt-3 mt-1' />

                  <div className='col-md-6'>
                    <label className='form-label'>닉네임</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.nickname}
                      onChange={e => setUserEditForm(f => (f ? { ...f, nickname: e.target.value } : f))}
                    />
                  </div>
                  <div className='col-md-3'>
                    <label className='form-label'>국가</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.country}
                      onChange={e => setUserEditForm(f => (f ? { ...f, country: e.target.value } : f))}
                    />
                  </div>
                  <div className='col-md-3'>
                    <label className='form-label'>통화</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.currencyCode}
                      onChange={e => setUserEditForm(f => (f ? { ...f, currencyCode: e.target.value } : f))}
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>상태</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.status}
                      onChange={e => setUserEditForm(f => (f ? { ...f, status: e.target.value } : f))}
                      placeholder='ACTIVE'
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>역할</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.role}
                      onChange={e => setUserEditForm(f => (f ? { ...f, role: e.target.value } : f))}
                      placeholder='USER'
                    />
                  </div>
                  <div className='col-md-4'>
                    <label className='form-label'>접속 IP (마지막)</label>
                    <input
                      type='text'
                      className='form-control'
                      value={userEditForm.loginIp}
                      onChange={e => setUserEditForm(f => (f ? { ...f, loginIp: e.target.value } : f))}
                    />
                  </div>
                  <div className='col-12'>
                    <label className='form-label'>설정 (JSON)</label>
                    <textarea
                      className='form-control font-monospace small'
                      rows={10}
                      value={userEditForm.settingsJson}
                      onChange={e => setUserEditForm(f => (f ? { ...f, settingsJson: e.target.value } : f))}
                    />
                  </div>

                  <div className='col-12 border-top pt-3 mt-1' />

                  <div className='col-12 d-flex gap-2 flex-wrap align-items-center'>
                    <button
                      type='button'
                      className='btn btn-outline-danger'
                      onClick={() => void deleteUserAdmin(selectedUser)}
                    >
                      회원 삭제
                    </button>
                  </div>
                </div>
              </ConsoleModalSection>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showUserGiveModal}
        title={`회원 머니 지급 (${selectedUser?.username || '-'})`}
        onClose={() => !userGiveBusy && setShowUserGiveModal(false)}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={userGiveBusy}
              onClick={() => setShowUserGiveModal(false)}
            >
              취소
            </button>
            <button type='button' className='btn btn-success' disabled={userGiveBusy} onClick={() => void submitUserGive()}>
              {userGiveBusy ? '처리 중…' : '지급'}
            </button>
          </>
        }
      >
        {selectedUser && (
          <div className='row g-3'>
            <div className='col-12'>
              <p className='small text-secondary mb-2'>
                소속 에이전트 지갑에서 회원으로 지급합니다. 한도는 해당 에이전트 잔액을 넘을 수 없습니다.
              </p>
              <p className='mb-2'>
                회원: <strong>{selectedUser.username}</strong> ({selectedUser.nickname || '—'})
              </p>
              <div className='rounded border border-slate-200 bg-slate-50/80 px-3 py-2 small'>
                <div className='d-flex flex-wrap justify-content-between gap-2 border-bottom border-slate-200/80 pb-2 mb-2'>
                  <span className='text-muted'>소속 에이전트</span>
                  <strong className='tabular-nums'>
                    {resolveAgentObjectIdToUsername(selectedUser.agentId, agentIdToUsername)}
                  </strong>
                </div>
                <div className='d-flex flex-wrap justify-content-between gap-2 border-bottom border-slate-200/80 pb-2 mb-2'>
                  <span className='text-muted'>회원 잔액</span>
                  <strong className='tabular-nums'>
                    {userDetailLoading ? '…' : formatNumberWithCommas(selectedUserMemberBalance)}
                  </strong>
                </div>
                <div className='d-flex flex-wrap justify-content-between gap-2'>
                  <span className='text-muted'>에이전트 잔액(지급 한도)</span>
                  <strong className='tabular-nums'>{formatNumberWithCommas(selectedUserAgentBalance)}</strong>
                </div>
              </div>
            </div>
            <div className='col-12'>
              <label className='form-label'>지급 금액</label>
              <input
                className='form-control'
                type='number'
                min={1}
                step='0.01'
                placeholder='0'
                value={userGiveAmount}
                onChange={e => setUserGiveAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showUserRecallModal}
        title={`회원 머니 회수 (${selectedUser?.username || '-'})`}
        onClose={() => !userRecallBusy && setShowUserRecallModal(false)}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={userRecallBusy}
              onClick={() => setShowUserRecallModal(false)}
            >
              취소
            </button>
            <button type='button' className='btn btn-warning' disabled={userRecallBusy} onClick={() => void submitUserRecall()}>
              {userRecallBusy ? '처리 중…' : '회수'}
            </button>
          </>
        }
      >
        {selectedUser && (
          <div className='row g-3'>
            <div className='col-12'>
              <p className='small text-secondary mb-2'>
                회원 지갑에서 소속 에이전트로 회수합니다. 금액 회수 시 회원 잔액을 초과할 수 없습니다.
              </p>
              <p className='mb-2'>
                회원: <strong>{selectedUser.username}</strong> ({selectedUser.nickname || '—'})
              </p>
              <div className='rounded border border-slate-200 bg-slate-50/80 px-3 py-2 small'>
                <div className='d-flex flex-wrap justify-content-between gap-2 border-bottom border-slate-200/80 pb-2 mb-2'>
                  <span className='text-muted'>소속 에이전트</span>
                  <strong className='tabular-nums'>
                    {resolveAgentObjectIdToUsername(selectedUser.agentId, agentIdToUsername)}
                  </strong>
                </div>
                <div className='d-flex flex-wrap justify-content-between gap-2'>
                  <span className='text-muted'>회원 잔액(회수 가능)</span>
                  <strong className='tabular-nums'>
                    {userDetailLoading ? '…' : formatNumberWithCommas(selectedUserMemberBalance)}
                  </strong>
                </div>
              </div>
            </div>
            <div className='col-12'>
              <div className='form-check mb-2'>
                <input
                  className='form-check-input'
                  type='checkbox'
                  id='userRecallFullAll'
                  checked={userRecallFullAll}
                  onChange={e => {
                    const checked = e.target.checked
                    setUserRecallFullAll(checked)
                    if (checked) {
                      setUserRecallAmount(String(selectedUserMemberBalance))
                    } else {
                      setUserRecallAmount('0')
                    }
                  }}
                />
                <label className='form-check-label' htmlFor='userRecallFullAll'>
                  전체 회수 (체크 시 회수 금액에 회원 잔액 전액이 입력됩니다)
                </label>
              </div>
              <label className='form-label'>회수 금액</label>
              <input
                className='form-control'
                type='number'
                min={1}
                step='0.01'
                placeholder='0'
                value={userRecallAmount}
                disabled={userRecallFullAll}
                onChange={e => setUserRecallAmount(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showUserGiveLimitWarning}
        title='지급 한도 초과'
        overlayClassName='!z-[1100]'
        onClose={() => setShowUserGiveLimitWarning(false)}
        footer={
          <button type='button' className='btn btn-primary' onClick={() => setShowUserGiveLimitWarning(false)}>
            확인
          </button>
        }
      >
        <p className='mb-0 small'>
          입력 금액 <strong className='tabular-nums'>{formatNumberWithCommas(userGiveAmount || '0')}</strong> 이(가) 지급 가능
          잔액 <strong className='tabular-nums'>{formatNumberWithCommas(selectedUserAgentBalance)}</strong> 을(를) 초과합니다. 금액을
          줄인 뒤 다시 시도하세요.
        </p>
      </Modal>

      <Modal
        open={showUserRecallLimitWarning}
        title='회수 한도 초과'
        overlayClassName='!z-[1100]'
        onClose={() => setShowUserRecallLimitWarning(false)}
        footer={
          <button type='button' className='btn btn-primary' onClick={() => setShowUserRecallLimitWarning(false)}>
            확인
          </button>
        }
      >
        <p className='mb-0 small'>
          입력 금액 <strong className='tabular-nums'>{formatNumberWithCommas(userRecallAmount || '0')}</strong> 이(가) 회원 잔액{' '}
          <strong className='tabular-nums'>{formatNumberWithCommas(selectedUserMemberBalance)}</strong> 을(를) 초과합니다. 금액을
          줄이거나 전체 회수를 사용하세요.
        </p>
      </Modal>

      <Modal
        open={showAddAgentModal}
        title='하위 에이전트 추가'
        onClose={() => !addAgentBusy && setShowAddAgentModal(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' disabled={addAgentBusy} onClick={() => setShowAddAgentModal(false)}>
              취소
            </button>
            <button type='button' className='btn btn-primary' disabled={addAgentBusy} onClick={() => void submitAddAgent()}>
              {addAgentBusy ? '처리 중…' : '생성'}
            </button>
          </>
        }
      >
        <p className='text-secondary small'>
          부모: <strong>{agentFlat.find(x => x.id === selectedAgentId)?.username || '(트리에서 선택)'}</strong>
        </p>
        <div className='row g-2'>
          <div className='col-md-6'>
            <label className='form-label'>Username *</label>
            <input
              className='form-control'
              value={addAgentForm.username}
              onChange={e => setAddAgentForm(f => ({ ...f, username: e.target.value }))}
              autoComplete='off'
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label'>Password * (6자 이상)</label>
            <input
              type='password'
              className='form-control'
              value={addAgentForm.password}
              onChange={e => setAddAgentForm(f => ({ ...f, password: e.target.value }))}
              autoComplete='new-password'
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label'>Nickname *</label>
            <input
              className='form-control'
              value={addAgentForm.nickname}
              onChange={e => setAddAgentForm(f => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label'>Grade *</label>
            <input
              className='form-control'
              value={addAgentForm.grade}
              onChange={e => setAddAgentForm(f => ({ ...f, grade: e.target.value }))}
              placeholder='partner, store 등'
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label'>Rate</label>
            <input
              className='form-control'
              type='number'
              step='0.01'
              value={addAgentForm.rate}
              onChange={e => setAddAgentForm(f => ({ ...f, rate: e.target.value }))}
            />
          </div>
          <div className='col-12'>
            <label className='form-label'>Memo</label>
            <input
              className='form-control'
              value={addAgentForm.memo}
              onChange={e => setAddAgentForm(f => ({ ...f, memo: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showAgentMoneyModal}
        title={agentMoneyKind === 'give' ? '하위 에이전트로 머니 지급' : '하위 에이전트에서 머니 회수'}
        onClose={() => !agentMoneyBusy && setShowAgentMoneyModal(false)}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={agentMoneyBusy}
              onClick={() => setShowAgentMoneyModal(false)}
            >
              취소
            </button>
            <button
              type='button'
              className={agentMoneyKind === 'give' ? 'btn btn-success' : 'btn btn-warning'}
              disabled={agentMoneyBusy}
              onClick={() => void submitAgentMoney()}
            >
              {agentMoneyBusy ? '처리 중…' : agentMoneyKind === 'give' ? '지급' : '회수'}
            </button>
          </>
        }
      >
        {agentMoneyTarget && (
          <div className='row g-3'>
            <div className='col-12'>
              {!agentMoneyTarget.parentId && agentMoneyTarget.username === 'admin' && (
                <div className='alert alert-danger py-2 px-3 small mb-2'>
                  admin의 경우 강제로 잔액을 변경 할 수 있습니다.
                </div>
              )}
              <p className='small text-secondary mb-1'>
                {(!agentMoneyTarget.parentId && agentMoneyTarget.username === 'admin')
                  ? '최고 권한 계정에 한해 잔액을 조정할 수 있습니다. 처리 내역은 시스템에 기록됩니다.'
                  : '상위 에이전트 잔액에서 하위로 이동하거나, 하위에서 상위로 회수합니다. 처리 내역은 시스템에 기록됩니다.'}
              </p>
              <p className='mb-0'>
                하위 에이전트: <strong>{agentMoneyTarget.username}</strong> ({agentMoneyTarget.nickname || '—'})
              </p>
              {agentMoneyTarget.parentId ? (
                <p className='small text-muted mb-0'>
                  상위 에이전트: {resolveAgentObjectIdToUsername(agentMoneyTarget.parentId, agentIdToUsername)}
                </p>
              ) : null}
            </div>
            <div className='col-12'>
              <label className='form-label'>금액</label>
              <input
                className='form-control'
                type='number'
                min={0}
                step='0.01'
                placeholder='0'
                value={agentMoneyAmount}
                onChange={e => setAgentMoneyAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showAddUserModal}
        title='회원 추가'
        onClose={() => !addUserBusy && setShowAddUserModal(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' disabled={addUserBusy} onClick={() => setShowAddUserModal(false)}>
              취소
            </button>
            <button type='button' className='btn btn-primary' disabled={addUserBusy} onClick={() => void submitAddUser()}>
              {addUserBusy ? '처리 중…' : '생성'}
            </button>
          </>
        }
      >
        <div className='row g-2'>
          <div className='col-12'>
            <label className='form-label'>소속 에이전트 (username) *</label>
            <input
              className='form-control'
              list='agent-username-options'
              value={addUserForm.agentUsername}
              onChange={e => setAddUserForm(f => ({ ...f, agentUsername: e.target.value }))}
              placeholder='에이전트 로그인 아이디'
            />
            <datalist id='agent-username-options'>
              {agentUsernames.map(a => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className='col-md-6'>
            <label className='form-label'>회원 Username * (3자 이상)</label>
            <input
              className='form-control'
              value={addUserForm.username}
              onChange={e => setAddUserForm(f => ({ ...f, username: e.target.value }))}
              autoComplete='off'
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label'>Nickname (비우면 username, 3자 이상)</label>
            <input
              className='form-control'
              value={addUserForm.nickname}
              onChange={e => setAddUserForm(f => ({ ...f, nickname: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showGameHistoryDetailModal}
        title={
          gameHistoryDetailDoc
            ? (() => {
                const f = mapGameHistoryRowToFlat(gameHistoryDetailDoc as Record<string, unknown>);
                return `게임 이력 상세 — ${f.tableId || '-'} · R${f.roundNumber ?? '-'}`;
              })()
            : '게임 이력 상세'
        }
        onClose={() => {
          setShowGameHistoryDetailModal(false);
          setGameHistoryDetailDoc(null);
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowGameHistoryDetailModal(false);
              setGameHistoryDetailDoc(null);
            }}
          >
            닫기
          </button>
        }
      >
        {gameHistoryDetailDoc ? (
          <GameHistoryDetailPanel doc={gameHistoryDetailDoc} />
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showBetHistoryDetailModal}
        title={
          betHistoryDetailDoc
            ? (() => {
                const f = mapBetHistoryRowToFlat(betHistoryDetailDoc as Record<string, unknown>)
                return `베팅 이력 상세 — ${f.tableId || '-'} · ${String(f.betType || '-')}`
              })()
            : '베팅 이력 상세'
        }
        onClose={() => {
          setShowBetHistoryDetailModal(false)
          setBetHistoryDetailDoc(null)
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowBetHistoryDetailModal(false)
              setBetHistoryDetailDoc(null)
            }}
          >
            닫기
          </button>
        }
      >
        {betHistoryDetailDoc ? (
          <BetHistoryDetailPanel doc={betHistoryDetailDoc} />
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showSeamlessCallbackDetailModal}
        title={
          seamlessCallbackDetailDoc
            ? (() => {
                const f = mapSeamlessCallbackRowToFlat(seamlessCallbackDetailDoc as Record<string, unknown>)
                return `Seamless 콜백 상세 — ${f.agentId || '-'} · HTTP ${f.responseStatus || '-'}`
              })()
            : 'Seamless 콜백 상세'
        }
        onClose={() => {
          setShowSeamlessCallbackDetailModal(false)
          setSeamlessCallbackDetailDoc(null)
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowSeamlessCallbackDetailModal(false)
              setSeamlessCallbackDetailDoc(null)
            }}
          >
            닫기
          </button>
        }
      >
        {seamlessCallbackDetailDoc ? (
          <SeamlessCallbackDetailPanel doc={seamlessCallbackDetailDoc} />
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showTransferApiLogDetailModal}
        title={
          transferApiLogDetailDoc
            ? (() => {
                const f = mapTransferApiLogRowToFlat(transferApiLogDetailDoc as Record<string, unknown>)
                return `Transfer API — ${f.category || '-'} · HTTP ${f.statusCode || '-'}`
              })()
            : 'Transfer API 이력 상세'
        }
        onClose={() => {
          setShowTransferApiLogDetailModal(false)
          setTransferApiLogDetailDoc(null)
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowTransferApiLogDetailModal(false)
              setTransferApiLogDetailDoc(null)
            }}
          >
            닫기
          </button>
        }
      >
        {transferApiLogDetailDoc ? (
          <TransferApiLogDetailPanel doc={transferApiLogDetailDoc} />
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showErrorLogDetailModal}
        title={
          errorLogDetailDoc
            ? (() => {
                const f = mapErrorLogRowToFlat(errorLogDetailDoc as Record<string, unknown>)
                return `API 오류 상세 — ${f.errorType || '-'} · ${f.errorCode || '-'}`
              })()
            : 'API 오류 상세'
        }
        onClose={() => {
          setShowErrorLogDetailModal(false)
          setErrorLogDetailDoc(null)
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowErrorLogDetailModal(false)
              setErrorLogDetailDoc(null)
            }}
          >
            닫기
          </button>
        }
      >
        {errorLogDetailDoc ? (
          <ErrorLogDetailPanel doc={errorLogDetailDoc} />
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showAdminJsonDetailModal}
        title={adminJsonDetailTitle || '상세'}
        onClose={() => {
          setShowAdminJsonDetailModal(false)
          setAdminJsonDetailDoc(null)
          setAdminJsonDetailTitle('')
        }}
        footer={
          <button
            type='button'
            className='btn btn-outline-secondary'
            onClick={() => {
              setShowAdminJsonDetailModal(false)
              setAdminJsonDetailDoc(null)
              setAdminJsonDetailTitle('')
            }}
          >
            닫기
          </button>
        }
      >
        {adminJsonDetailDoc ? (
          <pre className='max-h-[60vh] overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-800 ring-1 ring-slate-200'>
            {JSON.stringify(adminJsonDetailDoc, null, 2)}
          </pre>
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showTicketCreateModal}
        title='문의 추가'
        panelClassName='max-w-lg'
        onClose={() => {
          if (!ticketModalBusy) setShowTicketCreateModal(false)
        }}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={ticketModalBusy}
              onClick={() => setShowTicketCreateModal(false)}
            >
              취소
            </button>
            <button type='button' className='btn btn-success' disabled={ticketModalBusy} onClick={() => void submitTicketCreate()}>
              {ticketModalBusy ? '등록 중…' : '등록'}
            </button>
          </>
        }
      >
        <div className='space-y-3 text-start'>
          <p className='mb-0 small text-slate-500'>새 문의 티켓을 등록합니다. 등록 후 목록에서 상태·답변을 관리할 수 있습니다.</p>
          <div>
            <label className='form-label small mb-1 text-slate-600' htmlFor='ticket-create-cat'>
              분류
            </label>
            <input
              id='ticket-create-cat'
              type='text'
              className='form-control form-control-sm rounded-lg border-slate-200'
              value={ticketCreateCategory}
              onChange={e => setTicketCreateCategory(e.target.value)}
              placeholder='문의'
              autoComplete='off'
            />
          </div>
          <div>
            <label className='form-label small mb-1 text-slate-600' htmlFor='ticket-create-title'>
              제목 <span className='text-danger'>*</span>
            </label>
            <input
              id='ticket-create-title'
              type='text'
              className='form-control rounded-lg border-slate-200'
              value={ticketCreateTitle}
              onChange={e => setTicketCreateTitle(e.target.value)}
              placeholder='제목을 입력하세요'
              autoComplete='off'
            />
          </div>
          <div>
            <label className='form-label small mb-1 text-slate-600' htmlFor='ticket-create-content'>
              내용 <span className='text-danger'>*</span>
            </label>
            <textarea
              id='ticket-create-content'
              className='form-control rounded-lg border-slate-200'
              rows={6}
              value={ticketCreateContent}
              onChange={e => setTicketCreateContent(e.target.value)}
              placeholder='문의 내용을 입력하세요'
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showTicketEditModal}
        title={
          ticketEditRow
            ? `문의 수정 · ${mapSupportTicketRowToFlat(ticketEditRow).shortTitle || mapSupportTicketRowToFlat(ticketEditRow).shortId}`
            : '문의 수정'
        }
        panelClassName='max-w-lg'
        onClose={() => {
          if (!ticketModalBusy) {
            setShowTicketEditModal(false)
            setTicketEditRow(null)
          }
        }}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={ticketModalBusy}
              onClick={() => {
                setShowTicketEditModal(false)
                setTicketEditRow(null)
              }}
            >
              취소
            </button>
            <button type='button' className='btn btn-primary' disabled={ticketModalBusy} onClick={() => void submitTicketEdit()}>
              {ticketModalBusy ? '저장 중…' : '저장'}
            </button>
          </>
        }
      >
        {ticketEditRow ? (
          <div className='space-y-3 text-start'>
            <div className='rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600'>
              <span className='font-medium text-slate-500'>티켓 ID</span>{' '}
              <code className='text-slate-800'>{mapSupportTicketRowToFlat(ticketEditRow).idStr}</code>
            </div>
            <div>
              <label className='form-label small mb-1 text-slate-600' htmlFor='ticket-edit-status'>
                상태 <span className='text-danger'>*</span>
              </label>
              <select
                id='ticket-edit-status'
                className='form-select form-select-sm rounded-lg border-slate-200'
                value={ticketEditStatus}
                onChange={e => setTicketEditStatus(e.target.value)}
              >
                <option value='created'>created</option>
                <option value='processing'>processing</option>
                <option value='completed'>completed</option>
                <option value='reconfirm'>reconfirm</option>
                <option value='insufficient'>insufficient</option>
              </select>
              <div className='form-text'>API/DB에 저장되는 상태 값입니다.</div>
            </div>
            <div>
              <label className='form-label small mb-1 text-slate-600' htmlFor='ticket-edit-reply'>
                답변 (선택)
              </label>
              <textarea
                id='ticket-edit-reply'
                className='form-control rounded-lg border-slate-200'
                rows={5}
                value={ticketEditReply}
                onChange={e => setTicketEditReply(e.target.value)}
                placeholder='답변을 남기면 티켓에 댓글로 등록됩니다. 비워 두면 상태만 변경합니다.'
              />
            </div>
          </div>
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showTicketDeleteModal}
        title='문의 삭제'
        panelClassName='max-w-md'
        onClose={() => {
          if (!ticketModalBusy) {
            setShowTicketDeleteModal(false)
            setTicketDeleteRow(null)
          }
        }}
        footer={
          <>
            <button
              type='button'
              className='btn btn-outline-secondary'
              disabled={ticketModalBusy}
              onClick={() => {
                setShowTicketDeleteModal(false)
                setTicketDeleteRow(null)
              }}
            >
              취소
            </button>
            <button type='button' className='btn btn-danger' disabled={ticketModalBusy} onClick={() => void confirmTicketDelete()}>
              {ticketModalBusy ? '삭제 중…' : '삭제'}
            </button>
          </>
        }
      >
        {ticketDeleteRow ? (
          <div className='rounded-xl border border-rose-200/80 bg-rose-50/60 px-4 py-3 text-start'>
            <p className='mb-2 small text-rose-900'>
              이 문의를 삭제하면 복구할 수 없습니다. 계속할까요?
            </p>
            <div className='mb-0 small text-slate-700'>
              <div className='d-flex flex-wrap gap-2 border-b border-rose-100/80 py-1'>
                <span className='text-muted'>ID</span>
                <span className='font-mono'>{mapSupportTicketRowToFlat(ticketDeleteRow).idStr}</span>
              </div>
              <div className='py-2'>
                <div className='text-muted mb-1'>제목</div>
                <div>{mapSupportTicketRowToFlat(ticketDeleteRow).title || '—'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className='text-muted small'>데이터가 없습니다.</div>
        )}
      </Modal>

      <Modal
        open={showRoomModal}
        title={roomModalMode === 'create' ? '게임룸 추가' : `게임룸 수정 (${roomForm.tableId || '-'})`}
        onClose={() => setShowRoomModal(false)}
        footer={
          <>
            <button type='button' className='btn btn-outline-secondary' onClick={() => setShowRoomModal(false)}>
              닫기
            </button>
            <button type='button' className='btn btn-primary' disabled={roomSaveBusy} onClick={() => void saveRoomModal()}>
              {roomSaveBusy ? '처리 중…' : roomModalMode === 'create' ? '생성' : '저장'}
            </button>
          </>
        }
      >
        <div className='row g-2'>
          <div className='col-md-6'>
            <label className='form-label small mb-0'>룸 ID (tableId) {roomModalMode === 'edit' ? '' : '*'}</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.tableId}
              disabled={roomModalMode === 'edit'}
              onChange={e => setRoomForm(f => ({ ...f, tableId: e.target.value }))}
              autoComplete='off'
              placeholder='예: NIUNIU01'
            />
            {roomModalMode === 'edit' && <div className='form-text'>룸 ID는 변경할 수 없습니다.</div>}
          </div>
          <div className='col-md-6'>
            <label className='form-label small mb-0'>룸명 *</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.tableName}
              onChange={e => setRoomForm(f => ({ ...f, tableName: e.target.value }))}
            />
          </div>
          <div className='col-md-4'>
            <label className='form-label small mb-0'>게임종류</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.gameType}
              onChange={e => setRoomForm(f => ({ ...f, gameType: e.target.value }))}
            />
          </div>
          <div className='col-md-4'>
            <label className='form-label small mb-0'>게임 종류(kind)</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.gameKind}
              onChange={e => setRoomForm(f => ({ ...f, gameKind: e.target.value }))}
            />
          </div>
          <div className='col-md-4'>
            <label className='form-label small mb-0'>최소 플레이어 수</label>
            <input
              type='number'
              className='form-control form-control-sm'
              min={1}
              value={roomForm.minPlayers}
              onChange={e => setRoomForm(f => ({ ...f, minPlayers: e.target.value }))}
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label small mb-0'>최소 베팅</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.minBet}
              onChange={e => setRoomForm(f => ({ ...f, minBet: e.target.value }))}
            />
          </div>
          <div className='col-md-6'>
            <label className='form-label small mb-0'>최대 베팅</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.maxBet}
              onChange={e => setRoomForm(f => ({ ...f, maxBet: e.target.value }))}
            />
          </div>
          <div className='col-md-6'>
            <div className='form-check mt-2'>
              <input
                type='checkbox'
                className='form-check-input'
                id='roomIsActive'
                checked={roomForm.isActive}
                onChange={e => setRoomForm(f => ({ ...f, isActive: e.target.checked }))}
              />
              <label className='form-check-label' htmlFor='roomIsActive'>
                활성
              </label>
            </div>
          </div>
          <div className='col-md-6'>
            <div className='form-check mt-2'>
              <input
                type='checkbox'
                className='form-check-input'
                id='roomIsDemo'
                checked={roomForm.isDemo}
                onChange={e => setRoomForm(f => ({ ...f, isDemo: e.target.checked }))}
              />
              <label className='form-check-label' htmlFor='roomIsDemo'>
                데모
              </label>
            </div>
          </div>
          <div className='col-12'>
            <label className='form-label small mb-0'>스트림 URL 1</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.stream1}
              onChange={e => setRoomForm(f => ({ ...f, stream1: e.target.value }))}
            />
          </div>
          <div className='col-12 col-md-6'>
            <label className='form-label small mb-0'>스트림 URL 2</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.stream2}
              onChange={e => setRoomForm(f => ({ ...f, stream2: e.target.value }))}
            />
          </div>
          <div className='col-12 col-md-6'>
            <label className='form-label small mb-0'>스트림 URL 3</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.stream3}
              onChange={e => setRoomForm(f => ({ ...f, stream3: e.target.value }))}
            />
          </div>
          <div className='col-12 col-md-4'>
            <label className='form-label small mb-0'>썸네일 1</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.thumb1}
              onChange={e => setRoomForm(f => ({ ...f, thumb1: e.target.value }))}
            />
          </div>
          <div className='col-12 col-md-4'>
            <label className='form-label small mb-0'>썸네일 2</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.thumb2}
              onChange={e => setRoomForm(f => ({ ...f, thumb2: e.target.value }))}
            />
          </div>
          <div className='col-12 col-md-4'>
            <label className='form-label small mb-0'>썸네일 3</label>
            <input
              type='text'
              className='form-control form-control-sm'
              value={roomForm.thumb3}
              onChange={e => setRoomForm(f => ({ ...f, thumb3: e.target.value }))}
            />
          </div>
          {roomModalMode === 'edit' && (
            <div className='col-12 pt-2 border-top'>
              <button
                type='button'
                className='btn btn-sm btn-outline-danger'
                onClick={() => void deleteRoomRow({ id: roomForm.mongoId, tableId: roomForm.tableId })}
              >
                이 룸 삭제
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
