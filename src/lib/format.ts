import { format } from 'date-fns'

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

export function formatDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.floor(totalMinutes))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) {
    return `${remainingMinutes}m`
  }

  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`
}

export function formatClockRange(startAt: string, endAt: string | null) {
  const start = new Date(startAt)
  const end = endAt ? new Date(endAt) : null
  const startLabel = format(start, 'MMM d, h:mm a')

  if (!end) {
    return `${startLabel} - running`
  }

  return `${startLabel} - ${format(end, 'h:mm a')}`
}

export function toDateTimeLocalInput(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function fromDateTimeLocalInput(value: string) {
  return new Date(value).toISOString()
}
