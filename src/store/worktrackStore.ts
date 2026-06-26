import { create } from 'zustand'
import {
  calculateLogAmount,
  DEFAULT_SETTINGS,
  getActiveLog,
  mergeSettings,
} from '../lib/calculations'
import { pendingLocation, skippedLocation } from '../lib/location'
import type {
  JobMode,
  JobPreset,
  LogEntry,
  PresetIcon,
  StartLocation,
  UserSettings,
  WorkspaceSnapshot,
} from '../types'

type SyncState = 'idle' | 'loading' | 'synced' | 'error'

type StartLogInput = {
  uid: string
  title: string
  mode: JobMode
  presetId?: string | null
  rate?: number | null
  flatAmount?: number | null
  notes?: string
  locationLabel?: string
}

type ManualLogInput = StartLogInput & {
  startAt: string
  endAt: string | null
  adjustmentAmount: number
  paid: boolean
  startLocation?: StartLocation
}

type PresetInput = {
  uid: string
  id?: string
  title: string
  mode: JobMode
  defaultRate: number | null
  defaultFlatAmount: number | null
  icon: PresetIcon
  color: string
  notes: string
}

type WorktrackStore = {
  logs: LogEntry[]
  presets: JobPreset[]
  settings: UserSettings
  syncState: SyncState
  syncMessage: string
  selectedLogIds: string[]
  setWorkspace: (snapshot: WorkspaceSnapshot) => void
  setSyncState: (syncState: SyncState, message?: string) => void
  resetWorkspace: () => void
  createActiveLog: (input: StartLogInput) => LogEntry | null
  addManualLog: (input: ManualLogInput) => LogEntry
  stopActiveLog: () => LogEntry | null
  updateLog: (id: string, patch: Partial<LogEntry>) => LogEntry | null
  deleteLog: (id: string) => void
  upsertPreset: (input: PresetInput) => JobPreset
  deletePreset: (id: string) => void
  updateSettings: (patch: Partial<UserSettings>) => UserSettings
  toggleLogSelection: (id: string) => void
  clearSelection: () => void
  markLogsPaid: (ids: string[]) => LogEntry[]
  toggleLogPaid: (id: string) => LogEntry | null
}

function createId() {
  return crypto.randomUUID()
}

function normalizeTitle(title: string) {
  return title.trim() || 'Untitled job'
}

function nowIso() {
  return new Date().toISOString()
}

function buildBaseLog(input: StartLogInput, startAt: string): LogEntry {
  const rate = input.mode === 'hourly' ? (input.rate ?? DEFAULT_SETTINGS.defaultRate) : null
  const flatAmount = input.mode === 'flat' ? (input.flatAmount ?? 0) : null

  return {
    id: createId(),
    uid: input.uid,
    title: normalizeTitle(input.title),
    mode: input.mode,
    status: 'active',
    presetId: input.presetId ?? null,
    startAt,
    endAt: null,
    startLocation: pendingLocation(startAt, input.locationLabel),
    rate,
    flatAmount,
    roundingMinutes: DEFAULT_SETTINGS.roundingMinutes,
    adjustmentAmount: 0,
    amountDue: 0,
    paidAt: null,
    notes: input.notes?.trim() ?? '',
    createdAt: startAt,
    updatedAt: startAt,
  }
}

