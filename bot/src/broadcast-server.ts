import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

export interface BookBroadcast {
  type: 'book';
  tokenId: string;
  conditionId: string;
  title: string;
  yesBid: number;
  yesAsk: number;
  velocity: number;  // current ¢/sec (0 if insufficient history)
  timestamp: number;
}

export interface SignalBroadcast {
  type: 'signal';
  tokenId: string;
  conditionId: string;
  title: string;
  yesBid: number;
  yesAsk: number;
  velocity: number;
  confidence: 'low' | 'medium' | 'high';
  timestamp: number;
}

export type BroadcastMessage = BookBroadcast | SignalBroadcast;

// Latest book state per market — sent to new clients on connect
const latestSnapshots = new Map<string, BookBroadcast>();
let wss: WebSocketServer | null = null;

export function startBroadcastServer(port = 3001): void {
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ status: 'ok', markets: latestSnapshots.size }));
  });

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    // Send full current market state immediately to new client
    for (const snapshot of latestSnapshots.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(snapshot));
      }
    }
    ws.on('error', () => {}); // silence transport errors
  });

  server.listen(port);
}

export function broadcast(msg: BroadcastMessage): void {
  if (msg.type === 'book') {
    latestSnapshots.set(msg.tokenId, msg);
  }
  if (!wss) return;
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
