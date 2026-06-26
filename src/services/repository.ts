import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { JobPreset, LogEntry, UserSettings, WorkspaceSnapshot } from '../types'
import { getFirebaseServices } from './firebase'

export type WorkspaceRepository = {
  subscribe: (
    uid: string,
    onData: (snapshot: WorkspaceSnapshot) => void,
    onError: (message: string) => void,
  ) => Unsubscribe
  saveLog: (uid: string, log: LogEntry) => Promise<void>
  deleteLog: (uid: string, logId: string) => Promise<void>
  savePreset: (uid: string, preset: JobPreset) => Promise<void>
  deletePreset: (uid: string, presetId: string) => Promise<void>
  saveSettings: (uid: string, settings: UserSettings) => Promise<void>
}

const localStoragePrefix = 'worktrack.workspace.'

function userDocPath(uid: string) {
  return `users/${uid}`
}

function settingsDocPath(uid: string) {
  return `${userDocPath(uid)}/settings/profile`
}

function snapshotKey(uid: string) {
  return `${localStoragePrefix}${uid}`
}

function emptySnapshot(): WorkspaceSnapshot {
  return {
    logs: [],
    presets: [],
    settings: null,
  }
}

function getStoredSnapshot(uid: string): WorkspaceSnapshot {
  if (typeof window === 'undefined') {
    return emptySnapshot()
  }

  const stored = window.localStorage.getItem(snapshotKey(uid))

  if (!stored) {
    return emptySnapshot()
  }

  try {
    return { ...emptySnapshot(), ...JSON.parse(stored) }
  } catch {
    return emptySnapshot()
  }
}

function setStoredSnapshot(uid: string, snapshot: WorkspaceSnapshot) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(snapshotKey(uid), JSON.stringify(snapshot))
  }
}

class FirestoreWorkspaceRepository implements WorkspaceRepository {
  private readonly db: Firestore

  constructor(db: Firestore) {
    this.db = db
  }

  subscribe(
    uid: string,
    onData: (snapshot: WorkspaceSnapshot) => void,
    onError: (message: string) => void,
  ) {
    const state = emptySnapshot()
    const emit = () => onData({ ...state })
    const handleError = (error: Error) => onError(error.message)

    const logsQuery = query(
      collection(this.db, `${userDocPath(uid)}/logs`),
      orderBy('createdAt', 'desc'),
    )
    const presetsQuery = query(
      collection(this.db, `${userDocPath(uid)}/presets`),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribes = [
      onSnapshot(
        logsQuery,
        (snapshot) => {
          state.logs = snapshot.docs.map((entry) => entry.data() as LogEntry)
          emit()
        },
        handleError,
      ),
      onSnapshot(
        presetsQuery,
        (snapshot) => {
          state.presets = snapshot.docs.map((entry) => entry.data() as JobPreset)
          emit()
        },
        handleError,
      ),
      onSnapshot(
        doc(this.db, settingsDocPath(uid)),
        (snapshot) => {
          state.settings = snapshot.exists()
            ? (snapshot.data() as UserSettings)
            : null
          emit()
        },
        handleError,
      ),
    ]

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }

  async saveLog(uid: string, log: LogEntry) {
    await setDoc(doc(this.db, `${userDocPath(uid)}/logs/${log.id}`), log)
  }

  async deleteLog(uid: string, logId: string) {
    await deleteDoc(doc(this.db, `${userDocPath(uid)}/logs/${logId}`))
  }

  async savePreset(uid: string, preset: JobPreset) {
    await setDoc(doc(this.db, `${userDocPath(uid)}/presets/${preset.id}`), preset)
  }

  async deletePreset(uid: string, presetId: string) {
    await deleteDoc(doc(this.db, `${userDocPath(uid)}/presets/${presetId}`))
  }

  async saveSettings(uid: string, settings: UserSettings) {
    await setDoc(doc(this.db, settingsDocPath(uid)), settings)
  }
}

class LocalWorkspaceRepository implements WorkspaceRepository {
  subscribe(
    uid: string,
    onData: (snapshot: WorkspaceSnapshot) => void,
    onError: (message: string) => void,
  ) {
    window.setTimeout(() => onData(getStoredSnapshot(uid)), 0)

    const handleStorage = (event: StorageEvent) => {
      if (event.key === snapshotKey(uid)) {
        onData(getStoredSnapshot(uid))
      }
    }

    try {
      window.addEventListener('storage', handleStorage)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Local storage failed.')
    }

    return () => window.removeEventListener('storage', handleStorage)
  }

  async saveLog(uid: string, log: LogEntry) {
    const snapshot = getStoredSnapshot(uid)
    const logs = snapshot.logs.filter((entry) => entry.id !== log.id)
    setStoredSnapshot(uid, {
      ...snapshot,
      logs: [log, ...logs],
    })
  }

  async deleteLog(uid: string, logId: string) {
    const snapshot = getStoredSnapshot(uid)
    setStoredSnapshot(uid, {
      ...snapshot,
      logs: snapshot.logs.filter((entry) => entry.id !== logId),
    })
  }

  async savePreset(uid: string, preset: JobPreset) {
    const snapshot = getStoredSnapshot(uid)
    const presets = snapshot.presets.filter((entry) => entry.id !== preset.id)
    setStoredSnapshot(uid, {
      ...snapshot,
      presets: [preset, ...presets],
    })
  }

  async deletePreset(uid: string, presetId: string) {
    const snapshot = getStoredSnapshot(uid)
    setStoredSnapshot(uid, {
      ...snapshot,
      presets: snapshot.presets.filter((entry) => entry.id !== presetId),
    })
  }

  async saveSettings(uid: string, settings: UserSettings) {
    const snapshot = getStoredSnapshot(uid)
    setStoredSnapshot(uid, {
      ...snapshot,
      settings,
    })
  }
}

export function createWorkspaceRepository(): WorkspaceRepository {
  const firebase = getFirebaseServices()

  if (firebase) {
    return new FirestoreWorkspaceRepository(firebase.db)
  }

  return new LocalWorkspaceRepository()
}
