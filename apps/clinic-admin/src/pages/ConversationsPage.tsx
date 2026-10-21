import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MessageCircle, User, Phone,
  AlertCircle, Loader2, Bot, UserCheck, RefreshCw,
  Instagram, Globe, ChevronLeft,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeConversations } from '../hooks/useRealtimeConversations';
import { formatDateTime, cn, getInitials } from '../lib/utils';
import toast from 'react-hot-toast';
import type { Conversation, ConversationMessage } from '../lib/types';
import {
  TypingDots,
  MessageBubble,
  MessageInput,
  AIStateIndicator,
  ConnectionStatus,
} from '../components/conversation/ConversationComponents';

// ─── Platform Icon ────────────────────────────────────────────────────────────
function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === 'instagram') return <Instagram className={cn('w-4 h-4 text-purple-500', className)} />;
  if (platform === 'web') return <Globe className={cn('w-4 h-4 text-blue-500', className)} />;
  return <Phone className={cn('w-4 h-4 text-green-500', className)} />;
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    whatsapp: 'bg-green-100 text-green-700',
    instagram: 'bg-brand/10 text-brand',
    web: 'bg-info/10 text-info',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize flex items-center gap-1', colors[platform] ?? 'bg-slate-100 text-text-muted')}>
      <PlatformIcon platform={platform} className="w-3 h-3" />
      {platform}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ConversationsPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id') || null);
  const [newMessage, setNewMessage] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(!!searchParams.get('id'));
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectConversation = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setSearchParams({ id }, { replace: true });
      setShowMobileChat(true);
    } else {
      setSearchParams({}, { replace: true });
      setShowMobileChat(false);
    }
  }, [setSearchParams]);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', tenant?.id],
    queryFn: () => api.getConversations({ status: filterStatus === 'all' ? undefined : filterStatus }),
    enabled: !!tenant,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: selectedConversation, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.getConversation(selectedId!),
    enabled: !!selectedId,
    staleTime: 5_000,
  });

  const isHumanMode = selectedConversation?.humanTakeover ?? false;

  const { isConnected, typingConversationIds } = useRealtimeConversations({
    tenantId: tenant?.id,
    enabled: !!tenant,
    onNewMessage: (event) => {
      if (event.conversationId && event.conversationId !== selectedId) {
        const conv = conversations?.find(c => c.id === event.conversationId);
        const name = conv?.client?.name || 'Client';
        toast(`💬 New message from ${name}`, { duration: 3000, id: event.conversationId });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant?.id], refetchType: 'active' });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages?.length, typingConversationIds]);

  useEffect(() => {
    if (!tenant) return;
    queryClient.invalidateQueries({ queryKey: ['conversations', tenant.id] });
  }, [filterStatus, tenant, queryClient]);

  const takeoverMutation = useMutation({
    mutationFn: (id: string) => api.takeoverConversation(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation>(['conversation', updated.id], (old) =>
        old ? { ...old, humanTakeover: true } : old
      );
      toast.success('You have taken over the conversation');
      inputRef.current?.focus();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => api.releaseConversation(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation>(['conversation', updated.id], (old) =>
        old ? { ...old, humanTakeover: false } : old
      );
      toast.success('AI has resumed the conversation');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      api.sendMessage(conversationId, content),
    onMutate: async ({ conversationId, content }) => {
      const optimisticMsg: ConversationMessage = {
        id: `optimistic-${Date.now()}`,
        role: 'human_agent',
        content,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Conversation>(['conversation', conversationId], (old) => {
        if (!old) return old;
        return { ...old, messages: [...(old.messages ?? []), optimisticMsg] };
      });
      return { optimisticMsg };
    },
    onSuccess: (serverMsg, { conversationId }) => {
      queryClient.setQueryData<Conversation>(['conversation', conversationId], (old) => {
        if (!old) return old;
        const messages = (old.messages ?? []).filter(m => !m.id.startsWith('optimistic-'));
        const exists = messages.some(m => m.id === serverMsg.id);
        return { ...old, messages: exists ? messages : [...messages, serverMsg] };
      });
      setNewMessage('');
    },
    onError: (err: Error, { conversationId }) => {
      queryClient.setQueryData<Conversation>(['conversation', conversationId], (old) => {
        if (!old) return old;
        return { ...old, messages: (old.messages ?? []).filter(m => !m.id.startsWith('optimistic-')) };
      });
      toast.error(`Failed to send: ${err.message}`);
    },
    onSettled: () => setIsSending(false),
  });

  const sendMessage = useCallback(() => {
    if (!selectedId || !newMessage.trim() || isSending) return;
    setIsSending(true);
    sendMessageMutation.mutate({ conversationId: selectedId, content: newMessage.trim() });
  }, [selectedId, newMessage, isSending, sendMessageMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filteredConversations = (conversations ?? []).filter(c => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      !search ||
      c.client.name?.toLowerCase().includes(searchLower) ||
      c.client.phone?.includes(search) ||
      c.client.instagramId?.toLowerCase().includes(searchLower);
    const matchesPlatform = filterPlatform === 'all' || c.platform === filterPlatform;
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesPlatform && matchesStatus;
  });

  const selectedListConv = conversations?.find(c => c.id === selectedId);

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">

      {/* ── Top bar ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4 flex-shrink-0"
      >
        <div>
          <h1 className="text-xl font-bold text-text-primary">Conversations</h1>
          <p className="text-sm text-text-muted">Monitor and manage AI conversations in real-time</p>
        </div>
        <ConnectionStatus isConnected={isConnected} />
      </motion.div>

      {/* ── Split layout ── */}
      <div className="flex-1 flex overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">

        {/* LEFT: Conversation list */}
        <div className={cn(
          'w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 border-r border-border flex flex-col bg-background',
          showMobileChat ? 'hidden lg:flex' : 'flex'
        )}>

          {/* Search + filters */}
          <div className="p-4 border-b border-border space-y-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 transition-shadow"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-xs bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="all">All Platforms</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="web">Web</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-xs bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && !conversations ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center gap-3">
                <MessageCircle className="w-10 h-10 text-text-muted/30" />
                <p className="text-sm font-medium text-text-muted">No conversations found</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const lastMsg = (conv.messages ?? [])[(conv.messages ?? []).length - 1];
                const isActive = selectedId === conv.id;
                const hasTyping = typingConversationIds.has(conv.id);

                return (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className={cn(
                      'w-full px-4 py-4 text-left hover:bg-slate-50 transition-colors relative border-b border-border/50',
                      isActive && 'bg-brand/5 border-l-[3px] border-l-brand'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold',
                        conv.status === 'active' ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-text-muted'
                      )}>
                        {getInitials(conv.client.name || conv.client.phone || '?')}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <p className="font-semibold text-sm text-text-primary truncate">
                            {conv.client.name || conv.client.instagramId || conv.client.phone || 'Unknown'}
                          </p>
                          <span className="text-[10px] text-text-muted flex-shrink-0">
                            {conv.lastMessageAt
                              ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mb-1.5">
                          <PlatformBadge platform={conv.platform} />
                          {conv.humanTakeover && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-warning/10 text-warning flex items-center gap-0.5">
                              <UserCheck className="w-2.5 h-2.5" /> Human
                            </span>
                          )}
                          <span className={cn(
                            'px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                            conv.status === 'active' ? 'bg-success/10 text-success' : 'bg-slate-100 text-text-muted'
                          )}>
                            {conv.status}
                          </span>
                        </div>

                        {hasTyping ? (
                          <div className="flex items-center gap-1 text-xs text-brand">
                            <TypingDots />
                          </div>
                        ) : (
                          <p className="text-xs text-text-muted truncate leading-relaxed">
                            {lastMsg?.content || 'No messages yet'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          <div className="px-4 py-3 border-t border-border bg-slate-50 flex-shrink-0">
            <p className="text-xs font-medium text-text-muted">
              {filteredConversations.length} conversation{filteredConversations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* RIGHT: Chat view */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0',
          showMobileChat ? 'flex' : 'hidden lg:flex'
        )}
          style={{ background: '#F7F4F1' }}
        >
          {selectedId && selectedListConv ? (
            <>
              {/* Chat header */}
              <div className="px-5 py-4 border-b border-border bg-white/80 backdrop-blur-sm flex items-center justify-between gap-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectConversation(null)}
                    className="lg:hidden p-2 -ml-1 rounded-xl text-text-muted hover:bg-slate-100 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0 font-bold text-brand">
                    {getInitials(selectedListConv.client.name || selectedListConv.client.phone || '?')}
                  </div>

                  <div>
                    <p className="font-bold text-text-primary">
                      {selectedListConv.client.name || selectedListConv.client.instagramId || 'Unknown Client'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {selectedListConv.client.phone || selectedListConv.client.instagramId || 'No contact'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <PlatformBadge platform={selectedListConv.platform} />
                  <AIStateIndicator isHumanMode={isHumanMode} />

                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['conversation', selectedId] })}
                    className="p-2 rounded-xl text-text-muted hover:bg-slate-100 hover:text-text-primary transition-colors"
                    title="Refresh messages"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  {isHumanMode ? (
                    <button
                      onClick={() => releaseMutation.mutate(selectedId)}
                      disabled={releaseMutation.isPending}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-brand/10 text-brand text-xs font-bold rounded-xl hover:bg-brand/20 transition-colors disabled:opacity-50 border border-brand/20"
                    >
                      {releaseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                      Resume AI
                    </button>
                  ) : (
                    <button
                      onClick={() => takeoverMutation.mutate(selectedId)}
                      disabled={takeoverMutation.isPending}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-warning/10 text-warning text-xs font-bold rounded-xl hover:bg-warning/20 transition-colors disabled:opacity-50 border border-warning/20"
                    >
                      {takeoverMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                      Take Over
                    </button>
                  )}
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  </div>
                ) : (selectedConversation?.messages ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <MessageCircle className="w-12 h-12 text-text-muted/20" />
                    <p className="text-sm text-text-muted">No messages yet</p>
                  </div>
                ) : (
                  <>
                    {(selectedConversation?.messages ?? []).map((msg, i) => (
                      <MessageBubble key={msg.id} msg={msg} index={i} />
                    ))}

                    <AnimatePresence>
                      {typingConversationIds.has(selectedId) && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="self-start flex items-center gap-2"
                        >
                          <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-brand" />
                          </div>
                          <div className="bg-white border border-border rounded-2xl rounded-tl-sm shadow-sm">
                            <TypingDots />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="flex-shrink-0 border-t border-border bg-white/80 backdrop-blur-sm p-4">
                <MessageInput
                  value={newMessage}
                  onChange={setNewMessage}
                  onSend={sendMessage}
                  onKeyDown={handleKeyDown}
                  isHumanMode={isHumanMode}
                  isSending={isSending}
                  inputRef={inputRef}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                <MessageCircle className="w-10 h-10 text-text-muted/30" />
              </div>
              <div className="text-center">
                <p className="font-bold text-text-primary">Select a conversation</p>
                <p className="text-sm text-text-muted mt-1">Choose from the list to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
