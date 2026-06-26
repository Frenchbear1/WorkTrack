import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Filter,
  Hammer,
  Home as HomeIcon,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Paintbrush,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  Save,
  Settings,
  Square,
  SquareCheckBig,
  StopCircle,
  Trash2,
  Truck,
  Undo2,
  UserRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Modal } from './components/Modal'
import { useAuthSession } from './hooks/useAuthSession'
import {
  calculateLogAmount,
  calculateLiveLogEstimate,
  calculateUnpaidTotal,
  DEFAULT_HOME_SECTION_ORDER,
  getActiveLog,
  getDurationMinutes,
  getPresetRate,
  getVisibleLogs,
  normalizeHomeSectionOrder,
} from './lib/calculations'
import {
  formatClockRange,
  formatDuration,
  formatMoney,
  formatWeekRange,
  fromDateTimeLocalInput,
  getWeekKey,
  toDateTimeLocalInput,
} from './lib/format'
import { captureStartLocation, skippedLocation } from './lib/location'
import { createWorkspaceRepository } from './services/repository'
import { useWorktrackStore } from './store/worktrackStore'
import type {
  HomeSectionId,
  JobMode,
  JobPreset,
  LogEntry,
  PresetIcon,
  SessionUser,
  UserSettings,
} from './types'

type ViewName = 'home' | 'logs' | 'presets'

type StartDraft = {
  title: string
  mode: JobMode
  rate: string
  flatAmount: string
  locationLabel: string
  notes: string
}

type ManualDraft = StartDraft & {
  startAt: string
  endAt: string
  adjustmentAmount: string
  paid: boolean
}

type PresetDraft = {
  title: string
  mode: JobMode
  defaultRate: string
  defaultFlatAmount: string
  icon: PresetIcon
  color: string
  notes: string
}

type LogModeFilter = JobMode | 'all'

type LogFilters = {
  presetId: string
  mode: LogModeFilter
  fromDate: string
  toDate: string
}

const inputClass =
  'min-w-0 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent)_18%,transparent)]'

const selectClass =
  'min-w-0 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent)_18%,transparent)]'

const labelClass = 'block min-w-0 space-y-2 text-sm font-medium text-stone-700'

const navItems: Array<{ id: ViewName; label: string; Icon: LucideIcon }> = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'logs', label: 'Logs', Icon: ReceiptText },
  { id: 'presets', label: 'Presets', Icon: BriefcaseBusiness },
]

const homeSectionOptions: Array<{
  id: HomeSectionId
  label: string
  Icon: LucideIcon
}> = [
  { id: 'summary', label: 'Unpaid total', Icon: WalletCards },
  { id: 'timer', label: 'Start job', Icon: Clock3 },
  { id: 'presets', label: 'Quick presets', Icon: BriefcaseBusiness },
  { id: 'recent', label: 'Recent unpaid', Icon: ReceiptText },
]

const accentSwatches = ['#247C6D', '#5B7CFA', '#E66D5E', '#D5972F', '#583E7A']
const presetColors = ['#247C6D', '#5B7CFA', '#E66D5E', '#D5972F', '#334155']

const presetIconOptions: Array<{ id: PresetIcon; label: string; Icon: LucideIcon }> = [
  { id: 'briefcase', label: 'Briefcase', Icon: BriefcaseBusiness },
  { id: 'hammer', label: 'Hammer', Icon: Hammer },
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'paintbrush', label: 'Paint', Icon: Paintbrush },
  { id: 'receipt', label: 'Receipt', Icon: ReceiptText },
  { id: 'truck', label: 'Truck', Icon: Truck },
  { id: 'wrench', label: 'Wrench', Icon: Wrench },
]

const manualPresetFilterId = '__manual__'

const defaultLogFilters: LogFilters = {
  presetId: 'all',
  mode: 'all',
  fromDate: '',
  toDate: '',
}

function numberFromInput(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dateInputBoundary(value: string, endOfDay = false) {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  const time = date.getTime()
  return Number.isFinite(time) ? time : null
}

function hasActiveLogFilters(filters: LogFilters) {
  return (
    filters.presetId !== defaultLogFilters.presetId ||
    filters.mode !== defaultLogFilters.mode ||
    Boolean(filters.fromDate) ||
    Boolean(filters.toDate)
  )
}

function applyLogFilters(logs: LogEntry[], filters: LogFilters) {
  const fromTime = dateInputBoundary(filters.fromDate)
  const toTime = dateInputBoundary(filters.toDate, true)

  return logs.filter((log) => {
    if (filters.mode !== 'all' && log.mode !== filters.mode) {
      return false
    }

    if (
      filters.presetId === manualPresetFilterId &&
      log.presetId !== null
    ) {
      return false
    }

    if (
      filters.presetId !== 'all' &&
      filters.presetId !== manualPresetFilterId &&
      log.presetId !== filters.presetId
    ) {
      return false
    }

    const startedAt = new Date(log.startAt).getTime()

    if (!Number.isFinite(startedAt)) {
      return false
    }

    if (fromTime !== null && startedAt < fromTime) {
      return false
    }

    if (toTime !== null && startedAt > toTime) {
      return false
    }

    return true
  })
}

function getFilteredVisibleLogs(
  logs: LogEntry[],
  showPaid: boolean,
  filters: LogFilters,
) {
  return applyLogFilters(getVisibleLogs(logs, showPaid), filters)
}

function useTicker(enabled: boolean) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) {
      return
    }

    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [enabled])

  return now
}

function iconForPreset(icon: PresetIcon) {
  return presetIconOptions.find((option) => option.id === icon)?.Icon ?? BriefcaseBusiness
}

function labelForHomeSection(sectionId: HomeSectionId) {
  return (
    homeSectionOptions.find((section) => section.id === sectionId)?.label ??
    sectionId
  )
}

function moveHomeSection(
  order: readonly HomeSectionId[],
  sectionId: HomeSectionId,
  direction: -1 | 1,
) {
  const nextOrder = normalizeHomeSectionOrder(order)
  const index = nextOrder.indexOf(sectionId)
  const nextIndex = index + direction

  if (index < 0 || nextIndex < 0 || nextIndex >= nextOrder.length) {
    return nextOrder
  }

  const [section] = nextOrder.splice(index, 1)
  nextOrder.splice(nextIndex, 0, section)
  return nextOrder
}

function PageFrame({
  children,
  reducedMotion,
}: {
  children: ReactNode
  reducedMotion: boolean
}) {
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
      className="space-y-5"
    >
      {children}
    </motion.section>
  )
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm transition active:scale-95"
    >
      {children}
    </button>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; Icon?: LucideIcon }>
}) {
  return (
    <div
      className="grid gap-1 rounded-2xl bg-stone-100 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(({ value: optionValue, label, Icon }) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={clsx(
            'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition',
            value === optionValue
              ? 'bg-white text-stone-950 shadow-sm'
              : 'text-stone-500',
          )}
        >
          {Icon ? <Icon size={16} /> : null}
          {label}
        </button>
      ))}
    </div>
  )
}

