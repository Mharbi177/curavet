/**
 * Real-Time Conversation WebSocket Hook
 *
 * Establishes a persistent, auto-reconnecting WebSocket to the API's /ws
 * endpoint and merges incoming `message`, `conversation`, and `typing` events
 * directly into the React Query cache for instant UI updates.
 *
 * Usage:
 *   const { send, isConnected, typingConversationIds } = useRealtimeConversations({ tenantId, onNewMessage });
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../lib/auth';
import type { Conversation, ConversationMessage } from '../lib/types';

const WS_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws');

/** Jittered exponential back-off: 1s → 2s → 4s … 30s max. */
function backoff(attempt: number): number {
  const base = Math.min(30_000, 1_000 * 2 ** attempt);
  return base * (0.8 + Math.random() * 0.4);
}

export interface RealtimeEvent {
  type: 'message' | 'conversation' | 'booking' | 'review' | 'ready' | 'pong' | 'typing';
  tenantId?: string;
  conversationId?: string;
  payload?: unknown;
}

interface UseRealtimeOptions {
  /** Passed through to query-key lookups. */
  tenantId?: string;
  /** Optional callback fired whenever a new message arrives for any conversation. */
  onNewMessage?: (event: RealtimeEvent) => void;
  /** Set to false to skip connecting (e.g. when the user is not logged in). */
  enabled?: boolean;
}

interface UseRealtimeReturn {
  /** Whether the WebSocket is currently open. */
  isConnected: boolean;
  /** Set of conversationIds where a remote typing indicator is active. */
  typingConversationIds: Set<string>;
  /** Send a message over the open socket. Returns false if the socket is closed. */
  send: (payload: unknown) => boolean;
}

export function useRealtimeConversations({
  tenantId,
  onNewMessage,
  enabled = true,
}: UseRealtimeOptions): UseRealtimeReturn {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(new Set());
  // Typing timeout refs: conversationId → timeout id
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const connect = useCallback(() => {
    if (unmountedRef.current || !enabled) return;

    const token = getAuthToken();
    if (!token) return;

    const url = `${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setIsConnected(true);

      // Keep-alive ping every 25 seconds (server heartbeat timeout is 30s).
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25_000);
    };

    ws.onmessage = (event) => {
      let data: RealtimeEvent;
      try {
        data = JSON.parse(event.data as string) as RealtimeEvent;
      } catch {
        return;
      }

      if (data.type === 'message' && data.conversationId) {
        const incomingMessage = data.payload as ConversationMessage;

        // Optimistically patch the message into the conversation list cache.
        queryClient.setQueryData<Conversation[]>(
          ['conversations', tenantId],
          (old) => {
            if (!old) return old;
            return old.map((conv) => {
              if (conv.id !== data.conversationId) return conv;
              const exists = conv.messages?.some((m) => m.id === incomingMessage.id);
              if (exists) return conv;
              return {
                ...conv,
                lastMessageAt: incomingMessage.createdAt ?? conv.lastMessageAt,
                messages: [...(conv.messages ?? []), incomingMessage],
              };
            });
          }
        );

        // Also patch the single-conversation cache if it exists.
        queryClient.setQueryData<Conversation>(
          ['conversation', data.conversationId],
          (old) => {
            if (!old) return old;
            const exists = old.messages?.some((m) => m.id === incomingMessage.id);
            if (exists) return old;
            return {
              ...old,
              lastMessageAt: incomingMessage.createdAt ?? old.lastMessageAt,
              messages: [...(old.messages ?? []), incomingMessage],
            };
          }
        );

        onNewMessage?.(data);
      }

      if (data.type === 'conversation') {
        // A takeover/release event — patch the humanTakeover field.
        const updated = data.payload as Conversation;
        queryClient.setQueryData<Conversation[]>(
          ['conversations', tenantId],
          (old) => {
            if (!old) return old;
            return old.map((conv) =>
              conv.id === updated.id ? { ...conv, ...updated } : conv
            );
          }
        );
        queryClient.setQueryData<Conversation>(
          ['conversation', updated.id],
          (old) => old ? { ...old, ...updated } : old
        );
      }

      if (data.type === 'typing' && data.conversationId) {
        const convId = data.conversationId;
        // Show typing indicator and clear after 3 seconds of inactivity.
        setTypingConversationIds((prev) => {
          const next = new Set(prev);
          next.add(convId);
          return next;
        });

        if (typingTimeoutsRef.current[convId]) {
          clearTimeout(typingTimeoutsRef.current[convId]);
        }
        typingTimeoutsRef.current[convId] = setTimeout(() => {
          setTypingConversationIds((prev) => {
            const next = new Set(prev);
            next.delete(convId);
            return next;
          });
          delete typingTimeoutsRef.current[convId];
        }, 3000);
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      setIsConnected(false);
      if (unmountedRef.current) return;

      // Reconnect with back-off.
      const delay = backoff(attemptRef.current);
      attemptRef.current += 1;
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [queryClient, tenantId, onNewMessage, enabled]);

  useEffect(() => {
    unmountedRef.current = false;

    if (enabled) connect();

    return () => {
      unmountedRef.current = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      // Clear all typing timeouts
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      wsRef.current?.close(1000, 'component unmounted');
      wsRef.current = null;
    };
  }, [connect, enabled]);

  /** Send a message over the open socket. Returns false if the socket is closed. */
  const send = useCallback((payload: unknown): boolean => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(payload));
    return true;
  }, []);

  return { send, isConnected, typingConversationIds };
}
