import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const devSecret = 'fleettrack-development-only-secret-do-not-use-in-production';
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production. See .env.example.');
}

const dbPath = path.resolve(rootDir, process.env.DB_PATH || 'data/fleettrack.db');

export const config = {
  rootDir,
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || devSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  cookieName: 'fleettrack_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  forceHttps: bool(process.env.FORCE_HTTPS, false),
  trustProxy: Number(process.env.TRUST_PROXY || (isProduction ? 1 : 0)),
  dbPath,
  dataDir: path.dirname(dbPath),
  simulationEnabled: bool(process.env.SIMULATION, true),
  simulatorIntervalMs: Math.max(2000, Number(process.env.SIMULATOR_INTERVAL_MS) || 5000),
  publicDir: path.join(rootDir, 'public'),
  https: {
    certPath: process.env.HTTPS_CERT ? path.resolve(rootDir, process.env.HTTPS_CERT) : null,
    keyPath: process.env.HTTPS_KEY ? path.resolve(rootDir, process.env.HTTPS_KEY) : null,
  },
  appOrigin: process.env.APP_ORIGIN || '',
  demoEmail: 'admin@fleettrack.app',
  demoPassword: 'Fleet123!',
};
