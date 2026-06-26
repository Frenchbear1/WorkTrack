import { describe, expect, it } from 'vitest'
import {
  calculateHourlyAmount,
  calculateLiveLogEstimate,
  calculateLogAmount,
  calculateUnpaidTotal,
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeHomeSectionOrder,
  getActiveLog,
  roundBillableMinutes,
} from './calculations'
import { formatWeekRange, getWeekKey } from './format'
import { skippedLocation } from './location'
import type { HomeSectionId, LogEntry, UserSettings } from '../types'

function makeLog(patch: Partial<LogEntry> = {}): LogEntry {
  const startAt = '2026-06-26T12:00:00.000Z'

  return {
    id: 'log-1',
    uid: 'user-1',
    title: 'Deck repair',
    mode: 'hourly',
    status: 'stopped',
    presetId: null,
    startAt,
    endAt: '2026-06-26T13:10:00.000Z',
    startLocation: skippedLocation(startAt),
    rate: 60,
    flatAmount: null,
    roundingMinutes: 15,
    adjustmentAmount: 0,
    amountDue: 70,
    paidAt: null,
    notes: '',
    createdAt: startAt,
    updatedAt: startAt,
    ...patch,
  }
}

describe('billing calculations', () => {
  it('rounds billable minutes upward to the selected increment', () => {
    expect(roundBillableMinutes(61, 15)).toBe(75)
    expect(roundBillableMinutes(60, 15)).toBe(60)
    expect(roundBillableMinutes(7, 0)).toBe(7)
  })

  it('calculates hourly logs from exact elapsed time rounded to dollars', () => {
    expect(
      calculateHourlyAmount(
        '2026-06-26T12:00:00.000Z',
        '2026-06-26T13:10:00.000Z',
        60,
        15,
        5,
      ),
    ).toBe(75)
  })

  it('does not bump short hourly logs up to the rounding increment', () => {
    const log = makeLog({
      endAt: '2026-06-26T12:06:00.000Z',
      rate: 25,
      roundingMinutes: 15,
    })

    expect(calculateLogAmount(log)).toBe(3)
  })

  it('estimates active hourly logs from exact elapsed time rounded to dollars', () => {
    const log = makeLog({
      status: 'active',
      endAt: null,
      rate: 25,
      roundingMinutes: 15,
    })

    expect(
      calculateLiveLogEstimate(log, new Date('2026-06-26T12:06:00.000Z')),
    ).toBe(3)
  })

  it('calculates flat logs from flat amount and adjustment', () => {
    const log = makeLog({
      mode: 'flat',
      rate: null,
      flatAmount: 240,
      adjustmentAmount: -15,
    })

    expect(calculateLogAmount(log)).toBe(225)
  })

  it('totals only stopped unpaid logs', () => {
    const unpaid = makeLog({ id: 'unpaid' })
    const active = makeLog({ id: 'active', status: 'active', endAt: null })
    const paid = makeLog({ id: 'paid', paidAt: '2026-06-26T14:00:00.000Z' })

    expect(calculateUnpaidTotal([unpaid, active, paid])).toBe(70)
  })

  it('finds the single active log', () => {
    const active = makeLog({ id: 'active', status: 'active', endAt: null })
    expect(getActiveLog([makeLog(), active])?.id).toBe('active')
  })

  it('ships with useful defaults', () => {
    expect(DEFAULT_SETTINGS.currency).toBe('USD')
    expect(DEFAULT_SETTINGS.roundingMinutes).toBe(15)
    expect(DEFAULT_SETTINGS.homeSectionOrder).toEqual([
      'summary',
      'timer',
      'presets',
      'recent',
    ])
  })

  it('normalizes saved home layout order', () => {
    expect(
      normalizeHomeSectionOrder(['recent', 'timer', 'recent'] as HomeSectionId[]),
    ).toEqual(['recent', 'timer', 'summary', 'presets'])

    expect(
      mergeSettings({
        ...DEFAULT_SETTINGS,
        homeSectionOrder: undefined,
      } as unknown as UserSettings).homeSectionOrder,
    ).toEqual(DEFAULT_SETTINGS.homeSectionOrder)
  })

  it('groups log weeks from Monday through Sunday', () => {
    expect(getWeekKey('2026-06-28T12:00:00.000Z')).toBe('2026-06-22')
    expect(formatWeekRange('2026-06-28T12:00:00.000Z')).toBe(
      'Jun 22 - Jun 28, 2026',
    )
  })
})
