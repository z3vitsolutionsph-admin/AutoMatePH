import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { serverDb } from './db.js';
import { RealtimeMessage, BroadcastFunction } from './types.js';

let wssInstance: WebSocketServer | null = null;

export function setupWebSocketServer(server: http.Server): {
  wss: WebSocketServer;
  broadcastRealtimeEvent: BroadcastFunction;
} {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  const broadcastRealtimeEvent: BroadcastFunction = (msg: RealtimeMessage, excludeClient?: WebSocket) => {
    const payload = JSON.stringify({
      ...msg,
      timestamp: msg.timestamp || new Date().toISOString()
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== excludeClient) {
        try {
          client.send(payload);
        } catch (err) {
          console.error('WebSocket send error:', err);
        }
      }
    });
  };

  wss.on('connection', (ws: WebSocket) => {
    // Send full database snapshot immediately upon connection
    const snapshot = serverDb.getSnapshot();
    ws.send(JSON.stringify({
      type: 'init',
      snapshot,
      timestamp: new Date().toISOString()
    }));

    // Setup keep-alive heartbeat
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (messageRaw: string) => {
      try {
        const parsed = JSON.parse(messageRaw.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        } else if (parsed.type === 'request_snapshot') {
          ws.send(JSON.stringify({
            type: 'init',
            snapshot: serverDb.getSnapshot(),
            timestamp: new Date().toISOString()
          }));
        }
      } catch (e) {
        // Ignore malformed WS message
      }
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err.message);
    });
  });

  // Periodic ping to keep Cloud Run & proxy connections active
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      if ((ws as any).isAlive === false) {
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return { wss, broadcastRealtimeEvent };
}

export function getWss(): WebSocketServer | null {
  return wssInstance;
}
