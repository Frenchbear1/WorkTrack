import { useCallback, useEffect, useState } from 'react'
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth'
import type { SessionUser } from '../types'
import {
  getFirebaseServices,
  isFirebaseConfigured,
  prepareAuthPersistence,
  signInWithGoogle,
  signOutOfFirebase,
} from '../services/firebase'

const previewSessionKey = 'worktrack.previewSession'

const previewUser: SessionUser = {
  uid: 'preview-user',
  displayName: 'Preview Worker',
  email: 'preview@worktrack.local',
  photoURL: null,
  isPreview: true,
}

function mapFirebaseUser(user: User): SessionUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? user.email ?? 'Worker',
    email: user.email ?? '',
    photoURL: user.photoURL,
    isPreview: false,
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCancelled = false
    let unsubscribe: (() => void) | undefined

    const markReady = () => {
      if (!isCancelled) {
        setIsReady(true)
      }
    }

    if (!isFirebaseConfigured) {
      const storedPreview = window.localStorage.getItem(previewSessionKey)
      setSession(storedPreview ? previewUser : null)
      markReady()
      return
    }

    const firebase = getFirebaseServices()

    if (!firebase) {
      markReady()
      return
    }

    const authReadyFallback = window.setTimeout(() => {
      if (!isCancelled) {
        setError(
          'Firebase Auth is taking too long. Check that this domain is authorized in Firebase.',
        )
        setIsReady(true)
      }
    }, 4500)

    void prepareAuthPersistence().catch((authError: unknown) => {
      setError(
        authError instanceof Error
          ? authError.message
          : 'Could not prepare sign-in.',
      )
    })

    void getRedirectResult(firebase.auth).catch((redirectError: unknown) => {
      setError(
        redirectError instanceof Error
          ? redirectError.message
          : 'Google sign-in was not completed.',
      )
      markReady()
    })

    unsubscribe = onAuthStateChanged(
      firebase.auth,
      (user) => {
        if (!isCancelled) {
          setSession(user ? mapFirebaseUser(user) : null)
        }
        markReady()
      },
      (authError) => {
        if (!isCancelled) {
          setError(authError.message)
        }
        markReady()
      },
    )

    return () => {
      isCancelled = true
      window.clearTimeout(authReadyFallback)
      unsubscribe?.()
    }
  }, [])

  const signIn = useCallback(async () => {
    setError('')

    if (!isFirebaseConfigured) {
      window.localStorage.setItem(previewSessionKey, 'true')
      setSession(previewUser)
      return
    }

    try {
      await signInWithGoogle()
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Could not start Google sign-in.',
      )
    }
  }, [])

  const signOut = useCallback(async () => {
    setError('')
    window.localStorage.removeItem(previewSessionKey)

    if (isFirebaseConfigured) {
      await signOutOfFirebase()
    }

    setSession(null)
  }, [])

  return {
    session,
    isReady,
    error,
    isFirebaseConfigured,
    signIn,
    signOut,
  }
}
