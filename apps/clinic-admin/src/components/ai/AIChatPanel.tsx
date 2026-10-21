
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, ChevronDown, Stethoscope, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAuthToken } from '../../lib/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Msg { role: 'user' | 'assistant'; content: string; ts: Date; }

const SUGGESTED = [
  'What appointments do I have today?',
  'Any emergency cases right now?',
  'Show upcoming vaccinations this week',
  'Who is the next patient?',
];

interface AIChatPanelProps {
  compact?: boolean;
  clinicName?: string;
}

export function AIChatPanel({ compact = false, clinicName }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<{ bookingCount: number; emergencyCount: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load today context on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_URL}/api/tenants/me/ai-chat/today-context`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.bookingCount !== undefined) setContext(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed, ts: new Date() }]);
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/api/tenants/me/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? 'Sorry, I could not process that.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: new Date() }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please check the API server.',
        ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn(
      'flex flex-col rounded-2xl border overflow-hidden',
      compact ? 'h-80' : 'h-[520px]',
      'border-slate-200 bg-white shadow-sm'
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 border-b border-emerald-700">
        <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">CuraVet AI Assistant</p>
          <p className="text-[11px] text-emerald-100 truncate">
            {clinicName ? `${clinicName} • ` : ''}Clinic-aware booking intelligence
          </p>
        </div>
        {context && context.emergencyCount > 0 && (
          <div className="flex items-center gap-1 bg-red-500 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-3 h-3 text-white" />
            <span className="text-[10px] font-bold text-white">{context.emergencyCount} URGENT</span>
          </div>
        )}
        {context && (
          <div className="text-right">
            <p className="text-xs font-bold text-white">{context.bookingCount}</p>
            <p className="text-[10px] text-emerald-100">today</p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Bot className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">How can I help today?</p>
              <p className="text-xs text-slate-400 mt-0.5">I know your clinic's schedule and patients</p>
            </div>
            {!compact && (
              <div className="grid grid-cols-1 gap-1.5 w-full mt-1">
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
              >
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'user' ? 'bg-slate-700' : 'bg-emerald-600'
                )}>
                  {msg.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-white" />
                    : <Bot className="w-3.5 h-3.5 text-white" />
                  }
                </div>
                <div className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white rounded-tr-sm'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={cn('text-[10px] mt-1 text-right', msg.role === 'user' ? 'text-slate-400' : 'text-slate-300')}>
                    {formatTime(msg.ts)}
                  </p>
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 p-3 border-t border-slate-200 bg-white">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about bookings, patients, emergencies..."
          rows={1}
          className="flex-1 resize-none text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-slate-50 text-slate-800 placeholder:text-slate-400 max-h-20 scrollbar-thin"
          style={{ lineHeight: '1.5' }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition-colors shadow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>
  );
}
