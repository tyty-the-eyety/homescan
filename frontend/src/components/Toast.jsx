import { useState, useEffect, useCallback, useRef } from 'react'
import { T } from '../theme'

const TOAST_DURATION = 3500

const TYPE_STYLES = {
    success: { bg: T.greenDim, border: T.green + '44', color: T.green, icon: '\u2713' },
    info:    { bg: T.accentDim, border: T.accent + '44', color: T.accent, icon: '\u2139' },
    warning: { bg: T.amberDim, border: T.amber + '44', color: T.amber, icon: '\u26A0' },
    error:   { bg: T.redDim, border: T.red + '44', color: T.red, icon: '\u2717' },
}

let _addToast = () => {}

/** Call from anywhere: toast('Scan complete', 'success') */
export function toast(message, type = 'info') {
    _addToast({ message, type, id: Date.now() + Math.random() })
}

export default function ToastContainer() {
    const [toasts, setToasts] = useState([])
    const timersRef = useRef({})

    const addToast = useCallback((t) => {
        setToasts(prev => [...prev.slice(-4), t])
        timersRef.current[t.id] = setTimeout(() => {
            setToasts(prev => prev.filter(x => x.id !== t.id))
            delete timersRef.current[t.id]
        }, TOAST_DURATION)
    }, [])

    useEffect(() => {
        _addToast = addToast
        return () => {
            _addToast = () => {}
            Object.values(timersRef.current).forEach(clearTimeout)
        }
    }, [addToast])

    if (toasts.length === 0) return null

    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
            pointerEvents: 'none',
        }}>
            {toasts.map(t => {
                const s = TYPE_STYLES[t.type] || TYPE_STYLES.info
                return (
                    <div key={t.id} style={{
                        background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
                        padding: '10px 16px', color: s.color, fontSize: '0.875rem',
                        fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                        animation: 'toast-in 0.25s ease-out',
                        pointerEvents: 'auto',
                    }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700 }}>{s.icon}</span>
                        {t.message}
                    </div>
                )
            })}
        </div>
    )
}
