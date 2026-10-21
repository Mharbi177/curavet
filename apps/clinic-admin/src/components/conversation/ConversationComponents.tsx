import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, UserCheck, Send, Loader2, Wifi, WifiOff, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';

// ─── AI State Indicator ───────────────────────────────────────────────────────
export function AIStateIndicator({ isHumanMode }: { isHumanMode: boolean }) {
  return (
    <AnimatePresence mode="wait">
      {isHumanMode ? (
        <motion.div
          key="human"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/20"
        >
          <UserCheck className="w-3.5 h-3.5 text-warning" />
          <span className="text-xs font-semibold text-warning">Human Control</span>
        </motion.div>
      ) : (
        <motion.div
          key="ai"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand/10 border border-brand/20"
        >
          <Bot className="w-3.5 h-3.5 text-brand" />
          <span className="text-xs font-semibold text-brand">AI Active</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Connection Status ────────────────────────────────────────────────────────
export function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
  return isConnected ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/20 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
      Live
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted bg-slate-100 border border-border px-3 py-1 rounded-full">
      <WifiOff className="w-3.5 h-3.5" />
      Connecting…
    </span>
  );
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────
export function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-text-muted/50"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ─── Message Bubble with AI/Human visual distinction ─────────────────────────
export function MessageBubble({ msg, index }: { msg: any; index: number }) {
  const isUser = msg.role === 'user';
  const isAgent = msg.role === 'human_agent';
  const isBot = msg.role === 'assistant';

  return (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.01, 0.25) }}
      className={cn('flex gap-2.5 max-w-[82%]', isUser ? 'self-end flex-row-reverse' : 'self-start')}
    >
      {/* Avatar */}
      {!isUser && (
        <div className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1',
          isBot ? 'bg-brand/10' : 'bg-warning/10'
        )}>
          {isBot
            ? <Bot className="w-4 h-4 text-brand" />
            : <UserCheck className="w-4 h-4 text-warning" />
          }
        </div>
      )}

      <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        {/* Sender label */}
        {!isUser && (
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-1',
            isBot ? 'text-brand' : 'text-warning'
          )}>
            {isBot ? 'GlamBot AI' : 'Human Agent'}
          </span>
        )}

        {/* Bubble */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed max-w-full break-words',
          isUser
            ? 'bg-brand text-white rounded-tr-sm shadow-sm shadow-brand/20'
            : isBot
            ? 'bg-white border border-border text-text-primary rounded-tl-sm shadow-sm'
            : 'bg-warning/10 border border-warning/30 text-text-primary rounded-tl-sm'
        )}>
          {msg.content}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-text-muted/60 px-1">
          {msg.createdAt
            ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Message Input ────────────────────────────────────────────────────────────
interface MessageInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isHumanMode: boolean;
  isSending: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
}

export function MessageInput({ value, onChange, onSend, onKeyDown, isHumanMode, isSending, inputRef }: MessageInputProps) {
  if (!isHumanMode) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-border">
        <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-brand" />
        </div>
        <p className="text-xs text-text-muted flex-1 leading-relaxed">
          <span className="font-semibold text-brand">GlamBot AI</span> is managing this conversation.
          Click <strong className="text-text-primary">Take Over</strong> to reply manually.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type your reply… (Enter to send)"
        disabled={isSending}
        className="flex-1 px-4 py-3 border border-border rounded-xl text-sm bg-background text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 transition-shadow"
      />
      <button
        onClick={onSend}
        disabled={!value.trim() || isSending}
        className="px-4 py-3 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-strong disabled:opacity-40 transition-all flex items-center gap-2 shadow-sm"
      >
        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}