function AuthScreen({
  sessionError,
  isConfigured,
  onSignIn,
}: {
  sessionError: string
  isConfigured: boolean
  onSignIn: () => void
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f7f9f4] px-5">
      <section className="w-full max-w-[420px] rounded-[32px] border border-white/80 bg-white p-6 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-3xl bg-[#16302b] text-[#f7f9f4]">
            <ReceiptText size={28} />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">
              WorkTrack
            </p>
            <h1 className="text-3xl font-semibold text-stone-950">Job ledger</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white shadow-lg transition active:scale-[0.98]"
        >
          <UserRound size={20} />
          {isConfigured ? 'Continue with Google' : 'Open preview mode'}
        </button>
        {!isConfigured ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase env values are empty, so preview mode uses this phone only.
          </p>
        ) : null}
        {sessionError ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {sessionError}
          </p>
        ) : null}
      </section>
    </main>
  )
}

function StatusPill({ syncState, syncMessage }: { syncState: string; syncMessage: string }) {
  const label =
    syncState === 'loading'
      ? 'Syncing'
      : syncState === 'error'
        ? 'Needs sync'
        : 'Live'

  return (
    <div
      title={syncMessage || label}
      className={clsx(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
        syncState === 'error'
          ? 'bg-red-50 text-red-700'
          : 'bg-emerald-50 text-emerald-700',
      )}
    >
      <span className="size-2 rounded-full bg-current" />
      {label}
    </div>
  )
}

function AppHeader({
  view,
  onManual,
  onSettings,
}: {
  view: ViewName
  onManual: () => void
  onSettings: () => void
}) {
  const viewLabel = navItems.find((item) => item.id === view)?.label ?? 'Home'

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f9f4]/90 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">
            WorkTrack
          </p>
          <h1 className="text-3xl font-semibold text-stone-950">{viewLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton title="Manual log" onClick={onManual}>
            <Plus size={21} />
          </IconButton>
          <IconButton title="Settings" onClick={onSettings}>
            <Settings size={21} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}

function SummaryBand({
  total,
  count,
  settings,
}: {
  total: number
  count: number
  settings: UserSettings
}) {
  return (
    <section className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[28px] bg-stone-950 p-5 text-white shadow-xl">
      <div>
        <p className="text-sm font-medium text-white/60">Unpaid</p>
        <p className="mt-1 text-4xl font-semibold tracking-normal">
          {formatMoney(total, settings.currency, { whole: true })}
        </p>
      </div>
      <div className="grid size-16 place-items-center rounded-3xl bg-white/10 text-white">
        <WalletCards size={28} />
      </div>
      <p className="col-span-2 text-sm text-white/65">
        {count} open {count === 1 ? 'receipt' : 'receipts'}
      </p>
    </section>
  )
}

function TimerCard({
  activeLog,
  now,
  settings,
  onStart,
  onStop,
}: {
  activeLog: LogEntry | null
  now: Date
  settings: UserSettings
  onStart: () => void
  onStop: () => void
}) {
  if (!activeLog) {
    return (
      <section className="rounded-[30px] border border-white bg-white p-5 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-stone-500">Ready</p>
            <h2 className="text-2xl font-semibold text-stone-950">Start a job</h2>
          </div>
          <div className="grid size-12 place-items-center rounded-2xl bg-stone-100 text-stone-700">
            <Clock3 size={23} />
          </div>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="flex w-full items-center justify-center gap-3 rounded-[24px] bg-[var(--accent)] px-5 py-5 text-lg font-semibold text-white shadow-lg transition active:scale-[0.98]"
        >
          <Play fill="currentColor" size={22} />
          Start
        </button>
      </section>
    )
  }

  const minutes = getDurationMinutes(activeLog.startAt, now.toISOString())
  const amount = calculateLiveLogEstimate(activeLog, now)

  return (
    <section className="overflow-hidden rounded-[30px] border border-white bg-white shadow-sm">
      <div className="bg-[var(--accent)] px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/70">Running</p>
            <h2 className="mt-1 text-2xl font-semibold">{activeLog.title}</h2>
          </div>
          <div className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            {activeLog.mode}
          </div>
        </div>
        <p className="mt-6 text-5xl font-semibold tracking-normal">
          {formatDuration(minutes)}
        </p>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-stone-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Estimate
            </p>
            <p className="mt-2 text-xl font-semibold text-stone-950">
              {formatMoney(amount, settings.currency, { whole: true })}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              Place
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-stone-950">
              {activeLog.startLocation.label || activeLog.startLocation.permissionState}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex w-full items-center justify-center gap-3 rounded-[24px] bg-stone-950 px-5 py-5 text-lg font-semibold text-white shadow-lg transition active:scale-[0.98]"
        >
          <StopCircle size={23} />
          Stop
        </button>
      </div>
    </section>
  )
}

function QuickFlatReceipt({
  log,
  settings,
  onOpen,
}: {
  log: LogEntry | null
  settings: UserSettings
  onOpen: () => void
}) {
  if (!log) {
    return null
  }

  const amount = calculateLogAmount(log)

  return (
    <section className="rounded-[26px] border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <CircleDollarSign size={23} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
            Flat receipt added
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-stone-950">
            {log.title}
          </h3>
        </div>
        <p className="shrink-0 text-xl font-semibold text-stone-950">
          {formatMoney(amount, settings.currency, { whole: true })}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700"
      >
        <ReceiptText size={16} />
        Open receipt
      </button>
    </section>
  )
}

