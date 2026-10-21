import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Server as SocketServer } from 'socket.io';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { get } from './db.js';
import { seedDatabase } from './seed.js';
import { getSessionUser, requirePageAuth, userForSocket } from './auth.js';
import { errorHandler, isSameOrigin, notFoundHandler } from './http.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import deliveryRoutes from './routes/deliveries.js';
import vehicleRoutes from './routes/vehicles.js';
import driverRoutes from './routes/drivers.js';
import alertRoutes from './routes/alerts.js';
import analyticsRoutes from './routes/analytics.js';
import { startSimulator } from './simulator.js';

const app = express();
const viewsDir = path.join(config.rootDir, 'views');
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://maps.wikimedia.org',
        'https://tile.openstreetmap.org',
        'https://*.tile.openstreetmap.org',
      ],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
}));

if (config.forceHttps) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    if (req.path === '/api/health') return next();
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'HTTPS is required.' });
    }
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use((req, res, next) => {
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  return next();
});

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 360,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

app.get('/api/health', (req, res) => {
  let database = 'ok';
  try {
    get('SELECT 1 AS ok');
  } catch {
    database = 'error';
  }
  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    environment: config.nodeEnv,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(express.static(config.publicDir, {
  index: false,
  etag: true,
  maxAge: config.isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

const pages = [
  ['/', 'overview.html'],
  ['/overview', 'overview.html'],
  ['/deliveries', 'deliveries.html'],
  ['/analytics', 'analytics.html'],
  ['/drivers', 'drivers.html'],
  ['/alerts', 'alerts.html'],
];

app.get('/login', (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    const requested = typeof req.query.next === 'string' ? req.query.next : '/';
    const safeNext = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
    return res.redirect(safeNext);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(viewsDir, 'login.html'));
});

for (const [route, page] of pages) {
  app.get(route, requirePageAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(viewsDir, page));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

let server;
if (config.https.certPath && config.https.keyPath) {
  if (!fs.existsSync(config.https.certPath) || !fs.existsSync(config.https.keyPath)) {
    throw new Error('HTTPS_CERT or HTTPS_KEY points to a file that does not exist.');
  }
  server = https.createServer({
    cert: fs.readFileSync(config.https.certPath),
    key: fs.readFileSync(config.https.keyPath),
  }, app);
} else {
  server = http.createServer(app);
}

const io = new SocketServer(server, {
  path: '/socket.io',
  serveClient: true,
  maxHttpBufferSize: 1_000_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

io.use((socket, next) => {
  const user = userForSocket(socket);
  if (!user) return next(new Error('Authentication required'));
  socket.user = user;
  return next();
});

io.on('connection', (socket) => {
  if (!socket.user) return socket.disconnect(true);
  socket.emit('connected', {
    user: { id: socket.user.id, name: socket.user.name },
    timestamp: new Date().toISOString(),
  });
  socket.on('presence:ping', (payload, acknowledge) => {
    if (typeof acknowledge === 'function') acknowledge({ ok: true, timestamp: Date.now() });
  });
});

app.set('io', io);

const seedResult = seedDatabase();
if (seedResult.seeded) {
  console.log(`[fleettrack] Seeded database: ${seedResult.shipments} shipments, ${seedResult.vehicles} vehicles, ${seedResult.drivers} drivers.`);
} else {
  console.log('[fleettrack] Existing database loaded.');
}

const simulator = startSimulator(io);
const protocol = config.https.certPath ? 'https' : 'http';

server.listen(config.port, config.host, () => {
  console.log(`[fleettrack] ${protocol}://localhost:${config.port} (${config.nodeEnv})`);
  console.log(`[fleettrack] Demo sign-in: ${config.demoEmail} / ${config.demoPassword}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[fleettrack] ${signal} received — shutting down.`);
  simulator.stop();
  io.close();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 7000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('[fleettrack] Uncaught exception:', error);
});
process.on('unhandledRejection', (error) => {
  console.error('[fleettrack] Unhandled rejection:', error);
});

export { app, server };
