import { T } from '../theme'

const CARDS = [
  { key: 'total',     label: 'Total Devices', color: T.accent },
  { key: 'online',    label: 'Online',         color: T.green  },
  { key: 'offline',   label: 'Offline',        color: T.red    },
  { key: 'known',     label: 'Known',          color: T.accent },
  { key: 'unknown',   label: 'Unknown',        color: T.amber  },
  { key: 'new_today', label: 'New Today',      color: T.red    },
]

export default function Stats({ stats }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
      {CARDS.map(card => (
        <div key={card.key} style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderTop: `3px solid ${card.color}`,
          borderRadius: 10,
          padding: '0.85rem 1.25rem',
          minWidth: 110,
          flex: 1,
        }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: card.color, lineHeight: 1 }}>
            {stats[card.key] ?? '\u2014'}
          </div>
          <div style={{ fontSize: '0.75rem', color: T.textMid, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {card.label}
          </div>
        </div>
      ))}
    </div>
  )
}
