import type { StartLocation, UserSettings } from '../types'

export function pendingLocation(capturedAt: string, label = ''): StartLocation {
  return {
    latitude: null,
    longitude: null,
    accuracy: null,
    label,
    capturedAt,
    permissionState: 'pending',
  }
}

export function skippedLocation(capturedAt: string, label = ''): StartLocation {
  return {
    latitude: null,
    longitude: null,
    accuracy: null,
    label,
    capturedAt,
    permissionState: 'skipped',
  }
}

export async function captureStartLocation(
  settings: Pick<UserSettings, 'locationMode'>,
  labelFallback = '',
): Promise<StartLocation> {
  const capturedAt = new Date().toISOString()

  if (settings.locationMode === 'off') {
    return skippedLocation(capturedAt, labelFallback)
  }

  if (!('geolocation' in navigator)) {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      label: labelFallback,
      capturedAt,
      permissionState: 'unavailable',
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          label: labelFallback || 'Location captured',
          capturedAt,
          permissionState: 'granted',
        })
      },
      () => {
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
          label: labelFallback,
          capturedAt,
          permissionState: 'denied',
        })
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 9000,
      },
    )
  })
}