function PresetRail({
  presets,
  settings,
  onStartPreset,
  onCreate,
}: {
  presets: JobPreset[]
  settings: UserSettings
  onStartPreset: (preset: JobPreset) => void
  onCreate: () => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-950">Quick presets</h2>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm"
        >
          <Plus size={16} />
          Add
        </button>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {presets.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="flex min-w-full items-center justify-center gap-2 rounded-[24px] border border-dashed border-stone-300 bg-white px-4 py-5 text-sm font-semibold text-stone-500"
          >
            <BriefcaseBusiness size={18} />
            New preset
          </button>
        ) : (
          presets.map((preset) => {
            const Icon = iconForPreset(preset.icon)
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onStartPreset(preset)}
                className="min-w-[150px] snap-start rounded-[24px] bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
              >
                <span
                  className="grid size-11 place-items-center rounded-2xl text-white"
                  style={{ backgroundColor: preset.color }}
                >
                  <Icon size={21} />
                </span>
                <span className="mt-4 block truncate text-base font-semibold text-stone-950">
                  {preset.title}
                </span>
                <span className="mt-1 block text-sm text-stone-500">
                  {preset.mode === 'hourly'
                    ? `${formatMoney(getPresetRate(preset, settings), settings.currency)}/hr`
                    : formatMoney(preset.defaultFlatAmount ?? 0, settings.currency)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}

function LogCard({
  log,
  settings,
  selected,
  selectionMode,
  isPayTarget,
  onSelect,
  onOpen,
  onTogglePaid,
}: {
  log: LogEntry
  settings: UserSettings
  selected: boolean
  selectionMode: boolean
  isPayTarget: boolean
  onSelect: () => void
  onOpen: () => void
  onTogglePaid: () => void
}) {
  const amount = calculateLogAmount(log)
  const isPaid = Boolean(log.paidAt)
  const statusLabel = log.status === 'active' ? 'Running' : isPaid ? 'Paid' : 'Unpaid'
  const PaidActionIcon = isPaid ? Undo2 : Check

  return (
    <motion.article
      layout
      animate={{
        scale: selected || isPayTarget ? 0.99 : 1,
      }}
      className={clsx(
        'rounded-[24px] bg-white p-4 shadow-sm ring-1 transition-colors',
        selected || isPayTarget
          ? 'ring-[color:color-mix(in_srgb,var(--accent)_24%,transparent)]'
          : 'ring-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        {selectionMode ? (
          <button
            type="button"
            onClick={onSelect}
            className="mt-1 text-[var(--accent)]"
            title={selected ? 'Deselect log' : 'Select log'}
          >
            {selected ? <SquareCheckBig size={22} /> : <Square size={22} />}
          </button>
        ) : null}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-stone-950">
                {log.title}
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                {formatClockRange(log.startAt, log.endAt)}
              </p>
            </div>
            <p className="shrink-0 text-base font-semibold text-stone-950">
              {formatMoney(amount, settings.currency, { whole: true })}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                log.status === 'active'
                  ? 'bg-blue-50 text-blue-700'
                  : isPaid
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800',
              )}
            >
              {statusLabel}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
              {log.mode}
            </span>
            {log.startLocation.label ? (
              <span className="flex max-w-full items-center gap-1 truncate rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                <MapPin size={13} />
                {log.startLocation.label}
              </span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          onClick={onTogglePaid}
          className={clsx(
            'grid size-10 shrink-0 place-items-center rounded-full transition',
            isPaid ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700',
          )}
          title={isPaid ? 'Mark unpaid' : 'Mark paid'}
        >
          <PaidActionIcon size={18} />
        </button>
      </div>
    </motion.article>
  )
}

function HomeView({
  logs,
  presets,
  settings,
  activeLog,
  quickFlatLog,
  now,
  onStart,
  onStop,
  onManual,
  onStartPreset,
  onCreatePreset,
  onOpenLog,
  reducedMotion,
}: {
  logs: LogEntry[]
  presets: JobPreset[]
  settings: UserSettings
  activeLog: LogEntry | null
  quickFlatLog: LogEntry | null
  now: Date
  onStart: () => void
  onStop: () => void
  onManual: () => void
  onStartPreset: (preset: JobPreset) => void
  onCreatePreset: () => void
  onOpenLog: (log: LogEntry) => void
  reducedMotion: boolean
}) {
  const unpaidTotal = calculateUnpaidTotal(logs)
  const unpaidCount = logs.filter((log) => log.status === 'stopped' && !log.paidAt).length
  const recentLogs = getVisibleLogs(logs, false)
    .filter((log) => log.status === 'stopped')
    .slice(0, 4)
  const sectionOrder = normalizeHomeSectionOrder(settings.homeSectionOrder)
  const sections: Record<HomeSectionId, ReactNode> = {
    summary: (
      <SummaryBand total={unpaidTotal} count={unpaidCount} settings={settings} />
    ),
    timer: (
      <>
        <TimerCard
          activeLog={activeLog}
          now={now}
          settings={settings}
          onStart={onStart}
          onStop={onStop}
        />
        <QuickFlatReceipt
          log={quickFlatLog}
          settings={settings}
          onOpen={() => quickFlatLog && onOpenLog(quickFlatLog)}
        />
      </>
    ),
    presets: (
      <PresetRail
        presets={presets}
        settings={settings}
        onStartPreset={onStartPreset}
        onCreate={onCreatePreset}
      />
    ),
    recent: (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-950">Recent unpaid</h2>
          <button
            type="button"
            onClick={onManual}
            className="flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm"
          >
            <Pencil size={15} />
            Manual
          </button>
        </div>
        {recentLogs.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-white px-4 py-5 text-center text-sm font-semibold text-stone-500">
            No unpaid logs
          </div>
        ) : (
          recentLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              settings={settings}
              selected={false}
              selectionMode={false}
              isPayTarget={false}
              onSelect={() => undefined}
              onOpen={() => onOpenLog(log)}
              onTogglePaid={() => onOpenLog(log)}
            />
          ))
        )}
      </section>
    ),
  }

  return (
    <PageFrame reducedMotion={reducedMotion}>
      {sectionOrder.map((sectionId) => (
        <motion.div key={sectionId} layout>
          {sections[sectionId]}
        </motion.div>
      ))}
    </PageFrame>
  )
}

function LogsFilterPanel({
  presets,
  filters,
  visibleCount,
  onChange,
  onReset,
}: {
  presets: JobPreset[]
  filters: LogFilters
  visibleCount: number
  onChange: (filters: LogFilters) => void
  onReset: () => void
}) {
  const hasFilters = hasActiveLogFilters(filters)
  const [isOpen, setIsOpen] = useState(hasFilters)

  return (
    <section className="space-y-3">
      <motion.button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        whileTap={{ scale: 0.94 }}
        className={clsx(
          'grid size-11 place-items-center rounded-full shadow-sm transition',
          isOpen || hasFilters
            ? 'bg-[var(--accent)] text-white'
            : 'bg-white text-stone-700',
        )}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Hide filters' : 'Show filters'}
        title={isOpen ? 'Hide filters' : 'Show filters'}
      >
        <Filter size={18} />
      </motion.button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="filters"
            initial={{ height: 0, opacity: 0, y: -6 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-[24px] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-stone-950">Filters</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                    {visibleCount} shown
                  </span>
                  {hasFilters ? (
                    <button
                      type="button"
                      onClick={onReset}
                      className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={labelClass}>
                  Preset
                  <select
                    className={selectClass}
                    value={filters.presetId}
                    onChange={(event) =>
                      onChange({ ...filters, presetId: event.target.value })
                    }
                  >
                    <option value="all">All jobs</option>
                    <option value={manualPresetFilterId}>Manual</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Type
                  <select
                    className={selectClass}
                    value={filters.mode}
                    onChange={(event) =>
                      onChange({ ...filters, mode: event.target.value as LogModeFilter })
                    }
                  >
                    <option value="all">All types</option>
                    <option value="hourly">Hourly</option>
                    <option value="flat">Flat</option>
                  </select>
                </label>
                <label className={labelClass}>
                  From
                  <input
                    className={inputClass}
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) =>
                      onChange({ ...filters, fromDate: event.target.value })
                    }
                  />
                </label>
                <label className={labelClass}>
                  To
                  <input
                    className={inputClass}
                    type="date"
                    value={filters.toDate}
                    onChange={(event) =>
                      onChange({ ...filters, toDate: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

function LogsView({
  logs,
  presets,
  settings,
  showPaid,
  filters,
  selectedLogIds,
  payTargetIds,
  onFiltersChange,
  onShowPaid,
  onOpenLog,
  onToggleSelection,
  onTogglePaid,
  onMarkSelectedPaid,
  onMarkAllPaid,
  onClearSelection,
  reducedMotion,
}: {
  logs: LogEntry[]
  presets: JobPreset[]
  settings: UserSettings
  showPaid: boolean
  filters: LogFilters
  selectedLogIds: string[]
  payTargetIds: string[]
  onFiltersChange: (filters: LogFilters) => void
  onShowPaid: (showPaid: boolean) => void
  onOpenLog: (log: LogEntry) => void
  onToggleSelection: (id: string) => void
  onTogglePaid: (id: string) => void
  onMarkSelectedPaid: () => void
  onMarkAllPaid: () => void
  onClearSelection: () => void
  reducedMotion: boolean
}) {
  const visibleLogs = getFilteredVisibleLogs(logs, showPaid, filters)
  const hasSelection = selectedLogIds.length > 0
  const magneticLogIds =
    payTargetIds.length > 0
      ? payTargetIds
      : selectedLogIds.length > 1
        ? selectedLogIds
        : []
  const visibleUnpaidCount = visibleLogs.filter(
    (log) => log.status === 'stopped' && !log.paidAt,
  ).length
  const groupedLogs = visibleLogs.reduce<Array<{ key: string; label: string; logs: LogEntry[] }>>(
    (groups, log) => {
      const key = getWeekKey(log.startAt)
      const group = groups.find((entry) => entry.key === key)

      if (group) {
        group.logs.push(log)
        return groups
      }

      groups.push({
        key,
        label: formatWeekRange(log.startAt),
        logs: [log],
      })
      return groups
    },
    [],
  )

  return (
    <PageFrame reducedMotion={reducedMotion}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={showPaid ? 'all' : 'unpaid'}
          onChange={(value) => onShowPaid(value === 'all')}
          options={[
            { value: 'unpaid', label: 'Unpaid', Icon: EyeOff },
            { value: 'all', label: 'All', Icon: Eye },
          ]}
        />
        <div className="flex items-center gap-2">
          {visibleUnpaidCount > 0 ? (
            <button
              type="button"
              onClick={onMarkAllPaid}
              className="rounded-full bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm"
            >
              Mark shown paid
            </button>
          ) : null}
          {hasSelection ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-600 shadow-sm"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      {hasSelection ? (
        <button
          type="button"
          onClick={onMarkSelectedPaid}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
        >
          <Check size={17} />
          Mark selected paid
        </button>
      ) : null}
      <LogsFilterPanel
        presets={presets}
        filters={filters}
        visibleCount={visibleLogs.length}
        onChange={onFiltersChange}
        onReset={() => onFiltersChange(defaultLogFilters)}
      />
      <div className="space-y-3">
        {visibleLogs.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
            No logs here
          </div>
        ) : (
          groupedLogs.map((group) => (
            <section key={group.key}>
              <div className="flex items-center gap-3 pt-1">
                <span className="h-px flex-1 bg-stone-200" />
                <p className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 shadow-sm">
                  {group.label}
                </p>
                <span className="h-px flex-1 bg-stone-200" />
              </div>
              <div className="mt-3">
                {group.logs.map((log, index) => {
                  const isMagnetic = magneticLogIds.includes(log.id)
                  const previousLog = group.logs[index - 1]
                  const previousIsMagnetic = previousLog
                    ? magneticLogIds.includes(previousLog.id)
                    : false

                  return (
                    <motion.div
                      key={log.id}
                      layout
                      className={clsx(
                        index === 0
                          ? ''
                          : isMagnetic && previousIsMagnetic
                            ? 'mt-1'
                            : 'mt-3',
                      )}
                    >
                      <LogCard
                        log={log}
                        settings={settings}
                        selected={selectedLogIds.includes(log.id)}
                        selectionMode
                        isPayTarget={isMagnetic}
                        onSelect={() => onToggleSelection(log.id)}
                        onOpen={() => onOpenLog(log)}
                        onTogglePaid={() => onTogglePaid(log.id)}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </PageFrame>
  )
}

function PresetsView({
  presets,
  settings,
  onCreate,
  onEdit,
  onStartPreset,
  reducedMotion,
}: {
  presets: JobPreset[]
  settings: UserSettings
  onCreate: () => void
  onEdit: (preset: JobPreset) => void
  onStartPreset: (preset: JobPreset) => void
  reducedMotion: boolean
}) {
  return (
    <PageFrame reducedMotion={reducedMotion}>
      <button
        type="button"
        onClick={onCreate}
        className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-[var(--accent)] px-5 py-4 text-base font-semibold text-white shadow-lg"
      >
        <Plus size={20} />
        Add preset
      </button>
      <div className="space-y-3">
        {presets.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">
            No presets yet
          </div>
        ) : (
          presets.map((preset) => {
            const Icon = iconForPreset(preset.icon)
            return (
              <article key={preset.id} className="rounded-[24px] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div
                    className="grid size-12 shrink-0 place-items-center rounded-2xl text-white"
                    style={{ backgroundColor: preset.color }}
                  >
                    <Icon size={23} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-stone-950">
                      {preset.title}
                    </h3>
                    <p className="text-sm text-stone-500">
                      {preset.mode === 'hourly'
                        ? `${formatMoney(getPresetRate(preset, settings), settings.currency)}/hr`
                        : formatMoney(preset.defaultFlatAmount ?? 0, settings.currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartPreset(preset)}
                    className="grid size-10 place-items-center rounded-full bg-stone-950 text-white"
                    title="Start preset"
                  >
                    <Play fill="currentColor" size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(preset)}
                    className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-600"
                    title="Edit preset"
                  >
                    <Pencil size={17} />
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </PageFrame>
  )
}

function BottomNav({
  view,
  onChange,
}: {
  view: ViewName
  onChange: (view: ViewName) => void
}) {
  return (
    <nav className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+10px)] left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 px-7">
      <div className="pointer-events-auto mx-auto grid max-w-[330px] grid-cols-3 items-center gap-1 rounded-full border border-white/60 bg-white/55 p-1 shadow-2xl shadow-stone-950/15 ring-1 ring-stone-950/5 backdrop-blur-2xl">
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={clsx(
              'flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-xs font-semibold',
              view === id
                ? 'bg-white/90 text-stone-950 shadow-sm'
                : 'text-stone-600 hover:bg-white/35',
            )}
            aria-label={label}
            title={label}
          >
            <Icon className="shrink-0" size={19} />
            <span className="block min-h-[19px] whitespace-nowrap text-center leading-[19px]">
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function StartLogModal({
  open,
  settings,
  onClose,
  onSubmit,
}: {
  open: boolean
  settings: UserSettings
  onClose: () => void
  onSubmit: (draft: StartDraft) => void
}) {
  const [draft, setDraft] = useState<StartDraft>({
    title: '',
    mode: 'hourly',
    rate: String(settings.defaultRate),
    flatAmount: '',
    locationLabel: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setDraft({
        title: '',
        mode: 'hourly',
        rate: String(settings.defaultRate),
        flatAmount: '',
        locationLabel: '',
        notes: '',
      })
    }
  }, [open, settings.defaultRate])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(draft)
  }

  return (
    <Modal
      open={open}
      title="Start job"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="start-log-form"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-4 text-base font-semibold text-white shadow-lg"
        >
          <Play fill="currentColor" size={18} />
          Start
        </button>
      }
    >
      <form id="start-log-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className={labelClass}>
          Title
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Kitchen install"
          />
        </label>
        <Segmented
          value={draft.mode}
          onChange={(value) => setDraft({ ...draft, mode: value as JobMode })}
          options={[
            { value: 'hourly', label: 'Hourly', Icon: Clock3 },
            { value: 'flat', label: 'Flat', Icon: CircleDollarSign },
          ]}
        />
        {draft.mode === 'hourly' ? (
          <label className={labelClass}>
            Rate
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.rate}
              onChange={(event) => setDraft({ ...draft, rate: event.target.value })}
              placeholder="45"
            />
          </label>
        ) : (
          <label className={labelClass}>
            Amount
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.flatAmount}
              onChange={(event) => setDraft({ ...draft, flatAmount: event.target.value })}
              placeholder="250"
            />
          </label>
        )}
        <label className={labelClass}>
          Place label
          <input
            className={inputClass}
            value={draft.locationLabel}
            onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })}
            placeholder="Maple Street"
          />
        </label>
        <label className={labelClass}>
          Notes
          <textarea
            className={clsx(inputClass, 'min-h-24 resize-none')}
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            placeholder="Materials, customer, quick details"
          />
        </label>
      </form>
    </Modal>
  )
}

function ManualLogModal({
  open,
  settings,
  onClose,
  onSubmit,
}: {
  open: boolean
  settings: UserSettings
  onClose: () => void
  onSubmit: (draft: ManualDraft) => void
}) {
  const [draft, setDraft] = useState<ManualDraft>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 60 * 60000)
    return {
      title: '',
      mode: 'hourly',
      rate: String(settings.defaultRate),
      flatAmount: '',
      startAt: toDateTimeLocalInput(start),
      endAt: toDateTimeLocalInput(end),
      adjustmentAmount: '0',
      locationLabel: '',
      paid: false,
      notes: '',
    }
  })

  useEffect(() => {
    if (open) {
      const end = new Date()
      const start = new Date(end.getTime() - 60 * 60000)
      setDraft({
        title: '',
        mode: 'hourly',
        rate: String(settings.defaultRate),
        flatAmount: '',
        startAt: toDateTimeLocalInput(start),
        endAt: toDateTimeLocalInput(end),
        adjustmentAmount: '0',
        locationLabel: '',
        paid: false,
        notes: '',
      })
    }
  }, [open, settings.defaultRate])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(draft)
  }

  return (
    <Modal
      open={open}
      title="Manual log"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="manual-log-form"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white shadow-lg"
        >
          <Save size={18} />
          Save log
        </button>
      }
    >
      <form id="manual-log-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className={labelClass}>
          Title
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Fence repair"
          />
        </label>
        <Segmented
          value={draft.mode}
          onChange={(value) => setDraft({ ...draft, mode: value as JobMode })}
          options={[
            { value: 'hourly', label: 'Hourly', Icon: Clock3 },
            { value: 'flat', label: 'Flat', Icon: CircleDollarSign },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Start
            <input
              className={inputClass}
              type="datetime-local"
              value={draft.startAt}
              onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}
            />
          </label>
          {draft.mode === 'hourly' ? (
            <label className={labelClass}>
              Stop
              <input
                className={inputClass}
                type="datetime-local"
                value={draft.endAt}
                onChange={(event) => setDraft({ ...draft, endAt: event.target.value })}
              />
            </label>
          ) : null}
        </div>
        {draft.mode === 'hourly' ? (
          <label className={labelClass}>
            Rate
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.rate}
              onChange={(event) => setDraft({ ...draft, rate: event.target.value })}
            />
          </label>
        ) : (
          <label className={labelClass}>
            Amount
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.flatAmount}
              onChange={(event) => setDraft({ ...draft, flatAmount: event.target.value })}
              placeholder="250"
            />
          </label>
        )}
        <label className={labelClass}>
          Adjustment
          <input
            className={inputClass}
            inputMode="decimal"
            value={draft.adjustmentAmount}
            onChange={(event) => setDraft({ ...draft, adjustmentAmount: event.target.value })}
          />
        </label>
        <label className={labelClass}>
          Place label
          <input
            className={inputClass}
            value={draft.locationLabel}
            onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })}
            placeholder="Shop, client name, address"
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
          Paid
          <input
            type="checkbox"
            checked={draft.paid}
            onChange={(event) => setDraft({ ...draft, paid: event.target.checked })}
            className="size-5 accent-[var(--accent)]"
          />
        </label>
        <label className={labelClass}>
          Notes
          <textarea
            className={clsx(inputClass, 'min-h-24 resize-none')}
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>
      </form>
    </Modal>
  )
}

function PresetModal({
  open,
  settings,
  preset,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean
  settings: UserSettings
  preset: JobPreset | null
  onClose: () => void
  onSubmit: (draft: PresetDraft, id?: string) => void
  onDelete: (preset: JobPreset) => void
}) {
  const [draft, setDraft] = useState<PresetDraft>({
    title: '',
    mode: 'hourly',
    defaultRate: String(settings.defaultRate),
    defaultFlatAmount: '',
    icon: 'briefcase',
    color: presetColors[0],
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setDraft({
        title: preset?.title ?? '',
        mode: preset?.mode ?? 'hourly',
        defaultRate: String(preset?.defaultRate ?? settings.defaultRate),
        defaultFlatAmount: String(preset?.defaultFlatAmount ?? ''),
        icon: preset?.icon ?? 'briefcase',
        color: preset?.color ?? presetColors[0],
        notes: preset?.notes ?? '',
      })
    }
  }, [open, preset, settings.defaultRate])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(draft, preset?.id)
  }

  return (
    <Modal
      open={open}
      title={preset ? 'Edit preset' : 'New preset'}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          {preset ? (
            <button
              type="button"
              onClick={() => onDelete(preset)}
              className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-700"
              title="Delete preset"
            >
              <Trash2 size={19} />
            </button>
          ) : null}
          <button
            type="submit"
            form="preset-form"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-4 text-base font-semibold text-white shadow-lg"
          >
            <Save size={18} />
            Save preset
          </button>
        </div>
      }
    >
      <form id="preset-form" className="space-y-4" onSubmit={handleSubmit}>
        <label className={labelClass}>
          Title
          <input
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="Deck work"
          />
        </label>
        <Segmented
          value={draft.mode}
          onChange={(value) => setDraft({ ...draft, mode: value as JobMode })}
          options={[
            { value: 'hourly', label: 'Hourly', Icon: Clock3 },
            { value: 'flat', label: 'Flat', Icon: CircleDollarSign },
          ]}
        />
        {draft.mode === 'hourly' ? (
          <label className={labelClass}>
            Default rate
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.defaultRate}
              onChange={(event) => setDraft({ ...draft, defaultRate: event.target.value })}
            />
          </label>
        ) : (
          <label className={labelClass}>
            Default amount
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.defaultFlatAmount}
              onChange={(event) =>
                setDraft({ ...draft, defaultFlatAmount: event.target.value })
              }
            />
          </label>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Icon</p>
          <div className="grid grid-cols-7 gap-2">
            {presetIconOptions.map(({ id, Icon, label }) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => setDraft({ ...draft, icon: id })}
                className={clsx(
                  'grid size-10 place-items-center rounded-2xl border transition',
                  draft.icon === id
                    ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]'
                    : 'border-stone-200 bg-white text-stone-500',
                )}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Color</p>
          <div className="flex gap-2">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setDraft({ ...draft, color })}
                className="grid size-10 place-items-center rounded-full border border-white shadow-sm"
                style={{ backgroundColor: color }}
              >
                {draft.color === color ? <Check className="text-white" size={17} /> : null}
              </button>
            ))}
          </div>
        </div>
        <label className={labelClass}>
          Notes
          <textarea
            className={clsx(inputClass, 'min-h-24 resize-none')}
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>
      </form>
    </Modal>
  )
}

