import type { HomeSectionId, JobPreset, LogEntry, UserSettings } from '../types'

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = [
  'summary',
  'timer',
  'presets',
  'recent',
]

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  defaultRate: 45,
  roundingMinutes: 15,
  theme: 'light',
  accentColor: '#247C6D',
  locationMode: 'ask',
  hidePaidByDefault: true,
  reducedMotion: false,
  homeSectionOrder: DEFAULT_HOME_SECTION_ORDER,
}

export function normalizeHomeSectionOrder(
  order: readonly HomeSectionId[] | null | undefined,
) {
  const uniqueKnownSections = (order ?? []).filter(
    (section, index, sections) =>
      DEFAULT_HOME_SECTION_ORDER.includes(section) &&
      sections.indexOf(section) === index,
  )

  return [
    ...uniqueKnownSections,
    ...DEFAULT_HOME_SECTION_ORDER.filter(
      (section) => !uniqueKnownSections.includes(section),
    ),
  ]
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundDollar(value: number) {
  return Math.round(value)
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
  _roundingMinutes: number,
  adjustmentAmount = 0,
) {
  const minutes = getDurationMinutes(startAt, endAt)
  return roundDollar((minutes / 60) * rate + adjustmentAmount)
}

export function calculateLogAmount(log: LogEntry, now = new Date()) {
  if (log.mode === 'flat') {
    return roundDollar((log.flatAmount ?? 0) + log.adjustmentAmount)
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

export function calculateLiveLogEstimate(log: LogEntry, now = new Date()) {
  if (log.mode === 'flat') {
    return roundDollar((log.flatAmount ?? 0) + log.adjustmentAmount)
  }

  const minutes = getDurationMinutes(log.startAt, now.toISOString())
  const rawAmount = (minutes / 60) * (log.rate ?? 0) + log.adjustmentAmount
  return roundDollar(rawAmount)
}

export function calculateUnpaidTotal(logs: LogEntry[]) {
  return logs
    .filter((log) => log.status === 'stopped' && !log.paidAt)
    .reduce((sum, log) => sum + calculateLogAmount(log), 0)
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
  const merged = { ...DEFAULT_SETTINGS, ...settings }

  return {
    ...merged,
    theme: 'light' as const,
    homeSectionOrder: normalizeHomeSectionOrder(merged.homeSectionOrder),
  }
}
