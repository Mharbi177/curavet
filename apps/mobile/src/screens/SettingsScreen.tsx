import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Bell, Shield, Sparkles, HelpCircle,
  LogOut, ChevronRight, Store,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

const SETTING_GROUPS = [
  {
    title: 'Salon Management',
    items: [
      { id: 'profile', icon: Store, title: 'Salon Profile', color: '#3B82F6' },
      { id: 'team', icon: User, title: 'Team Members', color: '#10B981' },
      { id: 'ai', icon: Sparkles, title: 'GlamBot AI Settings', color: '#8B5CF6' },
    ]
  },
  {
    title: 'Preferences',
    items: [
      { id: 'notifications', icon: Bell, title: 'Push Notifications', color: '#F59E0B' },
      { id: 'privacy', icon: Shield, title: 'Privacy & Security', color: '#64748B' },
    ]
  },
  {
    title: 'Support',
    items: [
      { id: 'help', icon: HelpCircle, title: 'Help Center', color: '#0EA5E9' },
    ]
  }
];

const BRAND_COLOR = '#8B5CF6';

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setIsLoggingOut(true);
          await logout();
          setIsLoggingOut(false);
        }
      }
    ]);
  };

  const displayName = user?.name || user?.email || 'Admin';
  const role =
    user?.role === 'super_admin' ? 'Super Administrator'
    : user?.role === 'doctor' ? 'Docteur Vétérinaire'
    : user?.role === 'receptionist' ? 'Assistant(e) ASV'
    : 'Propriétaire';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileRole}>{role}</Text>
          </View>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Salon info */}
        {user?.tenant && (
          <View style={styles.tenantBadge}>
            <Store size={14} color="#64748B" />
            <Text style={styles.tenantName}>{user.tenant.name}</Text>
            <View style={styles.planBadge}>
              <Text style={styles.planText}>{user.tenant.plan?.toUpperCase() ?? 'PRO'}</Text>
            </View>
          </View>
        )}

        {/* Settings Groups */}
        {SETTING_GROUPS.map((group) => (
          <View key={group.title} style={styles.groupContainer}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, index) => {
                const isLast = index === group.items.length - 1;
                return (
                  <View key={item.id}>
                    <TouchableOpacity style={styles.settingRow}>
                      <View style={styles.settingRowLeft}>
                        <View style={[styles.iconBox, { backgroundColor: `${item.color}15` }]}>
                          <item.icon size={18} color={item.color} />
                        </View>
                        <Text style={styles.settingTitle}>{item.title}</Text>
                      </View>
                      <ChevronRight size={20} color="#CBD5E1" />
                    </TouchableOpacity>
                    {!isLast && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <>
              <LogOut size={20} color="#EF4444" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.versionText}>GlamBot Mobile v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 100 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    padding: 16, borderRadius: 20, marginBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12,
    elevation: 3, borderWidth: 1, borderColor: '#F1F5F9',
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: BRAND_COLOR,
    justifyContent: 'center', alignItems: 'center', marginRight: 16,
  },
  profileAvatarText: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  profileRole: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  editButton: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  editButtonText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  tenantBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 16, marginBottom: 28, borderWidth: 1, borderColor: '#F1F5F9',
  },
  tenantName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#475569' },
  planBadge: { backgroundColor: `${BRAND_COLOR}15`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  planText: { fontSize: 11, fontWeight: '800', color: BRAND_COLOR, letterSpacing: 0.5 },
  groupContainer: { marginBottom: 24 },
  groupTitle: {
    fontSize: 13, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginLeft: 8,
  },
  groupCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8,
    elevation: 2, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 68 },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 16, marginBottom: 24,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#EF4444' },
  versionText: { textAlign: 'center', fontSize: 12, color: '#94A3B8', fontWeight: '500' },
});
