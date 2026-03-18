import { useEffect, useRef } from 'react'

/**
 * Hook that connects to the SSE endpoint and dispatches events.
 * Returns nothing — components subscribe via the onEvent callback.
 *
 * Events: scan_start, scan_complete, probe_complete, connected
 */
export default function useSSE(onEvent) {
    const cbRef = useRef(onEvent)
    cbRef.current = onEvent

    useEffect(() => {
        let es = null
        let reconnectTimer = null

        function connect() {
            es = new EventSource('/api/events')

            const EVENTS = ['connected', 'scan_start', 'scan_complete', 'probe_complete', 'public_ip_changed']
            for (const evt of EVENTS) {
                es.addEventListener(evt, (e) => {
                    try {
                        const data = JSON.parse(e.data)
                        cbRef.current(evt, data)
                    } catch {
                        cbRef.current(evt, {})
                    }
                })
            }

            es.onerror = () => {
                es.close()
                // Reconnect after 3s
                reconnectTimer = setTimeout(connect, 3000)
            }
        }

        connect()

        return () => {
            if (es) es.close()
            if (reconnectTimer) clearTimeout(reconnectTimer)
        }
    }, [])
}
