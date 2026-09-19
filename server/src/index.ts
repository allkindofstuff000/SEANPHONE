import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { errorHandler } from './middleware/error';
import { provider } from './services/providerService';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import numberRoutes from './routes/numbers.routes';
import messageRoutes from './routes/messages.routes';
import conversationRoutes from './routes/conversations.routes';
import webhookRoutes from './routes/webhooks.routes';
import devRoutes from './routes/dev.routes';

const app = express();

// --- Core middleware -------------------------------------------------
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // needed for Twilio webhooks later
app.use(cookieParser());

// --- Routes ----------------------------------------------------------
// Health check has no DB dependency: it verifies the process is up.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'phone-dashboard-api',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/dev', devRoutes);

// Provider webhooks live outside /api.
app.use('/webhooks', webhookRoutes);

// JSON 404 for unknown API routes.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Error handling (must be last) -----------------------------------
app.use(errorHandler);

// --- Start -----------------------------------------------------------
app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`CPaaS provider: ${provider.name}`);
});
