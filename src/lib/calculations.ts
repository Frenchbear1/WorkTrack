import type { JobPreset, LogEntry, UserSettings } from '../types'

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  defaultRate: 45,
  roundingMinutes: 15,
  theme: 'system',
  accentColor: '#247C6D',
  locationMode: 'ask',
  hidePaidByDefault: true,
  reducedMotion: false,
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function getDurationMinutes(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0
  }

  return (end - start) / 60000
}

export function roundBillableMinutes(minutes: number, roundingMinutes: number) {
  if (roundingMinutes <= 1) {
    return Math.max(0, minutes)
  }

  return Math.ceil(Math.max(0, minutes) / roundingMinutes) * roundingMinutes
}

export function calculateHourlyAmount(
  startAt: string,
  endAt: string,
  rate: number,
  roundingMinutes: number,
  adjustmentAmount = 0,
) {
  const minutes = roundBillableMinutes(
    getDurationMinutes(startAt, endAt),
    roundingMinutes,
  )
  return roundCurrency((minutes / 60) * rate + adjustmentAmount)
}

export function calculateLogAmount(log: LogEntry, now = new Date()) {
  if (log.mode === 'flat') {
    return roundCurrency((log.flatAmount ?? 0) + log.adjustmentAmount)
  }

  const endAt = log.endAt ?? now.toISOString()
  return calculateHourlyAmount(
    log.startAt,
    endAt,
    log.rate ?? 0,
    log.roundingMinutes,
    log.adjustmentAmount,
  )
}

export function calculateUnpaidTotal(logs: LogEntry[]) {
  return roundCurrency(
    logs
      .filter((log) => log.status === 'stopped' && !log.paidAt)
      .reduce((sum, log) => sum + calculateLogAmount(log), 0),
  )
}

export function getActiveLog(logs: LogEntry[]) {
  return logs.find((log) => log.status === 'active') ?? null
}

export function getVisibleLogs(logs: LogEntry[], showPaid: boolean) {
  return logs
    .filter((log) => showPaid || !log.paidAt)
    .sort((a, b) => {
      const bDate = new Date(b.startAt).getTime()
      const aDate = new Date(a.startAt).getTime()
      return bDate - aDate
    })
}

export function getPresetRate(preset: JobPreset, settings: UserSettings) {
  return preset.defaultRate ?? settings.defaultRate
}

export function mergeSettings(settings: UserSettings | null) {
  return { ...DEFAULT_SETTINGS, ...settings }
}
