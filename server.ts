import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { setupWebSocketServer } from './server/websocket.js';
import { createApiRouter } from './server/routes/index.js';
import { RealtimeMessage } from './server/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

// Increase body parser limit for base64 product images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// -------------------------------------------------------------
// WebSocket Realtime Engine
// -------------------------------------------------------------
const { wss, broadcastRealtimeEvent } = setupWebSocketServer(server);

export { broadcastRealtimeEvent };
export type { RealtimeMessage };

// -------------------------------------------------------------
// REST API Routes
// -------------------------------------------------------------
app.use('/api', createApiRouter(broadcastRealtimeEvent, wss));

// -------------------------------------------------------------
// Vite Dev Middlewares / Production Static Serving
// -------------------------------------------------------------
async function setupFrontend() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }
}

setupFrontend().then(() => {
  server.listen(PORT, () => {
    console.log(`AutoMatePH Full-Stack Server running on port ${PORT}`);
    console.log(`Realtime WebSocket endpoint active at ws://0.0.0.0:${PORT}/ws`);
  });
});
