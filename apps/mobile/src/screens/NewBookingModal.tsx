import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, ScrollView, Dimensions
} from 'react-native';
import { X, Calendar as CalIcon, User, Clock, Check } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const BRAND_COLOR = '#8B5CF6';

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
}

export function NewBookingModal({ visible, onClose, selectedDate }: Props) {
  const queryClient = useQueryClient();
  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [time, setTime] = useState('10:00');

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.getServices(),
    enabled: visible,
  });

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.getStaff(),
    enabled: visible,
  });

  const createBookingMutation = useMutation({
    mutationFn: async () => {
      // 1. Resolve client — search first, create if not found
      const { clients } = await api.getClients({ search: clientPhone });
      let client = clients.find(c => c.phone === clientPhone);
      
      if (!client) {
        try {
          client = await api.createClient({ phone: clientPhone, name: clientName || undefined });
        } catch (err: any) {
          // 409 = phone already exists; the response body contains the id
          if (err?.response?.data?.id) {
            // fetch by phone again – server returned the existing record's id
            const { clients: found } = await api.getClients({ search: clientPhone });
            client = found.find(c => c.phone === clientPhone);
          }
          if (!client) throw err;
        }
      } else if (clientName && !client.name) {
        await api.updateClient(client.id, { name: clientName });
      }

      const defaultStaff = staff?.[0]?.id;
      if (!defaultStaff) throw new Error('No staff available');
      if (!selectedServiceId) throw new Error('Please select a service');

      // 2. Create the booking
      return api.createBooking({
        clientId: client.id,
        serviceId: selectedServiceId,
        staffId: defaultStaff,
        date: selectedDate.toISOString().split('T')[0],
        time: time,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert('Booking Error', err.message);
    }
  });

  const reset = () => {
    setClientPhone('');
    setClientName('');
    setSelectedServiceId(null);
    setTime('10:00');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isFormValid = clientPhone.length >= 8 && selectedServiceId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
            <X size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Booking</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Client Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Details</Text>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <User size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Client Name (Optional)"
                  placeholderTextColor="#94A3B8"
                  value={clientName}
                  onChangeText={setClientName}
                />
              </View>
              
              <View style={styles.inputWrapper}>
                <Text style={styles.phonePrefix}>+971</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5X XXX XXXX"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  value={clientPhone}
                  onChangeText={setClientPhone}
                />
              </View>
            </View>
          </View>

          {/* Service Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Service</Text>
            {servicesLoading ? (
              <ActivityIndicator color={BRAND_COLOR} style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.servicesGrid}>
                {services?.map(service => (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.servicePill,
                      selectedServiceId === service.id && styles.servicePillActive
                    ]}
                    onPress={() => setSelectedServiceId(service.id)}
                  >
                    <Text style={[
                      styles.servicePillText,
                      selectedServiceId === service.id && styles.servicePillTextActive
                    ]}>
                      {service.nameEn}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Time Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time</Text>
            <View style={styles.inputWrapper}>
              <Clock size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="10:00"
                value={time}
                onChangeText={setTime}
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.bookButton, !isFormValid && styles.bookButtonDisabled]}
            disabled={!isFormValid || createBookingMutation.isPending}
            onPress={() => createBookingMutation.mutate()}
          >
            {createBookingMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.bookButtonText}>Confirm Booking</Text>
                <Check size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  iconButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  content: { flex: 1 },
  scrollContent: { padding: 24, gap: 32 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  inputGroup: { gap: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 16, height: 56, paddingHorizontal: 16,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: '#0F172A', fontWeight: '500' },
  phonePrefix: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginRight: 8 },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  servicePill: {
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
  },
  servicePillActive: { backgroundColor: `${BRAND_COLOR}15`, borderColor: BRAND_COLOR },
  servicePillText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  servicePillTextActive: { color: BRAND_COLOR },
  footer: {
    padding: 24, paddingBottom: 40, backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  bookButton: {
    backgroundColor: '#0F172A', height: 56, borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  bookButtonDisabled: { opacity: 0.4 },
  bookButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
