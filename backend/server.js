const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { getOrCreateApiKey, apiKeyFingerprint, requireApiKey } = require('./utils/auth');
const { safeTargetMiddleware } = require('./utils/safeTarget');
const { scopeMiddleware } = require('./utils/scope');
const { checkAllTools } = require('./utils/toolChecker');
const { getRepoRoot } = require('./utils/paths');

const systemRouter = require('./routes/system');
const reconRouter = require('./routes/recon');
const scanRouter = require('./routes/scan');
const scopeRouter = require('./routes/scope');
const reportRouter = require('./routes/report');

const app = express();
const PORT = Number(process.env.PORT || 3001);
// 127.0.0.1 = local/desktop only. Set HOST=0.0.0.0 to accept mobile LAN clients.
const HOST = process.env.HOST || '127.0.0.1';

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS);

const allowAnyOrigin = allowedOrigins.includes('*');
const authDisabled = process.env.DISABLE_AUTH === 'true';

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // API returns JSON; CSP is for the Tauri/web UI
  crossOriginEmbedderPolicy: false,
}));

// Never pair Access-Control-Allow-Origin: * with credentials.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl / server-to-server / Tauri asset loads
    if (allowAnyOrigin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: !allowAnyOrigin,
}));

app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limit exceeded — slow down' },
}));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method, path: req.path, status: res.statusCode,
      ms: Date.now() - start, ip: req.ip,
    }, 'req');
  });
  next();
});

app.use('/api', systemRouter);
app.use('/api', requireApiKey);
app.use('/api/scope', scopeRouter);
app.use('/api/report', reportRouter);
app.use('/api/recon', safeTargetMiddleware, scopeMiddleware, reconRouter);
app.use('/api/scan', safeTargetMiddleware, scopeMiddleware, scanRouter);

app.use((err, req, res, next) => {
  logger.error({ err: { message: err.message, stack: err.stack }, path: req.path }, 'unhandled');
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal server error' });
});

async function start() {
  const apiKey = getOrCreateApiKey();
  logger.info('[Omnisect] booting…');
  logger.info({ root: getRepoRoot(), host: HOST, port: PORT }, 'paths');

  if (authDisabled) {
    logger.warn('SECURITY: DISABLE_AUTH=true — API key checks are bypassed (dev only)');
  }
  if (allowAnyOrigin) {
    logger.warn('SECURITY: ALLOWED_ORIGINS=* — reflecting any Origin (credentials disabled)');
  }

  logger.info({}, 'checking tool availability');
  const tools = await checkAllTools();
  const missing = Object.entries(tools).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) {
    logger.warn({ missing }, 'missing tools - related scan phases will be skipped');
  } else {
    logger.info('all tools present');
  }

  app.listen(PORT, HOST, () => {
    logger.info({}, `═══════════════════════════════════════════════════════`);
    logger.info({}, ` Omnisect backend  ·  http://${HOST}:${PORT}`);
    logger.info({}, ` API key fingerprint: …${apiKeyFingerprint(apiKey)} (full key in data/auth.json)`);
    logger.info({}, ` (DISABLE_AUTH=true bypasses auth — never use outside local dev)`);
    logger.info({}, ` (set HOST=0.0.0.0 for mobile LAN access)`);
    logger.info({}, ` Tools:    ${Object.entries(tools).map(([k, v]) => `${k}:${v ? '✓' : '✗'}`).join(' ')}`);
    logger.info({}, ` Allowed:  ${allowAnyOrigin ? '*' : allowedOrigins.join(', ')}`);
    logger.info({}, `═══════════════════════════════════════════════════════`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
