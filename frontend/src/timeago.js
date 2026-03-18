/**
 * Convert an ISO timestamp (UTC, no Z suffix) to a human-readable relative string.
 * Returns e.g. "just now", "2 min ago", "3 hours ago", "yesterday", "5 days ago"
 */
export function timeAgo(isoStr) {
    if (!isoStr) return '—'
    const d = new Date(isoStr + 'Z')
    const now = Date.now()
    const diffMs = now - d.getTime()
    if (diffMs < 0) return 'just now'

    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) return 'just now'

    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} min ago`

    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`

    const days = Math.floor(hr / 24)
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days}d ago`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`

    return `${Math.floor(months / 12)}y ago`
}

/**
 * Full formatted datetime for tooltip: "2024-03-10 14:23:05"
 */
export function fullDate(isoStr) {
    if (!isoStr) return ''
    return isoStr.slice(0, 19).replace('T', ' ')
}
