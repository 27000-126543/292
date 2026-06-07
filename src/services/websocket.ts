import WebSocket, { Server } from 'ws';
import { config } from '../config';
import { generateId, now } from '../utils';
import type { Message, Alert, UserRole } from '../types';
import { alertModel } from '../models/operations';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  roles: UserRole[];
}

class WebSocketService {
  private wss: Server | null = null;
  private clients: Map<string, ConnectedClient> = new Map();

  start() {
    this.wss = new Server({ port: config.websocket.port });
    console.log(`WebSocket server started on port ${config.websocket.port}`);

    this.wss.on('connection', (ws) => {
      const clientId = generateId();
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'register') {
            this.clients.set(clientId, {
              ws,
              userId: message.userId || clientId,
              roles: Array.isArray(message.roles) ? message.roles : ['power_producer']
            });
            ws.send(JSON.stringify({
              type: 'registered',
              clientId,
              timestamp: now()
            }));
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Please register with your user info',
        timestamp: now()
      }));
    });
  }

  broadcast(message: Omit<Message, 'id' | 'createdAt'>) {
    const fullMessage: Message = {
      id: generateId(),
      createdAt: now(),
      ...message
    };

    this.clients.forEach((client) => {
      const hasRole = message.targetRoles.some(role => 
        client.roles.map(r => r.toLowerCase()).includes((role as string).toLowerCase())
      );
      const hasUser = !message.targetUsers || message.targetUsers.includes(client.userId);
      
      if (hasRole || hasUser) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(fullMessage));
        }
      }
    });
  }

  sendAlert(alert: Omit<Alert, 'id' | 'createdAt' | 'acknowledged'>): Alert {
    const savedAlert = alertModel.create(alert);

    this.broadcast({
      type: 'alert',
      payload: savedAlert,
      targetRoles: alert.targetRoles
    });

    return savedAlert;
  }

  sendTransactionUpdate(transaction: any, targetRoles: UserRole[] = ['trading_center', 'dispatch_center', 'power_producer']) {
    this.broadcast({
      type: 'transaction_update',
      payload: transaction,
      targetRoles
    });
  }

  sendDispatchUpdate(dispatch: any, targetRoles: UserRole[] = ['dispatch_center', 'power_producer']) {
    this.broadcast({
      type: 'dispatch_update',
      payload: dispatch,
      targetRoles
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  stop() {
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsService = new WebSocketService();
