import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek, isSameDay, isToday, parseISO } from 'date-fns';
import { api } from '../lib/api';
import type { Booking } from '../lib/types';
import { NewBookingModal } from './NewBookingModal';

const BRAND_COLOR = '#8B5CF6';
const HOUR_HEIGHT = 64;
const START_HOUR = 8;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

const STATUS_COLORS: Record<string, string> = {
  pending:   '#F59E0B',
  confirmed: BRAND_COLOR,
  completed: '#10B981',
  cancelled: '#EF4444',
  no_show:   '#94A3B8',
};

function getTopAndHeight(booking: Booking) {
  const start = parseISO(booking.scheduledAt);
  const end = parseISO(booking.endsAt);
  const startMins = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
  const endMins = (end.getHours() - START_HOUR) * 60 + end.getMinutes();
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT - 4, 32);
  return { top, height };
}

export function CalendarScreen() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isNewBookingModalVisible, setIsNewBookingModalVisible] = useState(false);

  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['bookings', 'mobile', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      // Pass the next day as endDate so the API's lte filter includes the full day
      const nextDay = format(addDays(selectedDate, 1), 'yyyy-MM-dd');
      return api.getBookings({ startDate: dateStr, endDate: nextDay });
    },
    refetchInterval: 30_000,
  });

  const dayBookings = useMemo(() =>
    (bookings ?? []).filter(b => isSameDay(parseISO(b.scheduledAt), selectedDate)),
    [bookings, selectedDate]
  );

  const now = new Date();
  const nowTop = (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_HEIGHT;
  const showNowLine = isToday(selectedDate) && now.getHours() >= START_HOUR && now.getHours() < END_HOUR;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Calendar</Text>
          <Text style={styles.headerSubtitle}>
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')}
            {' · '}{dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsNewBookingModalVisible(true)}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Week Strip */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setCurrentDate(d => addDays(d, -7))} style={styles.navArrow}>
          <ChevronLeft size={20} color="#64748B" />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
          {weekDays.map(day => {
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[styles.dayPill, selected && styles.dayPillSelected, today && !selected && styles.dayPillToday]}
                onPress={() => setSelectedDate(day)}
              >
                <Text style={[styles.dayName, selected && styles.dayTextSelected]}>
                  {format(day, 'EEE')}
                </Text>
                <Text style={[styles.dayNum, selected && styles.dayTextSelected, today && !selected && styles.dayNumToday]}>
                  {format(day, 'd')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity onPress={() => setCurrentDate(d => addDays(d, 7))} style={styles.navArrow}>
          <ChevronRight size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Timeline */}
      <View style={styles.timeline}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.timelineBody}>
            {/* Hour gutters */}
            <View style={styles.timeGutter}>
              {HOURS.map(h => (
                <View key={h} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start', paddingTop: 4 }}>
                  <Text style={styles.hourLabel}>
                    {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                  </Text>
                </View>
              ))}
            </View>

            {/* Grid + bookings */}
            <View style={styles.gridArea}>
              {HOURS.map(h => (
                <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]} />
              ))}

              {/* Now line */}
              {showNowLine && (
                <View style={[styles.nowLine, { top: nowTop }]}>
                  <View style={styles.nowDot} />
                  <View style={styles.nowLineBar} />
                </View>
              )}

              {/* Loading spinner */}
              {isLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={BRAND_COLOR} size="large" />
                </View>
              )}

              {/* Booking chips */}
              {dayBookings.map(booking => {
                const { top, height } = getTopAndHeight(booking);
                const color = STATUS_COLORS[booking.status] || BRAND_COLOR;
                const clientName = booking.client?.name || booking.client?.phone || 'Client';
                return (
                  <TouchableOpacity
                    key={booking.id}
                    style={[styles.bookingChip, { top, height, backgroundColor: `${color}15`, borderLeftColor: color }]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipService, { color }]} numberOfLines={1}>
                      {booking.service?.nameEn}
                    </Text>
                    {height > 44 && (
                      <Text style={styles.chipClient} numberOfLines={1}>{clientName}</Text>
                    )}
                    {height > 64 && (
                      <Text style={styles.chipTime}>
                        {format(parseISO(booking.scheduledAt), 'HH:mm')} – {format(parseISO(booking.endsAt), 'HH:mm')}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Empty state */}
              {!isLoading && dayBookings.length === 0 && (
                <View style={styles.emptyDay}>
                  <Text style={styles.emptyDayText}>No bookings scheduled</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>

      <NewBookingModal 
        visible={isNewBookingModalVisible} 
        onClose={() => setIsNewBookingModalVisible(false)} 
        selectedDate={selectedDate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: BRAND_COLOR, fontWeight: '700', marginTop: 2 },
  addButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND_COLOR,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: BRAND_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 16 },
  navArrow: { padding: 8 },
  dayStrip: { flexDirection: 'row', gap: 4, paddingHorizontal: 4 },
  dayPill: {
    alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', minWidth: 48,
  },
  dayPillSelected: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  dayPillToday: { borderColor: BRAND_COLOR },
  dayName: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  dayNum: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  dayTextSelected: { color: '#FFFFFF' },
  dayNumToday: { color: BRAND_COLOR },
  timeline: { flex: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  timelineBody: { flexDirection: 'row', paddingVertical: 12, paddingBottom: 100 },
  timeGutter: { width: 60, paddingLeft: 16 },
  hourLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  gridArea: { flex: 1, position: 'relative', paddingRight: 20 },
  hourRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  nowLine: {
    position: 'absolute', left: -4, right: 16,
    flexDirection: 'row', alignItems: 'center', zIndex: 10,
  },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', flexShrink: 0 },
  nowLineBar: { flex: 1, height: 2, backgroundColor: '#EF4444' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  bookingChip: {
    position: 'absolute', left: 4, right: 0,
    borderRadius: 12, padding: 10, borderLeftWidth: 4,
  },
  chipService: { fontSize: 13, fontWeight: '800' },
  chipClient: { fontSize: 12, fontWeight: '600', color: '#475569', marginTop: 3 },
  chipTime: { fontSize: 11, color: '#64748B', marginTop: 4 },
  emptyDay: {
    position: 'absolute', top: 160, left: 0, right: 16,
    alignItems: 'center',
  },
  emptyDayText: { fontSize: 14, color: '#CBD5E1', fontWeight: '600' },
});
