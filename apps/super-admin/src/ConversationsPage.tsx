import React, { useEffect, useState } from 'react';
import { Search, Filter, MessageCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from './api';

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  tenantId: string;
  platform: string;
  status: string;
  lastMessageAt: string;
  client: { id: string; phone?: string | null; name?: string | null };
  messages: ConversationMessage[];
}

interface TenantSummary {
  id: string;
  name: string;
}

export default function ConversationsPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<TenantSummary[]>('/api/tenants')
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setTenants(list);
        if (list.length > 0) setSelectedTenant(list[0].id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedTenant) return;
    setLoading(true);
    apiFetch<Conversation[]>(`/api/tenants/${selectedTenant}/conversations`)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setConversations(list);
        if (list.length > 0) setSelectedId(list[0].id);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedTenant]);


  const filtered = conversations.filter(c =>
    !search ||
    (c.client.phone || '').toLowerCase().includes(search.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(search.toLowerCase()))
  );

  const selected = conversations.find(c => c.id === selectedId) || filtered[0];
  const tenantName = tenants.find(t => t.id === selectedTenant)?.name || '';

  return (
    <div className="ml-64 h-screen flex flex-col w-full bg-gray-50 overflow-hidden">
      <div className="p-8 pb-4 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live AI Conversations</h1>
          <p className="text-gray-500">Monitor real AI agent chats stored in the GlamBot database.</p>
        </div>
        <select
          value={selectedTenant}
          onChange={e => setSelectedTenant(e.target.value)}
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white"
        >
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mx-8 mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-6 px-8 pb-8 overflow-hidden">
        <div className="w-1/3 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search numbers or messages..."
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
              <Filter className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-brand" />
                Loading conversations...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No conversations yet. WhatsApp chats will appear here automatically.
              </div>
            ) : (
              filtered.map((chat, i) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.5) }}
                  key={chat.id}
                  onClick={() => setSelectedId(chat.id)}
                  className={`p-4 border-b border-gray-50 cursor-pointer transition-colors ${selected?.id === chat.id ? 'bg-brand/5 border-l-4 border-l-brand' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-gray-900 text-sm">{chat.client.phone || chat.client.name || 'Unknown client'}</span>
                    <span className="text-xs text-gray-400">{new Date(chat.lastMessageAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs font-medium text-brand mb-1">{tenantName} · {chat.platform}</div>
                  <p className="text-sm text-gray-500 truncate">{chat.messages[chat.messages.length - 1]?.content || 'No messages yet'}</p>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
            <div>
              <h3 className="font-bold text-gray-900">{selected?.client.phone || 'Select a conversation'}</h3>
              <p className="text-xs text-brand font-medium">{tenantName}</p>
            </div>
            <div className="flex gap-2">
              <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> {selected?.platform || 'WhatsApp'}
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded">
                {selected?.status === 'active' ? 'AI Handling' : selected?.status || 'No chat'}
              </span>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 bg-[#E5DDD5]/10">
            {!selected || selected.messages.length === 0 ? (
              <p className="text-center text-sm text-gray-500 mt-10">No messages in this conversation yet.</p>
            ) : (
              selected.messages.map(m => (
                <div
                  key={m.id}
                  className={m.role === 'user'
                    ? 'self-end bg-green-100 text-green-900 px-4 py-2 rounded-lg rounded-tr-none max-w-[70%] shadow-sm text-sm'
                    : 'self-start bg-white border border-gray-200 text-gray-800 px-4 py-2 rounded-lg rounded-tl-none max-w-[70%] shadow-sm text-sm'}
                >
                  {m.role !== 'user' && <div className="text-xs font-bold text-brand mb-1">GlamBot AI</div>}
                  {m.content}
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex gap-2">
            <input type="text" disabled placeholder="Read-only live transcript. Human takeover ships in the next milestone." className="flex-1 px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm cursor-not-allowed text-gray-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
