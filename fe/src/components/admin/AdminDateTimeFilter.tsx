'use client'

import { useMemo } from 'react'
import DatePicker from 'react-datepicker'
import { ko } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'

function formatClockYyMmDdHhMmSs(dt: Date): string {
  const yy = String(dt.getFullYear()).slice(-2)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mi = String(dt.getMinutes()).padStart(2, '0')
  const ss = String(dt.getSeconds()).padStart(2, '0')
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`
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

/** npm react-datepicker + date-fns 한국어 — yy-MM-dd HH:mm:ss (24h) */
export function AdminDateTimeFilter({
  id,
  label,
  value,
  onChange,
  /** true면 선택한 날짜의 23:59:59(로컬)로 고정 — 종료일시 조회용 */
  endOfDay = false
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  endOfDay?: boolean
}) {
  const selected = useMemo(() => parseDateTimeFilterInput(value), [value])

  return (
    <div className='admin-datetime-filter'>
      <label className='form-label small mb-0' htmlFor={id}>
        {label}
      </label>
      <DatePicker
        id={id}
        selected={selected}
        onChange={(d: Date | null) => {
          if (d === null) {
            onChange('')
            return
          }
          const x = new Date(d.getTime())
          if (endOfDay) x.setHours(23, 59, 59, 0)
          onChange(formatClockYyMmDdHhMmSs(x))
        }}
        locale={ko}
        dateFormat='yy-MM-dd HH:mm:ss'
        showTimeSelect
        showTimeInput
        timeFormat='HH:mm:ss'
        timeCaption='시간'
        timeIntervals={1}
        className='form-control font-monospace'
        wrapperClassName='w-100'
        popperClassName='admin-datepicker-popper'
        showPopperArrow={false}
        calendarStartDay={0}
        autoComplete='off'
        isClearable
        clearButtonTitle='비우기'
        placeholderText='yy-MM-dd HH:mm:ss'
      />
    </div>
  )
}
