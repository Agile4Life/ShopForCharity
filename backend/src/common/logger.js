export const logger = {
  info(msg, meta = {}) {
    console.log(JSON.stringify({ level: 'INFO', message: msg, timestamp: new Date().toISOString(), ...meta }));
  },
  warn(msg, meta = {}) {
    console.warn(JSON.stringify({ level: 'WARN', message: msg, timestamp: new Date().toISOString(), ...meta }));
  },
  error(msg, meta = {}) {
    console.error(JSON.stringify({ level: 'ERROR', message: msg, timestamp: new Date().toISOString(), ...meta }));
  },
};