export const useWorktrackStore = create<WorktrackStore>((set, get) => ({
  logs: [],
  presets: [],
  settings: DEFAULT_SETTINGS,
  syncState: 'idle',
  syncMessage: '',
  selectedLogIds: [],

  setWorkspace: (snapshot) =>
    set({
      logs: snapshot.logs,
      presets: snapshot.presets,
      settings: mergeSettings(snapshot.settings),
      syncState: 'synced',
      syncMessage: '',
      selectedLogIds: [],
    }),

  setSyncState: (syncState, message = '') => set({ syncState, syncMessage: message }),

  resetWorkspace: () =>
    set({
      logs: [],
      presets: [],
      settings: DEFAULT_SETTINGS,
      syncState: 'idle',
      syncMessage: '',
      selectedLogIds: [],
    }),

  createActiveLog: (input) => {
    const state = get()

    if (getActiveLog(state.logs)) {
      return null
    }

    const startedAt = nowIso()
    const log = {
      ...buildBaseLog(input, startedAt),
      startLocation:
        state.settings.locationMode === 'off'
          ? skippedLocation(startedAt, input.locationLabel)
          : pendingLocation(startedAt, input.locationLabel),
      roundingMinutes: state.settings.roundingMinutes,
      rate:
        input.mode === 'hourly'
          ? (input.rate ?? state.settings.defaultRate)
          : null,
    }

    set({ logs: [log, ...state.logs] })
    return log
  },

  addManualLog: (input) => {
    const createdAt = nowIso()
    const endAt = input.mode === 'hourly' ? input.endAt : input.startAt
    const log: LogEntry = {
      ...buildBaseLog(input, input.startAt),
      status: 'stopped',
      endAt,
      startLocation:
        input.startLocation ??
        skippedLocation(input.startAt, input.locationLabel),
      rate:
        input.mode === 'hourly'
          ? (input.rate ?? get().settings.defaultRate)
          : null,
      flatAmount: input.mode === 'flat' ? (input.flatAmount ?? 0) : null,
      roundingMinutes: get().settings.roundingMinutes,
      adjustmentAmount: input.adjustmentAmount,
      paidAt: input.paid ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    }
    const amountDue = calculateLogAmount(log)
    const savedLog = { ...log, amountDue }

    set((state) => ({ logs: [savedLog, ...state.logs] }))
    return savedLog
  },

  stopActiveLog: () => {
    const activeLog = getActiveLog(get().logs)

    if (!activeLog) {
      return null
    }

    const stoppedAt = nowIso()
    const stoppedLog = {
      ...activeLog,
      status: 'stopped' as const,
      endAt: stoppedAt,
      amountDue: calculateLogAmount({ ...activeLog, endAt: stoppedAt }),
      updatedAt: stoppedAt,
    }

    set((state) => ({
      logs: state.logs.map((log) => (log.id === stoppedLog.id ? stoppedLog : log)),
    }))
    return stoppedLog
  },

  updateLog: (id, patch) => {
    const updatedAt = nowIso()
    let updatedLog: LogEntry | null = null

    set((state) => ({
      logs: state.logs.map((log) => {
        if (log.id !== id) {
          return log
        }

        updatedLog = {
          ...log,
          ...patch,
          updatedAt,
        }
        updatedLog.amountDue = calculateLogAmount(updatedLog)
        return updatedLog
      }),
    }))

    return updatedLog
  },

  deleteLog: (id) =>
    set((state) => ({
      logs: state.logs.filter((log) => log.id !== id),
      selectedLogIds: state.selectedLogIds.filter((selectedId) => selectedId !== id),
    })),

  upsertPreset: (input) => {
    const timestamp = nowIso()
    const existing = input.id
      ? get().presets.find((preset) => preset.id === input.id)
      : null
    const preset: JobPreset = {
      id: input.id ?? createId(),
      uid: input.uid,
      title: normalizeTitle(input.title),
      mode: input.mode,
      defaultRate: input.mode === 'hourly' ? input.defaultRate : null,
      defaultFlatAmount: input.mode === 'flat' ? input.defaultFlatAmount : null,
      icon: input.icon,
      color: input.color,
      notes: input.notes.trim(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    set((state) => ({
      presets: [
        preset,
        ...state.presets.filter((entry) => entry.id !== preset.id),
      ],
    }))
    return preset
  },

  deletePreset: (id) =>
    set((state) => ({
      presets: state.presets.filter((preset) => preset.id !== id),
    })),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    return settings
  },

  toggleLogSelection: (id) =>
    set((state) => ({
      selectedLogIds: state.selectedLogIds.includes(id)
        ? state.selectedLogIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedLogIds, id],
    })),

  clearSelection: () => set({ selectedLogIds: [] }),

  markLogsPaid: (ids) => {
    const paidAt = nowIso()
    const updatedLogs: LogEntry[] = []

    set((state) => ({
      logs: state.logs.map((log) => {
        if (!ids.includes(log.id)) {
          return log
        }

        const updatedLog = {
          ...log,
          paidAt,
          updatedAt: paidAt,
        }
        updatedLogs.push(updatedLog)
        return updatedLog
      }),
      selectedLogIds: [],
    }))

    return updatedLogs
  },

  toggleLogPaid: (id) => {
    const timestamp = nowIso()
    let updatedLog: LogEntry | null = null

    set((state) => ({
      logs: state.logs.map((log) => {
        if (log.id !== id) {
          return log
        }

        updatedLog = {
          ...log,
          paidAt: log.paidAt ? null : timestamp,
          updatedAt: timestamp,
        }
        return updatedLog
      }),
    }))

    return updatedLog
  },
}))