function SettingsModal({
  open,
  settings,
  session,
  syncState,
  syncMessage,
  onClose,
  onSubmit,
  onSignOut,
}: {
  open: boolean
  settings: UserSettings
  session: SessionUser
  syncState: string
  syncMessage: string
  onClose: () => void
  onSubmit: (settings: UserSettings) => void
  onSignOut: () => void
}) {
  const [draft, setDraft] = useState<UserSettings>(settings)

  useEffect(() => {
    if (open) {
      setDraft(settings)
    }
  }, [open, settings])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(draft)
  }
  const homeSectionOrder = normalizeHomeSectionOrder(draft.homeSectionOrder)

  return (
    <Modal
      open={open}
      title="Settings"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-14 place-items-center rounded-2xl bg-stone-100 text-stone-700"
            title="Sign out"
          >
            <LogOut size={19} />
          </button>
          <button
            type="submit"
            form="settings-form"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white shadow-lg"
          >
            <Save size={18} />
            Save settings
          </button>
        </div>
      }
    >
      <form id="settings-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-3 rounded-2xl bg-stone-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-stone-950">{session.displayName}</p>
            <p className="truncate text-sm text-stone-500">{session.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill syncState={syncState} syncMessage={syncMessage} />
            {session.isPreview ? (
              <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                Preview
              </span>
            ) : null}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl bg-stone-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-stone-950">Home layout</p>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  homeSectionOrder: [...DEFAULT_HOME_SECTION_ORDER],
                })
              }
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm"
            >
              Reset
            </button>
          </div>
          <div className="space-y-2">
            {homeSectionOrder.map((sectionId, index) => {
              const option = homeSectionOptions.find(
                (section) => section.id === sectionId,
              )
              const Icon = option?.Icon ?? ReceiptText

              return (
                <div
                  key={sectionId}
                  className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600">
                    <Icon size={17} />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                    {labelForHomeSection(sectionId)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        homeSectionOrder: moveHomeSection(
                          homeSectionOrder,
                          sectionId,
                          -1,
                        ),
                      })
                    }
                    disabled={index === 0}
                    className="grid size-9 place-items-center rounded-full bg-stone-100 text-stone-600 disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        homeSectionOrder: moveHomeSection(
                          homeSectionOrder,
                          sectionId,
                          1,
                        ),
                      })
                    }
                    disabled={index === homeSectionOrder.length - 1}
                    className="grid size-9 place-items-center rounded-full bg-stone-100 text-stone-600 disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Default rate
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.defaultRate}
              onChange={(event) =>
                setDraft({ ...draft, defaultRate: numberFromInput(event.target.value) })
              }
            />
          </label>
          <label className={labelClass}>
            Round min
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.roundingMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  roundingMinutes: numberFromInput(event.target.value, 15),
                })
              }
            />
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Accent</p>
          <div className="flex gap-2">
            {accentSwatches.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => setDraft({ ...draft, accentColor: color })}
                className="grid size-10 place-items-center rounded-full border border-white shadow-sm"
                style={{ backgroundColor: color }}
              >
                {draft.accentColor === color ? (
                  <Check className="text-white" size={17} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
          Location stamp
          <input
            type="checkbox"
            checked={draft.locationMode === 'ask'}
            onChange={(event) =>
              setDraft({ ...draft, locationMode: event.target.checked ? 'ask' : 'off' })
            }
            className="size-5 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
          Hide paid
          <input
            type="checkbox"
            checked={draft.hidePaidByDefault}
            onChange={(event) =>
              setDraft({ ...draft, hidePaidByDefault: event.target.checked })
            }
            className="size-5 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
          Reduced motion
          <input
            type="checkbox"
            checked={draft.reducedMotion}
            onChange={(event) =>
              setDraft({ ...draft, reducedMotion: event.target.checked })
            }
            className="size-5 accent-[var(--accent)]"
          />
        </label>
      </form>
    </Modal>
  )
}

