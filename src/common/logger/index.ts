import { createLogger, format, transports } from "winston";

const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message, timestamp, label }) => {
  return `${timestamp} ${label} ${level} ${message}`
})

const newLogger = (env: string) => {
  return createLogger({
    level: 'debug',
    format: combine(
      format.colorize(),
      label({ label: env }),
      timestamp(),
      myFormat
    ),
    transports: [
      new transports.File({ filename: 'error.log', level: 'error', dirname: './logs' }),
      new transports.File({ filename: 'combined.log', dirname: './logs' }),
      new transports.Console()
    ]
  })
}

let logger = null;

if (process.env.NODE_ENV === 'production') {
  logger = newLogger('PROD')
}
if (process.env.NODE_ENV === 'development') {
  logger = newLogger('DEV')
}

export default logger;