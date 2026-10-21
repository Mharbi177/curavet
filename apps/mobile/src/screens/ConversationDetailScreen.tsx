import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SafeAreaView as RNSafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Bot, User, Zap, ZapOff } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import type { Message } from '../lib/types';
import type { InboxStackParamList } from '../navigation/InboxStack';

type Props = NativeStackScreenProps<InboxStackParamList, 'ConversationDetail'>;

const BRAND_COLOR = '#8B5CF6';

function MessageBubble({ msg }: { msg: Message }) {
  const isInbound = msg.direction === 'inbound';

  return (
    <View style={[styles.bubbleRow, isInbound ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      {isInbound && (
        <View style={styles.avatarSmall}>
          <User size={14} color="#64748B" />
        </View>
      )}
      <View style={[
        styles.bubble,
        isInbound ? styles.bubbleInbound : styles.bubbleOutbound,
        msg.sender === 'ai' && styles.bubbleAI,
      ]}>
        {msg.sender === 'ai' && (
          <View style={styles.aiBadge}>
            <Bot size={10} color={BRAND_COLOR} />
            <Text style={styles.aiBadgeText}>GlamBot AI</Text>
          </View>
        )}
        <Text style={[styles.bubbleText, !isInbound && styles.bubbleTextOutbound]}>
          {msg.content}
        </Text>
        <Text style={[styles.bubbleTime, !isInbound && styles.bubbleTimeOutbound]}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {!isInbound && (
        <View style={[styles.avatarSmall, styles.avatarStaff]}>
          {msg.sender === 'ai' ? (
            <Bot size={14} color={BRAND_COLOR} />
          ) : (
            <User size={14} color="#FFFFFF" />
          )}
        </View>
      )}
    </View>
  );
}

export function ConversationDetailScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.getConversation(conversationId),
    refetchInterval: 5000, // Poll every 5s until we have WebSocket on mobile
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.sendMessage(conversationId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const takeoverMutation = useMutation({
    mutationFn: () => api.takeoverConversation(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });

  const releaseMutation = useMutation({
    mutationFn: () => api.releaseConversation(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });

  const handleSend = useCallback(() => {
    const content = message.trim();
    if (!content) return;
    setMessage('');
    sendMutation.mutate(content);
  }, [message, sendMutation]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (conversation?.messages?.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [conversation?.messages?.length]);

  const messages = conversation?.messages ?? [];
  const isAiActive = conversation?.aiMode ?? true; // normalized from !humanTakeover
  const clientName = conversation?.client?.name || conversation?.client?.phone || 'Client';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{clientName.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{clientName}</Text>
            <Text style={styles.headerPlatform}>
              via {conversation?.platform ?? '...'}
            </Text>
          </View>
        </View>

        {/* AI Mode Toggle */}
        <TouchableOpacity
          style={[styles.aiToggle, isAiActive ? styles.aiToggleActive : styles.aiToggleOff]}
          onPress={() => isAiActive ? takeoverMutation.mutate() : releaseMutation.mutate()}
          disabled={takeoverMutation.isPending || releaseMutation.isPending}
        >
          {takeoverMutation.isPending || releaseMutation.isPending ? (
            <ActivityIndicator size="small" color={isAiActive ? BRAND_COLOR : '#64748B'} />
          ) : isAiActive ? (
            <>
              <Zap size={14} color={BRAND_COLOR} />
              <Text style={styles.aiToggleTextActive}>AI</Text>
            </>
          ) : (
            <>
              <ZapOff size={14} color="#64748B" />
              <Text style={styles.aiToggleTextOff}>Human</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_COLOR} />
          <Text style={styles.loadingText}>Loading conversation…</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No messages yet.</Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.inputBar}>
          {!isAiActive && (
            <TextInput
              style={styles.textInput}
              placeholder="Type a message…"
              placeholderTextColor="#94A3B8"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              returnKeyType="send"
            />
          )}
          {isAiActive ? (
            <View style={styles.aiHandlingBar}>
              <Bot size={16} color={BRAND_COLOR} />
              <Text style={styles.aiHandlingText}>
                GlamBot AI is handling this conversation
              </Text>
              <TouchableOpacity
                style={styles.takeoverButton}
                onPress={() => takeoverMutation.mutate()}
              >
                <Text style={styles.takeoverButtonText}>Take Over</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!message.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${BRAND_COLOR}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_COLOR,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerPlatform: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 64,
    justifyContent: 'center',
  },
  aiToggleActive: {
    backgroundColor: `${BRAND_COLOR}15`,
  },
  aiToggleOff: {
    backgroundColor: '#F1F5F9',
  },
  aiToggleTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_COLOR,
  },
  aiToggleTextOff: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  messagesList: {
    padding: 16,
    gap: 12,
    paddingBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarStaff: {
    backgroundColor: '#0F172A',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleInbound: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleOutbound: {
    backgroundColor: '#0F172A',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: `${BRAND_COLOR}12`,
    borderWidth: 1,
    borderColor: `${BRAND_COLOR}25`,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: BRAND_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1E293B',
    fontWeight: '400',
  },
  bubbleTextOutbound: {
    color: '#FFFFFF',
  },
  bubbleTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'right',
  },
  bubbleTimeOutbound: {
    color: 'rgba(255,255,255,0.5)',
  },
  inputBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    padding: 12,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    fontWeight: '400',
  },
  sendButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#0F172A',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  aiHandlingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${BRAND_COLOR}10`,
    padding: 14,
    borderRadius: 16,
  },
  aiHandlingText: {
    flex: 1,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  takeoverButton: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  takeoverButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
