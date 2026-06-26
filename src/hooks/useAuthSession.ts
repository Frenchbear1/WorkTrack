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
const googleSignInAttemptKey = 'worktrack.googleSignInAttempt'

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

function rememberGoogleSignInAttempt() {
  try {
    window.sessionStorage.setItem(googleSignInAttemptKey, 'true')
  } catch {
    // Session storage can be unavailable in some private browsing modes.
  }
}

function forgetGoogleSignInAttempt() {
  try {
    window.sessionStorage.removeItem(googleSignInAttemptKey)
  } catch {
    // Session storage can be unavailable in some private browsing modes.
  }
}

function hadGoogleSignInAttempt() {
  try {
    return window.sessionStorage.getItem(googleSignInAttemptKey) === 'true'
  } catch {
    return false
  }
}

export function useAuthSession() {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCancelled = false
    let unsubscribe: (() => void) | undefined
    let authReadyFallback: number | undefined

    const markReady = () => {
      if (!isCancelled) {
        if (authReadyFallback) {
          window.clearTimeout(authReadyFallback)
          authReadyFallback = undefined
        }
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

    authReadyFallback = window.setTimeout(() => {
      if (!isCancelled) {
        setError(
          'Firebase Auth is taking too long. Check that this domain is authorized in Firebase, then refresh.',
        )
        setIsReady(true)
      }
    }, 15000)

    let authStateChecked = false
    let redirectChecked = false

    const applyFirebaseUser = (user: User | null) => {
      if (isCancelled) {
        return
      }

      if (user) {
        forgetGoogleSignInAttempt()
        setError('')
        setSession(mapFirebaseUser(user))
        return
      }

      setSession(null)
    }

    const finishWhenChecked = () => {
      if (!authStateChecked || !redirectChecked || isCancelled) {
        return
      }

      if (!firebase.auth.currentUser && hadGoogleSignInAttempt()) {
        forgetGoogleSignInAttempt()
        setError(
          'Google returned without saving the sign-in session. Try once more, and make sure the page opens in Safari or Chrome instead of an in-app browser.',
        )
      }

      markReady()
    }

    const startAuth = async () => {
      try {
        await prepareAuthPersistence()
      } catch (authError: unknown) {
        if (!isCancelled) {
          setError(
            authError instanceof Error
              ? authError.message
              : 'Could not prepare sign-in.',
          )
        }
      }

      if (isCancelled) {
        return
      }

      unsubscribe = onAuthStateChanged(
        firebase.auth,
        (user) => {
          applyFirebaseUser(user)
          authStateChecked = true
          finishWhenChecked()
        },
        (authError) => {
          if (!isCancelled) {
            setError(authError.message)
          }
          authStateChecked = true
          finishWhenChecked()
        },
      )

      void getRedirectResult(firebase.auth)
        .then((redirectResult) => {
          applyFirebaseUser(redirectResult?.user ?? firebase.auth.currentUser)
        })
        .catch((redirectError: unknown) => {
          if (!isCancelled) {
            setError(
              redirectError instanceof Error
                ? redirectError.message
                : 'Google sign-in was not completed.',
            )
          }
        })
        .finally(() => {
          redirectChecked = true
          finishWhenChecked()
        })
    }

    void startAuth()

    return () => {
      isCancelled = true
      if (authReadyFallback) {
        window.clearTimeout(authReadyFallback)
      }
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
      rememberGoogleSignInAttempt()
      await signInWithGoogle()
    } catch (signInError) {
      forgetGoogleSignInAttempt()
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
