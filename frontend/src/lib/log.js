// Conditional logger — silenced in production builds.
const isProd = import.meta.env.PROD;

const log = {
  error: (...args) => {
    if (!isProd) console.error(...args);
  },
  warn: (...args) => {
    if (!isProd) console.warn(...args);
  },
  info: (...args) => {
    if (!isProd) console.info(...args);
  },
  debug: (...args) => {
    if (!isProd) console.debug(...args);
  },
};

export default log;
