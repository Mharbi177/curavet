import type { FastifyInstance } from 'fastify';
// Side-effect import: installs the `websocket: true` route option + handler types.
import '@fastify/websocket';
import type { WebSocket } from 'ws';
import { env } from '../env';
import { AuthService, type TokenPayload } from './auth';
import { activeConversations } from './metrics';
import { prisma } from '../lib/prisma';

export type RealtimeEvent =
  | { type: 'message'; tenantId: string; conversationId: string; payload: unknown }
  | { type: 'conversation'; tenantId: string; payload: unknown }
  | { type: 'booking'; tenantId: string; payload: unknown }
  | { type: 'review'; tenantId: string; payload: unknown }
  | { type: 'typing'; tenantId: string; conversationId: string };

interface Subscriber {
  socket: WebSocket;
  user: TokenPayload;
  tenantId: string;
}

const subscribers = new Set<Subscriber>();

/**
 * Publish a realtime event to every dashboard subscribed to that tenant.
 * A super-admin socket with no tenant filter receives events for all tenants.
 */
export function publish(event: RealtimeEvent): void {
  for (const sub of subscribers) {
    if (sub.socket.readyState !== 1) continue; // 1 === WebSocket.OPEN
    if (sub.user.role !== 'super_admin' && sub.tenantId !== event.tenantId) continue;
    try {
      sub.socket.send(JSON.stringify(event));
    } catch {
      // A dead socket is cleaned up by the close handler.
    }
  }
}

/**
 * Register the authenticated WebSocket endpoint used by the dashboards for
 * live conversation and booking updates.
 */
export async function registerRealtimeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { token?: string; tenantId?: string } }>(
    '/ws',
    { websocket: true },
    (socket, request) => {
      const token = request.query?.token;
      const user = token ? AuthService.verifyToken(token, env.JWT_SECRET) : null;

      if (!user) {
        socket.close(4401, 'Unauthorized');
        return;
      }

      const tenantId = user.tenantId || request.query?.tenantId || '';
      const sub: Subscriber = { socket, user, tenantId };
      subscribers.add(sub);

      socket.send(JSON.stringify({ type: 'ready', tenantId: tenantId || 'all' }));

      socket.on('close', () => {
        subscribers.delete(sub);
      });

      socket.on('error', () => {
        subscribers.delete(sub);
      });

      socket.on('message', (raw: Buffer) => {
        // Heartbeat: clients send {"type":"ping"}.
        // Typing: clients send {"type":"typing","conversationId":"..."}.
        try {
          const parsed = JSON.parse(raw.toString()) as { type?: string; conversationId?: string };
          if (parsed.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          } else if (parsed.type === 'typing' && parsed.conversationId) {
            // Forward typing indicators to all other subscribers on the same tenant.
            for (const other of subscribers) {
              if (other === sub) continue;
              if (other.socket.readyState !== 1) continue;
              if (other.user.role !== 'super_admin' && other.tenantId !== tenantId) continue;
              try {
                other.socket.send(JSON.stringify({
                  type: 'typing',
                  tenantId,
                  conversationId: parsed.conversationId,
                }));
              } catch { /* dead socket */ }
            }
          }
        } catch {
          // Ignore malformed client frames.
        }
      });
    }
  );
}

export function realtimeSubscriberCount(): number {
  return subscribers.size;
}

/**
 * Refresh the `glambot_active_conversations` gauge. Called by the metrics route
 * so the value stays current without a hot loop.
 */
export async function refreshConversationGauge(): Promise<void> {
  try {
    const count = await prisma.conversation.count({ where: { status: 'active' } });
    activeConversations.set(count);
  } catch {
    // Metrics must never break a request.
  }
}
