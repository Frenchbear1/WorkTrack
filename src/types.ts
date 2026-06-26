export type JobMode = 'hourly' | 'flat'
export type LogStatus = 'active' | 'stopped'
export type LocationMode = 'ask' | 'off'
export type ThemeMode = 'system' | 'light' | 'dark'
export type PresetIcon =
  | 'briefcase'
  | 'hammer'
  | 'home'
  | 'paintbrush'
  | 'receipt'
  | 'truck'
  | 'wrench'

export type StartLocation = {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  label: string
  capturedAt: string
  permissionState: 'pending' | 'granted' | 'denied' | 'unavailable' | 'skipped'
}

export type LogEntry = {
  id: string
  uid: string
  title: string
  mode: JobMode
  status: LogStatus
  presetId: string | null
  startAt: string
  endAt: string | null
  startLocation: StartLocation
  rate: number | null
  flatAmount: number | null
  roundingMinutes: number
  adjustmentAmount: number
  amountDue: number
  paidAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type JobPreset = {
  id: string
  uid: string
  title: string
  mode: JobMode
  defaultRate: number | null
  defaultFlatAmount: number | null
  icon: PresetIcon
  color: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type UserSettings = {
  currency: string
  defaultRate: number
  roundingMinutes: number
  theme: ThemeMode
  accentColor: string
  locationMode: LocationMode
  hidePaidByDefault: boolean
  reducedMotion: boolean
}

export type SessionUser = {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  isPreview: boolean
}

export type WorkspaceSnapshot = {
  logs: LogEntry[]
  presets: JobPreset[]
  settings: UserSettings | null
}
