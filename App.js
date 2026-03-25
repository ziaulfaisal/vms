// App.js - Complete Vehicle Management System
// OTA Updates enabled | Slug: vhs | Project: c0f98bee-ef20-4e55-8770-de0783268608

import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon, Card, Button, Input, Chip, Badge } from 'react-native-elements';
import * as Updates from 'expo-updates';

// ============================================
// OTA UPDATE HANDLER — AUTO APPLY
// ============================================
async function checkForOTAUpdate() {
  try {
    if (__DEV__) return; // Skip OTA in dev mode
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Auto reload immediately — no user prompt needed
      await Updates.reloadAsync();
    }
  } catch (error) {
    // Silently ignore — OTA failure should never crash the app
    console.log('OTA check error:', error.message);
  }
}

// ============================================
// API Service
// ============================================
const BASE_URL = 'https://digitalizationproject2k25.pythonanywhere.com';

let authToken = null;

async function apiRequest(method, endpoint, body = null, requiresAuth = true) {
  const headers = { 'Content-Type': 'application/json' };

  if (requiresAuth) {
    if (!authToken) {
      authToken = await AsyncStorage.getItem('auth_token');
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
  }

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout - server not responding')), 30000)
    );
    const fetchPromise = fetch(`${BASE_URL}${endpoint}`, config);
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${response.status} - ${text.substring(0, 100)}`);
    }

    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
    }
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

const login = async (username, password) => {
  const data = await apiRequest('POST', '/api/login', { username, password }, false);
  if (data.success) {
    authToken = data.token;
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('user_info', JSON.stringify(data.user));
  }
  return data;
};

const logout = async () => {
  try {
    if (authToken) await apiRequest('POST', '/api/logout', null, true);
  } catch {}
  authToken = null;
  await AsyncStorage.removeItem('auth_token');
  await AsyncStorage.removeItem('user_info');
};

const getStoredUser = async () => {
  const info = await AsyncStorage.getItem('user_info');
  const token = await AsyncStorage.getItem('auth_token');
  if (token) authToken = token;
  return info ? JSON.parse(info) : null;
};

const getDashboard = () => apiRequest('GET', '/api/dashboard', null, true);
const recordGateIn = (payload) => apiRequest('POST', '/api/gate_in', payload, true);
const recordGateOut = (payload) => apiRequest('POST', '/api/gate_out', payload, true);
const updateStock = (payload) => apiRequest('POST', '/api/stock', payload, true);
const getVehicleInfo = (scanned_data) =>
  apiRequest('GET', `/api/get_vehicle_info?scanned_data=${encodeURIComponent(scanned_data)}`, null, true);
const searchVehicles = (q = '') =>
  apiRequest('GET', `/api/search?q=${encodeURIComponent(q)}`, null, true);
const getReports = () => apiRequest('GET', '/api/reports', null, true);

// ============================================
// Navigation Stack
// ============================================
const Stack = createNativeStackNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2; // 2 columns: 12px side padding each side + 12px gap

// ============================================
// Login Screen
// ============================================
function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    AsyncStorage.removeItem('auth_token');
    AsyncStorage.removeItem('user_info');
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      const res = await login(username.trim(), password.trim());
      if (res.success) {
        navigation.replace('Dashboard', { user: res.user });
      } else {
        Alert.alert('Login Failed', res.message || 'Invalid credentials');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={stylesLogin.container}
    >
      <Card containerStyle={stylesLogin.card}>
        <View style={stylesLogin.header}>
          <Icon name="car" type="material-community" size={60} color="#1a73e8" />
          <Text style={stylesLogin.title}>VMS</Text>
          <Text style={stylesLogin.subtitle}>Vehicle Management System</Text>
        </View>

        <Input
          placeholder="Username"
          leftIcon={<Icon name="account" type="material-community" size={20} color="#1a73e8" />}
          value={username}
          onChangeText={setUsername}
          containerStyle={stylesLogin.inputContainer}
          inputStyle={stylesLogin.input}
          autoCapitalize="none"
        />

        <Input
          placeholder="Password"
          leftIcon={<Icon name="lock" type="material-community" size={20} color="#1a73e8" />}
          rightIcon={
            <Icon
              name={showPassword ? 'eye-off' : 'eye'}
              type="material-community"
              size={20}
              color="#1a73e8"
              onPress={() => setShowPassword(!showPassword)}
            />
          }
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          containerStyle={stylesLogin.inputContainer}
          inputStyle={stylesLogin.input}
        />

        <Button
          title="Login"
          onPress={handleLogin}
          loading={loading}
          disabled={loading}
          buttonStyle={stylesLogin.btn}
          titleStyle={stylesLogin.btnText}
          icon={<Icon name="login" type="material-community" size={20} color="#fff" />}
          iconRight
        />
      </Card>
    </KeyboardAvoidingView>
  );
}

const stylesLogin = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a73e8', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20, elevation: 8 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1a73e8', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  inputContainer: { paddingHorizontal: 0, marginBottom: 16 },
  input: { fontSize: 15, paddingLeft: 8 },
  btn: { backgroundColor: '#1a73e8', borderRadius: 10, paddingVertical: 12, marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: 'bold', marginRight: 8 },
});

// ============================================
// Dashboard Screen — FIXED LAYOUT
// ============================================
function DashboardScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const MENU_ITEMS = [
    { label: 'Gate In',      screen: 'GateIn',   roles: ['Admin', 'Security'],           icon: 'login',           color: '#4CAF50' },
    { label: 'Gate Out',     screen: 'GateOut',  roles: ['Admin', 'Security', 'Manager'], icon: 'logout',          color: '#F44336' },
    { label: 'Stock Update', screen: 'Stock',    roles: ['Admin', 'Security', 'Manager'], icon: 'package-variant', color: '#FF9800' },
    { label: 'Search',       screen: 'Search',   roles: ['Admin', 'Security', 'Manager'], icon: 'magnify',         color: '#2196F3' },
    { label: 'Reports',      screen: 'Reports',  roles: ['Admin', 'Manager'],             icon: 'chart-bar',       color: '#9C27B0' },
  ];

  const fetchData = useCallback(async () => {
    const storedUser = await getStoredUser();
    setUser(storedUser);
    try {
      const res = await getDashboard();
      if (res.success) {
        setStats(res.data);
      } else if (res.message === 'Invalid or missing token') {
        Alert.alert('Session Expired', 'Please login again', [
          { text: 'OK', onPress: () => navigation.replace('Login') },
        ]);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  }, [navigation]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.replace('Login');
        },
      },
    ]);
  };

  const allowedMenus = MENU_ITEMS.filter((m) => !user || m.roles.includes(user.role));

  const STAT_ITEMS = [
    { label: 'Gate In',     value: stats?.gate_in_count,        color: '#4CAF50', icon: 'login'           },
    { label: 'Gate Out',    value: stats?.gate_out_count,       color: '#F44336', icon: 'logout'          },
    { label: 'In Premises', value: stats?.vehicles_in_premises, color: '#2196F3', icon: 'car'             },
    { label: 'Stock',       value: stats?.stock_count,          color: '#FF9800', icon: 'package-variant' },
  ];

  return (
    <ScrollView
      style={stylesDash.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={stylesDash.header}>
        <View>
          <Text style={stylesDash.greeting}>Hell  o, {user?.name || 'User'} 👋</Text>
          <Chip
            title={user?.role || 'Guest'}
            type="outline"
            containerStyle={stylesDash.roleChip}
            titleStyle={{ color: '#fff' }}
          />
        </View>
        <TouchableOpacity
          onPress={handleLogout}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="logout" type="material-community" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats — fixed 2-column grid using CARD_WIDTH */}
      {stats && (
        <>
          <Text style={stylesDash.sectionTitle}>Today's Overview</Text>
          <View style={stylesDash.statsGrid}>
            {STAT_ITEMS.map((s) => (
              <View
                key={s.label}
                style={[stylesDash.statCard, { borderTopColor: s.color, borderTopWidth: 4 }]}
              >
                <Icon name={s.icon} type="material-community" size={30} color={s.color} />
                <Text style={[stylesDash.statValue, { color: s.color }]}>{s.value ?? '—'}</Text>
                <Text style={stylesDash.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Quick Actions — fixed 2-column grid */}
      <Text style={stylesDash.sectionTitle}>Quick Actions</Text>
      <View style={stylesDash.menuGrid}>
        {allowedMenus.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={stylesDash.menuCard}
            onPress={() => navigation.navigate(item.screen)}
            activeOpacity={0.75}
          >
            <Icon name={item.icon} type="material-community" size={38} color={item.color} />
            <Text style={stylesDash.menuLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const stylesDash = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a73e8',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 24,
  },
  greeting: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  roleChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    borderColor: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  // ✅ FIX: explicit pixel width via CARD_WIDTH — no flex conflict
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  statCard: {
    width: CARD_WIDTH,
    marginHorizontal: 6,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  statValue: { fontSize: 28, fontWeight: 'bold', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  // ✅ FIX: same CARD_WIDTH pattern for menu
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  menuCard: {
    width: CARD_WIDTH,
    marginHorizontal: 6,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  menuLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 10,
  },
});

// ============================================
// Gate In Screen
// ============================================
function GateInScreen({ navigation }) {
  const [form, setForm] = useState({
    scanned_data: '',
    vehicle_number: '',
    make: '',
    model: '',
    km_reading: '',
    mobile_number: '',
  });
  const [loading, setLoading] = useState(false);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    const required = ['scanned_data', 'vehicle_number', 'make', 'model', 'km_reading', 'mobile_number'];
    const missing = required.filter((k) => !form[k].trim());
    if (missing.length) {
      Alert.alert('Missing Fields', `Please fill: ${missing.join(', ')}`);
      return;
    }
    setLoading(true);
    try {
      const res = await recordGateIn(form);
      if (res.success) {
        Alert.alert('Success ✅', `Gate In recorded at ${res.timestamp}`, [
          {
            text: 'OK',
            onPress: () => {
              setForm({ scanned_data: '', vehicle_number: '', make: '', model: '', km_reading: '', mobile_number: '' });
              navigation.goBack();
            },
          },
        ]);
      } else {
        Alert.alert('Failed', res.message);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const FIELDS = [
    { key: 'scanned_data',   placeholder: 'QR / Scanned Data *', icon: 'qrcode',      keyboard: 'default',    caps: 'none'       },
    { key: 'vehicle_number', placeholder: 'Vehicle Number *',     icon: 'car',         keyboard: 'default',    caps: 'characters' },
    { key: 'make',           placeholder: 'Make *',               icon: 'factory',     keyboard: 'default',    caps: 'words'      },
    { key: 'model',          placeholder: 'Model *',              icon: 'car-info',    keyboard: 'default',    caps: 'words'      },
    { key: 'km_reading',     placeholder: 'KM Reading *',         icon: 'speedometer', keyboard: 'numeric',    caps: 'none'       },
    { key: 'mobile_number',  placeholder: 'Mobile Number *',      icon: 'phone',       keyboard: 'phone-pad',  caps: 'none'       },
  ];

  return (
    <ScrollView style={stylesForm.container} contentContainerStyle={{ padding: 16 }}>
      <Card containerStyle={stylesForm.card}>
        <View style={stylesForm.header}>
          <Icon name="login" type="material-community" size={48} color="#1a73e8" />
          <Text style={[stylesForm.cardTitle, { color: '#1a73e8' }]}>Gate In Entry</Text>
        </View>

        {FIELDS.map((field) => (
          <Input
            key={field.key}
            placeholder={field.placeholder}
            leftIcon={<Icon name={field.icon} type="material-community" size={20} color="#1a73e8" />}
            value={form[field.key]}
            onChangeText={(v) => update(field.key, v)}
            keyboardType={field.keyboard}
            autoCapitalize={field.caps}
            containerStyle={stylesForm.inputContainer}
          />
        ))}

        <Button
          title="Submit Gate In"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          buttonStyle={[stylesForm.btn, { backgroundColor: '#1a73e8' }]}
          titleStyle={stylesForm.btnText}
          icon={<Icon name="check" type="material-community" size={20} color="#fff" />}
          iconRight
        />
      </Card>
    </ScrollView>
  );
}

// ============================================
// Gate Out Screen
// ============================================
function GateOutScreen({ navigation }) {
  const [scannedData, setScannedData] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState(null);
  const [looking, setLooking] = useState(false);
  const [form, setForm] = useState({ km_reading: '', name: '', contact: '', drop_by: '' });
  const [loading, setLoading] = useState(false);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const fetchVehicle = async () => {
    if (!scannedData.trim()) return;
    setLooking(true);
    try {
      const res = await getVehicleInfo(scannedData.trim());
      if (res.success) {
        setVehicleInfo(res.data);
      } else {
        Alert.alert('Not Found', res.message);
        setVehicleInfo(null);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLooking(false);
    }
  };

  const handleSubmit = async () => {
    if (!scannedData.trim()) { Alert.alert('Error', 'Scanned data required'); return; }
    setLoading(true);
    try {
      const res = await recordGateOut({ scanned_data: scannedData, ...form });
      if (res.success) {
        Alert.alert('Success ✅', `Gate Out recorded at ${res.timestamp}`, [
          {
            text: 'OK',
            onPress: () => {
              setScannedData('');
              setVehicleInfo(null);
              setForm({ km_reading: '', name: '', contact: '', drop_by: '' });
              navigation.goBack();
            },
          },
        ]);
      } else {
        Alert.alert('Failed', res.message);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const OUT_FIELDS = [
    { key: 'km_reading', placeholder: 'KM Reading',     icon: 'speedometer',   keyboard: 'numeric'   },
    { key: 'name',       placeholder: 'Customer Name',  icon: 'account',       keyboard: 'default'   },
    { key: 'contact',    placeholder: 'Contact',        icon: 'phone',         keyboard: 'phone-pad' },
    { key: 'drop_by',    placeholder: 'Drop By',        icon: 'account-check', keyboard: 'default'   },
  ];

  return (
    <ScrollView style={stylesForm.container} contentContainerStyle={{ padding: 16 }}>
      <Card containerStyle={stylesForm.card}>
        <View style={stylesForm.header}>
          <Icon name="logout" type="material-community" size={48} color="#E53935" />
          <Text style={[stylesForm.cardTitle, { color: '#E53935' }]}>Gate Out Entry</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Input
            placeholder="QR / Scanned Data *"
            leftIcon={<Icon name="qrcode" type="material-community" size={20} color="#E53935" />}
            value={scannedData}
            onChangeText={setScannedData}
            containerStyle={[stylesForm.inputContainer, { flex: 1, marginRight: 8 }]}
          />
          <Button
            title="Fetch"
            onPress={fetchVehicle}
            loading={looking}
            disabled={looking}
            buttonStyle={{ backgroundColor: '#1a73e8', borderRadius: 8, paddingHorizontal: 16, height: 48 }}
          />
        </View>

        {vehicleInfo && (
          <Card containerStyle={{ backgroundColor: '#e8f0fe', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1a73e8', marginBottom: 8 }}>
              Vehicle Details
            </Text>
            {[
              { icon: 'car',      label: `Vehicle: ${vehicleInfo.vehicle_number || '—'}` },
              { icon: 'factory',  label: `Make: ${vehicleInfo.make || '—'}` },
              { icon: 'car-info', label: `Model: ${vehicleInfo.model || '—'}` },
              { icon: 'clock',    label: `Gate In: ${vehicleInfo.gate_in_time || '—'}` },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 3 }}>
                <Icon name={row.icon} type="material-community" size={15} color="#1a73e8" />
                <Text style={{ fontSize: 13, color: '#222', marginLeft: 8 }}>{row.label}</Text>
              </View>
            ))}
          </Card>
        )}

        {OUT_FIELDS.map((field) => (
          <Input
            key={field.key}
            placeholder={field.placeholder}
            leftIcon={<Icon name={field.icon} type="material-community" size={20} color="#E53935" />}
            value={form[field.key]}
            onChangeText={(v) => update(field.key, v)}
            keyboardType={field.keyboard}
            containerStyle={stylesForm.inputContainer}
          />
        ))}

        <Button
          title="Submit Gate Out"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          buttonStyle={[stylesForm.btn, { backgroundColor: '#E53935' }]}
          titleStyle={stylesForm.btnText}
          icon={<Icon name="logout" type="material-community" size={20} color="#fff" />}
          iconRight
        />
      </Card>
    </ScrollView>
  );
}

// Shared form styles
const stylesForm = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  card: { borderRadius: 12, padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  inputContainer: { paddingHorizontal: 0, marginBottom: 12 },
  btn: { borderRadius: 10, paddingVertical: 12, marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: 'bold', marginRight: 8 },
});

// ============================================
// Stock Screen
// ============================================
function StockScreen({ navigation }) {
  const LOCATIONS = [
    'Bay 1', 'Bay 2', 'Bay 3', 'Bay 4',
    'Wash Bay', 'Service Bay', 'Parking',
    'Road Test', 'Vehicle Refuel', 'OSL Work',
  ];
  const [scans, setScans] = useState(['']);
  const [location, setLocation] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const addScan = () => setScans((s) => [...s, '']);
  const removeScan = (i) => setScans((s) => s.filter((_, idx) => idx !== i));
  const updateScan = (i, v) => setScans((s) => s.map((x, idx) => (idx === i ? v : x)));
  const needsName = ['Road Test', 'Vehicle Refuel', 'OSL Work'].includes(location);

  const handleSubmit = async () => {
    const validScans = scans.filter((s) => s.trim());
    if (!validScans.length) { Alert.alert('Error', 'Add at least one QR scan'); return; }
    if (!location) { Alert.alert('Error', 'Select a location'); return; }
    setLoading(true);
    try {
      const res = await updateStock({ scanned_data_list: validScans, location, name });
      if (res.success) {
        Alert.alert('Success ✅', res.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert('Failed', res.message);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={stylesForm.container} contentContainerStyle={{ padding: 16 }}>
      <Card containerStyle={stylesForm.card}>
        <View style={stylesForm.header}>
          <Icon name="package-variant" type="material-community" size={48} color="#FF9800" />
          <Text style={[stylesForm.cardTitle, { color: '#FF9800' }]}>Stock Update</Text>
        </View>

        <Text style={stylesStock.sectionLabel}>QR Scans</Text>
        {scans.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Input
              value={s}
              onChangeText={(v) => updateScan(i, v)}
              placeholder={`Scan ${i + 1}`}
              leftIcon={<Icon name="qrcode" type="material-community" size={20} color="#FF9800" />}
              containerStyle={[stylesForm.inputContainer, { flex: 1, marginRight: 8 }]}
            />
            {scans.length > 1 && (
              <TouchableOpacity onPress={() => removeScan(i)}>
                <Icon name="delete" type="material-community" size={24} color="#E53935" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        <Button
          title="+ Add Another Scan"
          type="outline"
          onPress={addScan}
          buttonStyle={{ borderColor: '#1a73e8', marginVertical: 8 }}
          titleStyle={{ color: '#1a73e8' }}
        />

        <Text style={[stylesStock.sectionLabel, { marginTop: 16 }]}>Location *</Text>
        <View style={stylesStock.locationGrid}>
          {LOCATIONS.map((loc) => (
            <Chip
              key={loc}
              title={loc}
              type={location === loc ? 'solid' : 'outline'}
              onPress={() => setLocation(loc)}
              containerStyle={{ margin: 3 }}
              buttonStyle={location === loc ? { backgroundColor: '#1a73e8' } : { borderColor: '#1a73e8' }}
              titleStyle={location === loc ? { color: '#fff' } : { color: '#1a73e8' }}
            />
          ))}
        </View>

        {needsName && (
          <Input
            placeholder="Name / Details *"
            leftIcon={<Icon name="account" type="material-community" size={20} color="#FF9800" />}
            value={name}
            onChangeText={setName}
            containerStyle={stylesForm.inputContainer}
          />
        )}

        <Button
          title="Update Stock"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          buttonStyle={[stylesForm.btn, { backgroundColor: '#FF9800' }]}
          titleStyle={stylesForm.btnText}
          icon={<Icon name="package-up" type="material-community" size={20} color="#fff" />}
          iconRight
        />
      </Card>
    </ScrollView>
  );
}

const stylesStock = StyleSheet.create({
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
});

// ============================================
// Search Screen
// ============================================
function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchVehicles(query.trim());
      if (res.success) setResults(res.data);
      else Alert.alert('Error', res.message);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <Card containerStyle={stylesSearch.card}>
      <View style={stylesSearch.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="car" type="material-community" size={22} color="#1a73e8" />
          <Text style={stylesSearch.vehicleNo}>{item['Vehicle Number'] || '—'}</Text>
        </View>
        <Chip
          title={item['Gate Out Time'] ? 'OUT' : 'IN'}
          type="solid"
          buttonStyle={{ backgroundColor: item['Gate Out Time'] ? '#9e9e9e' : '#4CAF50' }}
        />
      </View>
      <Text style={stylesSearch.detail}>{item['Make']} {item['Model']}</Text>
      <Text style={stylesSearch.time}>Gate In: {item['Gate In Time'] || '—'}</Text>
      {item['Gate Out Time'] && (
        <Text style={stylesSearch.time}>Gate Out: {item['Gate Out Time']}</Text>
      )}
      {item.location_history?.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4 }}>
            Location History:
          </Text>
          {item.location_history.map((h, i) => (
            <Text key={i} style={{ fontSize: 12, color: '#777', marginLeft: 4, marginVertical: 2 }}>
              • {h.location} — {h.time}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <Card containerStyle={{ margin: 12, borderRadius: 12, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Vehicle number or QR code..."
            leftIcon={<Icon name="magnify" type="material-community" size={20} color="#1a73e8" />}
            containerStyle={[stylesForm.inputContainer, { flex: 1, marginRight: 8 }]}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Button
            title="Search"
            onPress={handleSearch}
            buttonStyle={{ backgroundColor: '#1a73e8', borderRadius: 8, paddingHorizontal: 16, height: 48 }}
          />
        </View>
      </Card>

      {loading && <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#1a73e8" />}

      {!loading && searched && results.length === 0 && (
        <Card containerStyle={{ margin: 12, borderRadius: 12, padding: 20 }}>
          <Text style={{ textAlign: 'center', color: '#aaa', fontSize: 15 }}>No vehicles found</Text>
        </Card>
      )}

      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
      />
    </View>
  );
}

const stylesSearch = StyleSheet.create({
  card: { marginHorizontal: 0, marginBottom: 10, borderRadius: 12, padding: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  vehicleNo: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  detail: { color: '#555', fontSize: 13, marginVertical: 4 },
  time: { color: '#888', fontSize: 12, marginVertical: 2 },
});

// ============================================
// Reports Screen
// ============================================
function ReportsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('gate_in');

  useEffect(() => {
    getReports()
      .then((res) => { if (res.success) setData(res.data); })
      .catch((err) => Alert.alert('Error', err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 64 }} size="large" color="#1a73e8" />;

  const TABS = [
    { key: 'gate_in',  label: 'Gate In',  icon: 'login',           color: '#4CAF50' },
    { key: 'gate_out', label: 'Gate Out', icon: 'logout',          color: '#F44336' },
    { key: 'stock',    label: 'Stock',    icon: 'package-variant', color: '#FF9800' },
  ];

  const records = data?.[tab] || [];

  const REPORT_CONFIG = {
    gate_in:  { icon: 'car',             color: '#4CAF50', getSub: (r) => `${r.make} ${r.model}` },
    gate_out: { icon: 'car',             color: '#F44336', getSub: (r) => `Customer: ${r.name}` },
    stock:    { icon: 'package-variant', color: '#FF9800', getSub: (r) => `Location: ${r.location}` },
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <View style={stylesReports.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[
              stylesReports.tab,
              tab === t.key && { backgroundColor: t.color, borderRadius: 8, marginHorizontal: 4 },
            ]}
            onPress={() => setTab(t.key)}
          >
            <Icon name={t.icon} type="material-community" size={18} color={tab === t.key ? '#fff' : '#555'} />
            <Text style={[stylesReports.tabText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
            <Badge value={data?.[t.key]?.length ?? 0} status="primary" containerStyle={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {records.length === 0 ? (
          <Card containerStyle={{ margin: 0, borderRadius: 10, padding: 20 }}>
            <Text style={{ textAlign: 'center', color: '#aaa', fontSize: 15 }}>No records found</Text>
          </Card>
        ) : (
          records.map((record, index) => {
            const c = REPORT_CONFIG[tab];
            return (
              <Card key={index} containerStyle={stylesReports.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Icon name={c.icon} type="material-community" size={20} color={c.color} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#222', flex: 1 }}>
                    {record.vehicle || record.qr || '—'}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{c.getSub(record)}</Text>
                <Text style={{ fontSize: 11, color: '#aaa' }}>{record.datetime}</Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const stylesReports = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: '#555', marginLeft: 4 },
  row: { marginBottom: 8, borderRadius: 10, padding: 12 },
});

// ============================================
// App Entry Point
// ============================================
export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    // ✅ OTA check runs ONCE at app startup
    checkForOTAUpdate();

    AsyncStorage.getItem('auth_token').then((token) => {
      setInitialRoute(token ? 'Dashboard' : 'Login');
    });
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#1a73e8' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="Login"     component={LoginScreen}     options={{ headerShown: false }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'VMS Dashboard', headerLeft: () => null }} />
        <Stack.Screen name="GateIn"    component={GateInScreen}    options={{ title: 'Gate In' }} />
        <Stack.Screen name="GateOut"   component={GateOutScreen}   options={{ title: 'Gate Out' }} />
        <Stack.Screen name="Stock"     component={StockScreen}     options={{ title: 'Stock Update' }} />
        <Stack.Screen name="Search"    component={SearchScreen}    options={{ title: 'Search Vehicle' }} />
        <Stack.Screen name="Reports"   component={ReportsScreen}   options={{ title: 'Reports' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
