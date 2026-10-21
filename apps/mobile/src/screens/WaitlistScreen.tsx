import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, CalendarCheck, MessageSquare, Star, ArrowRight } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { WaitlistEntry } from '../lib/types';

const BRAND_COLOR = '#8B5CF6';

export function WaitlistScreen() {
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => api.getWaitlist(),
    refetchInterval: 30_000,
  });

  const notifyMutation = useMutation({
    mutationFn: (id: string) => api.notifyWaitlistEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.updateWaitlistEntry(id, 'cancelled'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const renderItem = ({ item }: { item: WaitlistEntry }) => {
    const clientName = item.client?.name || item.client?.phone || 'Unknown';
    const isVip = item.client?.isVip ?? false;
    const timeLabel = item.preferredDate
      ? new Date(item.preferredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Any day';
    const timeOfDay = item.preferredTimeOfDay ? ` · ${item.preferredTimeOfDay}` : '';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.clientRow}>
            <Text style={styles.clientName}>{clientName}</Text>
            {isVip && (
              <View style={styles.vipBadge}>
                <Star size={10} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.vipText}>VIP</Text>
              </View>
            )}
          </View>
          <Text style={styles.addedText}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <View style={styles.iconBox}>
              <CalendarCheck size={14} color={BRAND_COLOR} />
            </View>
            <Text style={styles.detailText}>{item.service?.nameEn || 'Service'}</Text>
          </View>
          <View style={styles.detailItem}>
            <View style={[styles.iconBox, { backgroundColor: '#F1F5F9' }]}>
              <Clock size={14} color="#64748B" />
            </View>
            <Text style={styles.detailText}>{`${timeLabel}${timeOfDay}`}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() =>
              Alert.alert('Cancel', `Remove ${clientName} from the waitlist?`, [
                { text: 'No', style: 'cancel' },
                { text: 'Yes, Remove', onPress: () => cancelMutation.mutate(item.id), style: 'destructive' },
              ])
            }
            disabled={cancelMutation.isPending}
          >
            <MessageSquare size={16} color="#64748B" />
            <Text style={styles.actionBtnSecondaryText}>Remove</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={() => notifyMutation.mutate(item.id)}
            disabled={notifyMutation.isPending || item.status === 'notified'}
          >
            {notifyMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.actionBtnPrimaryText}>
                  {item.status === 'notified' ? 'Notified ✓' : 'Notify Client'}
                </Text>
                {item.status !== 'notified' && <ArrowRight size={16} color="#FFFFFF" />}
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const activeEntries = (entries ?? []).filter(e => e.status === 'waiting' || e.status === 'notified');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Waitlist</Text>
          <Text style={styles.headerSubtitle}>
            {isLoading ? 'Loading…' : `${activeEntries.length} client${activeEntries.length !== 1 ? 's' : ''} waiting`}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_COLOR} />
          <Text style={styles.loadingText}>Loading waitlist…</Text>
        </View>
      ) : (
        <FlatList
          data={activeEntries}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Clock size={48} color="#E2E8F0" />
              <Text style={styles.emptyTitle}>No one waiting</Text>
              <Text style={styles.emptySubtitle}>When clients join the waitlist, they'll appear here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#64748B', fontWeight: '500', marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
  listContent: { paddingHorizontal: 24, paddingBottom: 100, gap: 16 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12,
    elevation: 3, borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clientName: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  vipBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, gap: 4,
  },
  vipText: { fontSize: 10, fontWeight: '800', color: '#D97706', textTransform: 'uppercase' },
  addedText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  detailsRow: { gap: 12, marginBottom: 20, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: `${BRAND_COLOR}15`,
    justifyContent: 'center', alignItems: 'center',
  },
  detailText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, backgroundColor: '#F1F5F9', borderRadius: 14,
  },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  actionBtnPrimary: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, backgroundColor: '#0F172A', borderRadius: 14,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  emptyState: { paddingTop: 80, alignItems: 'center', gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#CBD5E1' },
  emptySubtitle: { fontSize: 14, color: '#94A3B8', fontWeight: '500', textAlign: 'center' },
});