function LogDetailModal({
  log,
  settings,
  onClose,
  onSave,
  onTogglePaid,
  onDelete,
}: {
  log: LogEntry | null
  settings: UserSettings
  onClose: () => void
  onSave: (log: LogEntry, patch: Partial<LogEntry>) => void
  onTogglePaid: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [locationLabel, setLocationLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [startAtInput, setStartAtInput] = useState('')
  const [endAtInput, setEndAtInput] = useState('')

  useEffect(() => {
    setLocationLabel(log?.startLocation.label ?? '')
    setNotes(log?.notes ?? '')
    setStartAtInput(log ? toDateTimeLocalInput(new Date(log.startAt)) : '')
    setEndAtInput(
      log?.endAt ? toDateTimeLocalInput(new Date(log.endAt)) : '',
    )
  }, [log])

  if (!log) {
    return null
  }

  const amount = calculateLogAmount(log)
  const PaidActionIcon = log.paidAt ? Undo2 : Check
  const saveDetail = () => {
    const startAt = startAtInput
      ? fromDateTimeLocalInput(startAtInput)
      : log.startAt
    const requestedEndAt =
      log.status === 'active'
        ? null
        : fromDateTimeLocalInput(endAtInput || startAtInput || log.startAt)
    const endAt =
      requestedEndAt && new Date(requestedEndAt).getTime() < new Date(startAt).getTime()
        ? startAt
        : requestedEndAt

    onSave(log, {
      startAt,
      endAt,
      notes,
      startLocation: {
        ...log.startLocation,
        label: locationLabel,
        capturedAt: startAt,
      },
    })
  }

  return (
    <Modal
      open={Boolean(log)}
      title="Log"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[auto_auto_1fr] gap-3">
          <button
            type="button"
            onClick={() => onDelete(log.id)}
            className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-700"
            title="Delete log"
          >
            <Trash2 size={19} />
          </button>
          <button
            type="button"
            onClick={() => onTogglePaid(log.id)}
            className={clsx(
              'grid size-14 place-items-center rounded-2xl',
              log.paidAt
                ? 'bg-orange-50 text-orange-700'
                : 'bg-emerald-50 text-emerald-700',
            )}
            title={log.paidAt ? 'Mark unpaid' : 'Mark paid'}
          >
            <PaidActionIcon size={19} />
          </button>
          <button
            type="button"
            onClick={saveDetail}
            className="flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-white shadow-lg"
          >
            <Save size={18} />
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[24px] bg-stone-100 p-4">
          <p className="text-sm text-stone-500">{formatClockRange(log.startAt, log.endAt)}</p>
          <h3 className="mt-2 text-2xl font-semibold text-stone-950">{log.title}</h3>
          <p className="mt-3 text-3xl font-semibold text-stone-950">
            {formatMoney(amount, settings.currency, { whole: true })}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Start
            <input
              className={inputClass}
              type="datetime-local"
              value={startAtInput}
              onChange={(event) => setStartAtInput(event.target.value)}
            />
          </label>
          {log.status === 'stopped' ? (
            <label className={labelClass}>
              Stop
              <input
                className={inputClass}
                type="datetime-local"
                value={endAtInput}
                onChange={(event) => setEndAtInput(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <label className={labelClass}>
          Place label
          <input
            className={inputClass}
            value={locationLabel}
            onChange={(event) => setLocationLabel(event.target.value)}
          />
        </label>
        {log.startLocation.latitude && log.startLocation.longitude ? (
          <a
            className="flex items-center gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700"
            href={`https://maps.google.com/?q=${log.startLocation.latitude},${log.startLocation.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            <LocateFixed size={17} />
            Open map
          </a>
        ) : null}
        <label className={labelClass}>
          Notes
          <textarea
            className={clsx(inputClass, 'min-h-28 resize-none')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}

function LoadingScreen() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f7f9f4] text-stone-700">
      <Loader2 className="animate-spin" size={32} />
    </main>
  )
}

function App() {
  const { session, isReady, error, isFirebaseConfigured, signIn, signOut } = useAuthSession()
  const [repository] = useState(() => createWorkspaceRepository())
  const [view, setView] = useState<ViewName>('home')
  const [startOpen, setStartOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<JobPreset | null>(null)
  const [detailLogId, setDetailLogId] = useState<string | null>(null)
  const [quickFlatLogId, setQuickFlatLogId] = useState<string | null>(null)
  const [payTargetIds, setPayTargetIds] = useState<string[]>([])
  const [logFilters, setLogFilters] = useState<LogFilters>(defaultLogFilters)
  const logs = useWorktrackStore((state) => state.logs)
  const presets = useWorktrackStore((state) => state.presets)
  const settings = useWorktrackStore((state) => state.settings)
  const syncState = useWorktrackStore((state) => state.syncState)
  const syncMessage = useWorktrackStore((state) => state.syncMessage)
  const selectedLogIds = useWorktrackStore((state) => state.selectedLogIds)
  const setWorkspace = useWorktrackStore((state) => state.setWorkspace)
  const setSyncState = useWorktrackStore((state) => state.setSyncState)
  const resetWorkspace = useWorktrackStore((state) => state.resetWorkspace)
  const createActiveLog = useWorktrackStore((state) => state.createActiveLog)
  const addManualLog = useWorktrackStore((state) => state.addManualLog)
  const stopActiveLog = useWorktrackStore((state) => state.stopActiveLog)
  const updateLog = useWorktrackStore((state) => state.updateLog)
  const deleteLog = useWorktrackStore((state) => state.deleteLog)
  const upsertPreset = useWorktrackStore((state) => state.upsertPreset)
  const deletePreset = useWorktrackStore((state) => state.deletePreset)
  const updateSettings = useWorktrackStore((state) => state.updateSettings)
  const toggleLogSelection = useWorktrackStore((state) => state.toggleLogSelection)
  const clearSelection = useWorktrackStore((state) => state.clearSelection)
  const markLogsPaid = useWorktrackStore((state) => state.markLogsPaid)
  const toggleLogPaid = useWorktrackStore((state) => state.toggleLogPaid)
  const [showPaid, setShowPaid] = useState(!settings.hidePaidByDefault)
  const activeLog = useMemo(() => getActiveLog(logs), [logs])
  const detailLog = useMemo(
    () => logs.find((log) => log.id === detailLogId) ?? null,
    [detailLogId, logs],
  )
  const quickFlatLog = useMemo(
    () => logs.find((log) => log.id === quickFlatLogId) ?? null,
    [logs, quickFlatLogId],
  )
  const now = useTicker(Boolean(activeLog))
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(settings.reducedMotion || systemReducedMotion)

  useEffect(() => {
    setShowPaid(!settings.hidePaidByDefault)
  }, [settings.hidePaidByDefault])

  useEffect(() => {
    if (activeLog && startOpen) {
      setStartOpen(false)
    }
  }, [activeLog, startOpen])

  useEffect(() => {
    if (!quickFlatLogId) {
      return
    }

    const timeout = window.setTimeout(() => {
      setQuickFlatLogId((currentId) =>
        currentId === quickFlatLogId ? null : currentId,
      )
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [quickFlatLogId])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor)
  }, [settings.accentColor])

  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.colorScheme = 'light'
  }, [])

  useEffect(() => {
    if (!session) {
      resetWorkspace()
      return
    }

    setSyncState('loading')
    return repository.subscribe(session.uid, setWorkspace, (message) =>
      setSyncState('error', message),
    )
  }, [repository, resetWorkspace, session, setSyncState, setWorkspace])

  const persistLog = (log: LogEntry) => {
    if (!session) {
      return
    }

    void repository
      .saveLog(session.uid, log)
      .catch((persistError: unknown) =>
        setSyncState(
          'error',
          persistError instanceof Error ? persistError.message : 'Could not save log.',
        ),
      )
  }

  const persistPreset = (preset: JobPreset) => {
    if (!session) {
      return
    }

    void repository
      .savePreset(session.uid, preset)
      .catch((persistError: unknown) =>
        setSyncState(
          'error',
          persistError instanceof Error ? persistError.message : 'Could not save preset.',
        ),
      )
  }

  const persistSettings = (nextSettings: UserSettings) => {
    if (!session) {
      return
    }

    void repository
      .saveSettings(session.uid, nextSettings)
      .catch((persistError: unknown) =>
        setSyncState(
          'error',
          persistError instanceof Error ? persistError.message : 'Could not save settings.',
        ),
      )
  }

  const saveFlatReceiptFromDraft = (
    draft: StartDraft,
    presetId: string | null = null,
  ) => {
    if (!session) {
      return null
    }

    const startAt = new Date().toISOString()
    const log = addManualLog({
      uid: session.uid,
      title: draft.title,
      mode: 'flat',
      presetId,
      rate: null,
      flatAmount: numberFromInput(draft.flatAmount),
      startAt,
      endAt: null,
      adjustmentAmount: 0,
      paid: false,
      locationLabel: draft.locationLabel.trim(),
      notes: draft.notes,
      startLocation: skippedLocation(startAt, draft.locationLabel.trim()),
    })

    persistLog(log)
    setQuickFlatLogId(log.id)
    setView('home')

    if (settings.locationMode === 'ask') {
      void captureStartLocation(settings, draft.locationLabel.trim()).then((location) => {
        const updated = useWorktrackStore
          .getState()
          .updateLog(log.id, { startLocation: location })

        if (updated) {
          persistLog(updated)
        }
      })
    }

    return log
  }

  const startLogFromDraft = (draft: StartDraft, presetId: string | null = null) => {
    if (!session) {
      return
    }

    if (draft.mode === 'flat') {
      saveFlatReceiptFromDraft(draft, presetId)
      setStartOpen(false)
      return
    }

    const log = createActiveLog({
      uid: session.uid,
      title: draft.title,
      mode: draft.mode,
      presetId,
      rate: numberFromInput(draft.rate, settings.defaultRate),
      flatAmount: numberFromInput(draft.flatAmount),
      locationLabel: draft.locationLabel.trim(),
      notes: draft.notes,
    })

    if (!log) {
      setStartOpen(false)
      return
    }

    persistLog(log)
    setStartOpen(false)

    if (settings.locationMode === 'ask') {
      void captureStartLocation(settings, draft.locationLabel.trim()).then((location) => {
        const updated = useWorktrackStore
          .getState()
          .updateLog(log.id, { startLocation: location })

        if (updated) {
          persistLog(updated)
        }
      })
    }
  }

  const startPreset = (preset: JobPreset) => {
    startLogFromDraft(
      {
        title: preset.title,
        mode: preset.mode,
        rate: String(getPresetRate(preset, settings)),
        flatAmount: String(preset.defaultFlatAmount ?? 0),
        locationLabel: '',
        notes: preset.notes,
      },
      preset.id,
    )
  }

  const saveManualLog = (draft: ManualDraft) => {
    if (!session) {
      return
    }

    const startAt = fromDateTimeLocalInput(draft.startAt)
    const endAt =
      draft.mode === 'hourly' ? fromDateTimeLocalInput(draft.endAt) : null
    const log = addManualLog({
      uid: session.uid,
      title: draft.title,
      mode: draft.mode,
      rate: numberFromInput(draft.rate, settings.defaultRate),
      flatAmount: numberFromInput(draft.flatAmount),
      startAt,
      endAt,
      adjustmentAmount: numberFromInput(draft.adjustmentAmount),
      paid: draft.paid,
      locationLabel: draft.locationLabel.trim(),
      notes: draft.notes,
      startLocation: skippedLocation(startAt, draft.locationLabel.trim()),
    })

    persistLog(log)
    setManualOpen(false)
  }

  const stopActive = () => {
    const stoppedLog = stopActiveLog()

    if (stoppedLog) {
      persistLog(stoppedLog)
    }
  }

  const savePreset = (draft: PresetDraft, id?: string) => {
    if (!session) {
      return
    }

    const preset = upsertPreset({
      uid: session.uid,
      id,
      title: draft.title,
      mode: draft.mode,
      defaultRate:
        draft.mode === 'hourly'
          ? numberFromInput(draft.defaultRate, settings.defaultRate)
          : null,
      defaultFlatAmount:
        draft.mode === 'flat' ? numberFromInput(draft.defaultFlatAmount) : null,
      icon: draft.icon,
      color: draft.color,
      notes: draft.notes,
    })

    persistPreset(preset)
    setPresetOpen(false)
    setEditingPreset(null)
  }

  const removePreset = (preset: JobPreset) => {
    if (!session) {
      return
    }

    deletePreset(preset.id)
    void repository.deletePreset(session.uid, preset.id)
    setPresetOpen(false)
    setEditingPreset(null)
  }

  const togglePaid = (id: string) => {
    const updated = toggleLogPaid(id)

    if (updated) {
      persistLog(updated)
    }
  }

  const updateLogFilters = (filters: LogFilters) => {
    setLogFilters(filters)
    clearSelection()
  }

  const animatePayTargets = (ids: string[], onComplete: () => void) => {
    const uniqueIds = Array.from(new Set(ids))

    if (uniqueIds.length === 0) {
      return
    }

    if (reducedMotion) {
      onComplete()
      return
    }

    setPayTargetIds(uniqueIds)
    window.setTimeout(() => {
      onComplete()
      window.setTimeout(() => setPayTargetIds([]), 140)
    }, 320)
  }

  const markSelectedPaid = () => {
    const selectedPayableIds = selectedLogIds.filter((id) =>
      logs.some((log) => log.id === id && log.status === 'stopped' && !log.paidAt),
    )

    if (selectedPayableIds.length === 0) {
      return
    }

    animatePayTargets(selectedPayableIds, () => {
      const updatedLogs = markLogsPaid(selectedPayableIds)
      updatedLogs.forEach(persistLog)
    })
  }

  const markAllPaid = () => {
    const unpaidLogIds = getFilteredVisibleLogs(logs, showPaid, logFilters)
      .filter((log) => log.status === 'stopped' && !log.paidAt)
      .map((log) => log.id)

    if (unpaidLogIds.length === 0) {
      return
    }

    animatePayTargets(unpaidLogIds, () => {
      const updatedLogs = markLogsPaid(unpaidLogIds)
      updatedLogs.forEach(persistLog)
    })
  }

  const removeLog = (id: string) => {
    if (!session) {
      return
    }

    deleteLog(id)
    void repository.deleteLog(session.uid, id)
    setDetailLogId(null)
  }

  const saveLogDetail = (log: LogEntry, patch: Partial<LogEntry>) => {
    const updated = updateLog(log.id, patch)

    if (updated) {
      persistLog(updated)
      setDetailLogId(null)
    }
  }

  const saveSettings = (nextSettings: UserSettings) => {
    const savedSettings = updateSettings(nextSettings)
    persistSettings(savedSettings)
    setSettingsOpen(false)
  }

  if (!isReady) {
    return <LoadingScreen />
  }

  if (!session) {
    return (
      <AuthScreen
        sessionError={error}
        isConfigured={isFirebaseConfigured}
        onSignIn={() => void signIn()}
      />
    )
  }

  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? 'always' : 'user'}>
      <div
        className="min-h-svh bg-stone-200 text-stone-950"
        style={{ '--accent': settings.accentColor } as CSSProperties}
      >
        <div className="mx-auto min-h-svh max-w-[430px] bg-[#f7f9f4] shadow-2xl sm:max-w-[760px] lg:max-w-[1120px]">
          <AppHeader
            view={view}
            onManual={() => setManualOpen(true)}
            onSettings={() => setSettingsOpen(true)}
          />
          <main className="px-5 pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-5 sm:pb-32 lg:px-8 lg:pb-32">
            {view === 'home' ? (
              <HomeView
                logs={logs}
                presets={presets}
                settings={settings}
                activeLog={activeLog}
                quickFlatLog={quickFlatLog}
                now={now}
                onStart={() => setStartOpen(true)}
                onStop={stopActive}
                onManual={() => setManualOpen(true)}
                onStartPreset={startPreset}
                onCreatePreset={() => {
                  setEditingPreset(null)
                  setPresetOpen(true)
                }}
                onOpenLog={(log) => setDetailLogId(log.id)}
                reducedMotion={reducedMotion}
              />
            ) : null}
            {view === 'logs' ? (
              <LogsView
                logs={logs}
                presets={presets}
                settings={settings}
                showPaid={showPaid}
                filters={logFilters}
                selectedLogIds={selectedLogIds}
                payTargetIds={payTargetIds}
                onFiltersChange={updateLogFilters}
                onShowPaid={setShowPaid}
                onOpenLog={(log) => setDetailLogId(log.id)}
                onToggleSelection={toggleLogSelection}
                onTogglePaid={togglePaid}
                onMarkSelectedPaid={markSelectedPaid}
                onMarkAllPaid={markAllPaid}
                onClearSelection={clearSelection}
                reducedMotion={reducedMotion}
              />
            ) : null}
            {view === 'presets' ? (
              <PresetsView
                presets={presets}
                settings={settings}
                onCreate={() => {
                  setEditingPreset(null)
                  setPresetOpen(true)
                }}
                onEdit={(preset) => {
                  setEditingPreset(preset)
                  setPresetOpen(true)
                }}
                onStartPreset={startPreset}
                reducedMotion={reducedMotion}
              />
            ) : null}
          </main>
          <BottomNav view={view} onChange={setView} />
        </div>
        <StartLogModal
          open={startOpen}
          settings={settings}
          onClose={() => setStartOpen(false)}
          onSubmit={startLogFromDraft}
        />
        <ManualLogModal
          open={manualOpen}
          settings={settings}
          onClose={() => setManualOpen(false)}
          onSubmit={saveManualLog}
        />
        <PresetModal
          open={presetOpen}
          settings={settings}
          preset={editingPreset}
          onClose={() => {
            setPresetOpen(false)
            setEditingPreset(null)
          }}
          onSubmit={savePreset}
          onDelete={removePreset}
        />
        <SettingsModal
          open={settingsOpen}
          settings={settings}
          session={session}
          syncState={syncState}
          syncMessage={syncMessage}
          onClose={() => setSettingsOpen(false)}
          onSubmit={saveSettings}
          onSignOut={() => void signOut()}
        />
        <LogDetailModal
          log={detailLog}
          settings={settings}
          onClose={() => setDetailLogId(null)}
          onSave={saveLogDetail}
          onTogglePaid={togglePaid}
          onDelete={removeLog}
        />
      </div>
    </MotionConfig>
  )
}

export default App
