import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, Camera, Search, Sparkles, ChevronRight, User } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { Conversation } from '../lib/types';
import type { InboxStackParamList } from '../navigation/InboxStack';

type Props = NativeStackScreenProps<InboxStackParamList, 'InboxList'>;
type TabFilter = 'all' | 'human' | 'ai';

const BRAND_COLOR = '#8B5CF6';

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

export function InboxScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', activeTab],
    queryFn: () => api.getConversations({ status: 'active', limit: 50 }),
    refetchInterval: 10_000,
  });

  const filtered = (conversations ?? []).filter(c => {
    if (activeTab === 'ai') return c.aiMode;
    if (activeTab === 'human') return !c.aiMode;
    return true;
  });

  const humanCount = (conversations ?? []).filter(c => !c.aiMode).length;
  const subtitle = isLoading
    ? 'Loading…'
    : humanCount > 0
    ? `${humanCount} need${humanCount === 1 ? 's' : ''} your attention`
    : 'All conversations are AI-handled';

  const renderItem = ({ item }: { item: Conversation }) => {
    const lastMsg = item.messages?.[item.messages.length - 1];
    const unread = item.unreadCount ?? 0;

    return (
      <TouchableOpacity
        style={[styles.conversationCard, unread > 0 && styles.conversationCardUnread]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ConversationDetail', { conversationId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.clientInfo}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {getInitials(item.client?.name || item.client?.phone)}
                </Text>
              </View>
              <View style={[styles.platformBadgeMini, { backgroundColor: item.platform === 'whatsapp' ? '#25D366' : '#E1306C' }]}>
                {item.platform === 'whatsapp' ? (
                  <MessageCircle size={9} color="#FFFFFF" />
                ) : (
                  <Camera size={9} color="#FFFFFF" />
                )}
              </View>
            </View>
            <View style={styles.clientTextContainer}>
              <Text style={styles.clientName} numberOfLines={1}>
                {item.client?.name || item.client?.phone || 'Unknown Client'}
              </Text>
              <Text
                style={[styles.lastMessage, unread > 0 && styles.lastMessageUnread]}
                numberOfLines={1}
              >
                {lastMsg?.content || 'No messages yet'}
              </Text>
            </View>
          </View>
          <View style={styles.metaInfo}>
            <Text style={[styles.timeText, unread > 0 && styles.timeTextUnread]}>
              {timeAgo(item.lastMessageAt)}
            </Text>
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread}</Text>
              </View>
            ) : (
              <ChevronRight size={16} color="#CBD5E1" />
            )}
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.aiStatus, item.aiMode ? styles.aiActiveBg : styles.aiPausedBg]}>
            {item.aiMode ? <Sparkles size={12} color={BRAND_COLOR} /> : <User size={12} color="#F59E0B" />}
            <Text style={[styles.aiStatusText, item.aiMode ? styles.aiActiveText : styles.aiPausedText]}>
              {item.aiMode ? 'CuraVet Handling' : 'Needs Human'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.searchButton}>
          <Search size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        {(['all', 'human', 'ai'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab === 'all' ? 'All' : tab === 'human' ? 'Need Attention' : 'AI Handled'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_COLOR} />
          <Text style={styles.loadingText}>Loading conversations…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Sparkles size={40} color="#E2E8F0" />
              <Text style={styles.emptyTitle}>No conversations</Text>
              <Text style={styles.emptySubtitle}>All messages will appear here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#64748B', fontWeight: '500', marginTop: 2 },
  searchButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  activeTab: { backgroundColor: '#0F172A' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  activeTabText: { color: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
  listContent: { paddingHorizontal: 24, paddingBottom: 100, gap: 16 },
  conversationCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12,
    elevation: 2, borderWidth: 1, borderColor: '#F1F5F9',
  },
  conversationCardUnread: { borderColor: `${BRAND_COLOR}30` },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  clientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#475569' },
  platformBadgeMini: {
    position: 'absolute', bottom: -2, right: -2, width: 20, height: 20,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  clientTextContainer: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  lastMessage: { fontSize: 14, color: '#64748B', lineHeight: 20 },
  lastMessageUnread: { color: '#0F172A', fontWeight: '600' },
  metaInfo: { alignItems: 'flex-end', height: 48, justifyContent: 'space-between' },
  timeText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  timeTextUnread: { color: BRAND_COLOR, fontWeight: '700' },
  unreadBadge: {
    backgroundColor: BRAND_COLOR, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
    minWidth: 24, alignItems: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  cardFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexDirection: 'row' },
  aiStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  aiStatusText: { fontSize: 12, fontWeight: '700' },
  aiActiveBg: { backgroundColor: `${BRAND_COLOR}15` },
  aiPausedBg: { backgroundColor: '#FEF3C7' },
  aiActiveText: { color: BRAND_COLOR },
  aiPausedText: { color: '#D97706' },
  emptyState: { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#CBD5E1' },
  emptySubtitle: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
});
