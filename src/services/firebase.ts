import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
)

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null = null

export function getFirebaseServices() {
  if (!isFirebaseConfigured) {
    return null
  }

  if (!services) {
    const app = getApps()[0] ?? initializeApp(firebaseConfig)
    const auth = getAuth(app)
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })

    services = { app, auth, db }
  }

  return services
}

export async function prepareAuthPersistence() {
  const firebase = getFirebaseServices()

  if (!firebase) {
    return
  }

  await setPersistence(firebase.auth, browserLocalPersistence)
}

export async function signInWithGoogle() {
  const firebase = getFirebaseServices()

  if (!firebase) {
    throw new Error('Firebase is not configured yet.')
  }

  await prepareAuthPersistence()
  await signInWithRedirect(firebase.auth, new GoogleAuthProvider())
}

export async function signOutOfFirebase() {
  const firebase = getFirebaseServices()

  if (firebase) {
    await firebaseSignOut(firebase.auth)
  }
}
