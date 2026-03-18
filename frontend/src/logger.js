const debug = import.meta.env.VITE_LOG_LEVEL === 'debug'

const logger = {
  debug: (...args) => { if (debug) console.debug('[HomeScan DEBUG]', ...args) },
  info:  (...args) => console.info('[HomeScan]', ...args),
  warn:  (...args) => console.warn('[HomeScan WARN]', ...args),
  error: (...args) => console.error('[HomeScan ERROR]', ...args),
}

export default logger
