// App.js - Vehicle Management System with Camera QR Scanning
// Works with Expo SDK 51

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Modal,
  TextInput,
  Vibration,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon, Card, Button, Input, Chip, Badge } from 'react-native-elements';
import * as Updates from 'expo-updates';
import { Camera, CameraView } from 'expo-camera';

// ============================================
// OTA UPDATE HANDLER
// ============================================
async function checkForOTAUpdate() {
  try {
    if (__DEV__) return;
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (error) {
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
      setTimeout(() => reject(new Error('Request timeout')), 30000)
    );
    const fetchPromise = fetch(`${BASE_URL}${endpoint}`, config);
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${response.status}`);
    }

    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response`);
    }
  } catch (error) {
    console.error(`API request failed:`, error);
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
const checkDuplicate = (scanned_data) =>
  apiRequest('GET', `/api/check_duplicate?scanned_data=${encodeURIComponent(scanned_data)}`, null, true);

// ============================================
// Navigation Stack
// ============================================
const Stack = createNativeStackNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

// ============================================
// QR Scanner Modal Component
// ============================================
function QRScannerModal({ visible, onClose, onScan, title = "Scan QR Code" }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorchOn(false);
      setShowManual(false);
      (async () => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      })();
    }
  }, [visible]);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    if (Platform.OS !== 'web' && Vibration) {
      Vibration.vibrate(100);
    }
    onScan(data);
    onClose();
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      onClose();
      setManualInput('');
    } else {
      Alert.alert('Error', 'Please enter a QR code value');
    }
  };

  if (showManual) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={stylesScanner.modalContainer}>
          <View style={stylesScanner.manualHeader}>
            <TouchableOpacity onPress={() => setShowManual(false)} style={stylesScanner.closeBtn}>
              <Icon name="arrow-left" type="material-community" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={stylesScanner.manualTitle}>Manual Entry</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={stylesScanner.manualText}>Enter QR Code Value:</Text>
          <TextInput
            style={stylesScanner.manualInput}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="Enter QR code"
            autoCapitalize="none"
            autoFocus
          />
          <Button
            title="Submit"
            onPress={handleManualSubmit}
            buttonStyle={{ backgroundColor: '#1a73e8', borderRadius: 10, marginTop: 20 }}
          />
          <Button
            title="Back to Scanner"
            type="outline"
            onPress={() => setShowManual(false)}
            containerStyle={{ marginTop: 12 }}
          />
        </View>
      </Modal>
    );
  }

  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={stylesScanner.modalContainer}>
          <ActivityIndicator size="large" color="#1a73e8" />
          <Text style={stylesScanner.modalText}>Requesting camera permission...</Text>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={stylesScanner.modalContainer}>
          <Icon name="camera-off" type="material-community" size={60} color="#E53935" />
          <Text style={[stylesScanner.modalText, { marginTop: 16, marginBottom: 16 }]}>
            Camera access is required to scan QR codes
          </Text>
          <Button title="Enter Manually" onPress={() => setShowManual(true)} buttonStyle={{ backgroundColor: '#1a73e8' }} />
          <Button title="Cancel" type="outline" onPress={onClose} containerStyle={{ marginTop: 12 }} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={stylesScanner.fullScreen}>
        <CameraView
          style={stylesScanner.camera}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          enableTorch={torchOn}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'pdf417', 'aztec'],
          }}
        >
          <View style={stylesScanner.overlay}>
            <View style={stylesScanner.header}>
              <TouchableOpacity onPress={onClose} style={stylesScanner.closeBtn}>
                <Icon name="close" type="material-community" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={stylesScanner.headerTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setTorchOn(!torchOn)} style={stylesScanner.torchBtn}>
                <Icon name={torchOn ? "flashlight" : "flashlight-off"} type="material-community" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={stylesScanner.scanArea}>
              <View style={stylesScanner.scanFrame} />
              <Text style={stylesScanner.scanText}>Align QR code within frame</Text>
              <TouchableOpacity 
                onPress={() => setShowManual(true)}
                style={stylesScanner.manualEntryBtn}
              >
                <Text style={stylesScanner.manualEntryText}>Enter manually</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}

const stylesScanner = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  closeBtn: { padding: 8 },
  torchBtn: { padding: 8 },
  scanArea: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  manualEntryBtn: {
    marginTop: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
  },
  manualEntryText: { color: '#fff', fontSize: 14 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  modalText: { fontSize: 16, color: '#333', textAlign: 'center', marginTop: 12 },
  manualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 20,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 16,
  },
  manualTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  manualText: { fontSize: 16, color: '#333', marginTop: 40, marginBottom: 16 },
  manualInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
});

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
      Alert.alert('Error', err.message || 'Network error');
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
// Dashboard Screen
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
      <View style={stylesDash.header}>
        <View>
          <Text style={stylesDash.greeting}>Hello, {user?.name || 'User'} 👋</Text>
          <Chip
            title={user?.role || 'Guest'}
            type="outline"
            containerStyle={stylesDash.roleChip}
            titleStyle={{ color: '#fff' }}
          />
        </View>
        <TouchableOpacity onPress={handleLogout} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="logout" type="material-community" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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
  const [scannerVisible, setScannerVisible] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [duplicateData, setDuplicateData] = useState('');

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleScan = async (scannedData) => {
    try {
      const checkRes = await checkDuplicate(scannedData);
      if (checkRes.success && checkRes.is_duplicate && !checkRes.has_exited) {
        setDuplicateData(scannedData);
        setDuplicateAlert(true);
        return;
      }
    } catch (err) {
      console.log('Duplicate check error:', err);
    }
    
    update('scanned_data', scannedData);
    
    try {
      const infoRes = await getVehicleInfo(scannedData);
      if (infoRes.success && infoRes.data) {
        update('vehicle_number', infoRes.data.vehicle_number || '');
        update('make', infoRes.data.make || '');
        update('model', infoRes.data.model || '');
        update('km_reading', infoRes.data.km_reading || '');
        update('mobile_number', infoRes.data.mobile_number || '');
      }
    } catch (err) {
      console.log('Fetch vehicle info error:', err);
    }
  };

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
    { key: 'scanned_data',   placeholder: 'QR / Scanned Data *', icon: 'qrcode',      keyboard: 'default',    caps: 'none',  readonly: true },
    { key: 'vehicle_number', placeholder: 'Vehicle Number *',     icon: 'car',         keyboard: 'default',    caps: 'characters' },
    { key: 'make',           placeholder: 'Make *',               icon: 'factory',     keyboard: 'default',    caps: 'words'      },
    { key: 'model',          placeholder: 'Model *',              icon: 'car-info',    keyboard: 'default',    caps: 'words'      },
    { key: 'km_reading',     placeholder: 'KM Reading *',         icon: 'speedometer', keyboard: 'numeric',    caps: 'none'       },
    { key: 'mobile_number',  placeholder: 'Mobile Number *',      icon: 'phone',       keyboard: 'phone-pad',  caps: 'none'       },
  ];

  return (
    <>
      <ScrollView style={stylesForm.container} contentContainerStyle={{ padding: 16 }}>
        <Card containerStyle={stylesForm.card}>
          <View style={stylesForm.header}>
            <Icon name="login" type="material-community" size={48} color="#1a73e8" />
            <Text style={[stylesForm.cardTitle, { color: '#1a73e8' }]}>Gate In Entry</Text>
          </View>

          <Button
            title="Scan QR Code"
            onPress={() => setScannerVisible(true)}
            buttonStyle={{ backgroundColor: '#1a73e8', borderRadius: 10, marginBottom: 16 }}
            icon={<Icon name="qrcode-scan" type="material-community" size={20} color="#fff" />}
          />

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
              editable={!field.readonly}
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

      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
        title="Scan Gate In QR"
      />

      <Modal visible={duplicateAlert} transparent animationType="fade">
        <View style={stylesForm.modalOverlay}>
          <Card containerStyle={stylesForm.modalCard}>
            <Icon name="alert" type="material-community" size={48} color="#F44336" />
            <Text style={stylesForm.modalTitle}>Vehicle Already Registered</Text>
            <Text style={stylesForm.modalText}>
              Token No: {duplicateData}{'\n'}
              Status: This vehicle is already in the premises and has not exited yet.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              <Button title="Scan Another" onPress={() => setDuplicateAlert(false)} buttonStyle={{ backgroundColor: '#856404' }} />
              <Button title="Close" type="outline" onPress={() => setDuplicateAlert(false)} />
            </View>
          </Card>
        </View>
      </Modal>
    </>
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
  const [scannerVisible, setScannerVisible] = useState(false);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleScan = async (data) => {
    setScannedData(data);
    setLooking(true);
    try {
      const res = await getVehicleInfo(data);
      if (res.success) {
        setVehicleInfo(res.data);
        if (res.data.km_reading) update('km_reading', res.data.km_reading);
        if (res.data.name) update('name', res.data.name);
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
    { key: 'km_reading', placeholder: 'KM Reading *',     icon: 'speedometer',   keyboard: 'numeric'   },
    { key: 'name',       placeholder: 'Customer Name *',  icon: 'account',       keyboard: 'default'   },
    { key: 'contact',    placeholder: 'Contact *',        icon: 'phone',         keyboard: 'phone-pad' },
    { key: 'drop_by',    placeholder: 'Drop By *',        icon: 'account-check', keyboard: 'default'   },
  ];

  return (
    <>
      <ScrollView style={stylesForm.container} contentContainerStyle={{ padding: 16 }}>
        <Card containerStyle={stylesForm.card}>
          <View style={stylesForm.header}>
            <Icon name="logout" type="material-community" size={48} color="#E53935" />
            <Text style={[stylesForm.cardTitle, { color: '#E53935' }]}>Gate Out Entry</Text>
          </View>

          <Button
            title="Scan QR Code"
            onPress={() => setScannerVisible(true)}
            buttonStyle={{ backgroundColor: '#E53935', borderRadius: 10, marginBottom: 16 }}
            icon={<Icon name="qrcode-scan" type="material-community" size={20} color="#fff" />}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Input
              placeholder="Scanned Data *"
              leftIcon={<Icon name="qrcode" type="material-community" size={20} color="#E53935" />}
              value={scannedData}
              editable={false}
              containerStyle={[stylesForm.inputContainer, { flex: 1, marginRight: 8 }]}
            />
            <Button
              title="Fetch"
              onPress={() => scannedData && handleScan(scannedData)}
              loading={looking}
              disabled={looking || !scannedData}
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

      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
        title="Scan Gate Out QR"
      />
    </>
  );
}

const stylesForm = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  card: { borderRadius: 12, padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  inputContainer: { paddingHorizontal: 0, marginBottom: 12 },
  btn: { borderRadius: 10, paddingVertical: 12, marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { borderRadius: 16, padding: 20, alignItems: 'center', width: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 12, textAlign: 'center', color: '#333' },
  modalText: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
});

// ============================================
// Stock Screen
// ============================================
function StockScreen({ navigation }) {
  const LOCATIONS = [
    'Workshop', 'Car Parking', 'Outside Parking', 'Yard A', 'Yard B',
    'Road Test', 'Vehicle Refuel', 'OSL Work',
  ];
  const [location, setLocation] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const needsName = ['Road Test', 'Vehicle Refuel', 'OSL Work'].includes(location);

  const handleScan = (data) => {
    if (scannedItems.includes(data)) {
      Alert.alert('Duplicate Scan', 'This QR code has already been scanned.');
      if (Platform.OS !== 'web' && Vibration) {
        Vibration.vibrate([100, 50, 100]);
      }
      return;
    }
    if (Platform.OS !== 'web' && Vibration) {
      Vibration.vibrate(100);
    }
    setScannedItems(prev => [...prev, data]);
  };

  const removeScan = (index) => {
    setScannedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!scannedItems.length) { Alert.alert('Error', 'Add at least one QR scan'); return; }
    if (!location) { Alert.alert('Error', 'Select a location'); return; }
    if (needsName && !name.trim()) { Alert.alert('Error', 'Please enter your name'); return; }
    
    setLoading(true);
    try {
      const res = await updateStock({ 
        scanned_data_list: scannedItems, 
        location, 
        name: needsName ? name : '' 
      });
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

  const resetStock = () => {
    setLocation('');
    setName('');
    setScannedItems([]);
    setShowForm(false);
  };

  const selectLocation = (loc) => {
    setLocation(loc);
    setShowForm(true);
  };

  if (!showForm) {
    return (
      <ScrollView style={stylesStock.container} contentContainerStyle={{ padding: 16 }}>
        <Card containerStyle={stylesForm.card}>
          <View style={stylesForm.header}>
            <Icon name="package-variant" type="material-community" size={48} color="#FF9800" />
            <Text style={[stylesForm.cardTitle, { color: '#FF9800' }]}>Stock Update</Text>
          </View>
          <Text style={stylesStock.sectionLabel}>Select Location *</Text>
          <View style={stylesStock.locationGrid}>
            {LOCATIONS.map((loc) => (
              <Chip
                key={loc}
                title={loc}
                type="outline"
                onPress={() => selectLocation(loc)}
                containerStyle={{ margin: 3 }}
                buttonStyle={{ borderColor: '#FF9800' }}
                titleStyle={{ color: '#FF9800' }}
              />
            ))}
          </View>
          <Button
            title="Cancel"
            type="outline"
            onPress={() => navigation.goBack()}
            buttonStyle={{ marginTop: 16 }}
          />
        </Card>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView style={stylesStock.container} contentContainerStyle={{ padding: 16 }}>
        <Card containerStyle={stylesForm.card}>
          <View style={stylesForm.header}>
            <Icon name="package-variant" type="material-community" size={48} color="#FF9800" />
            <Text style={[stylesForm.cardTitle, { color: '#FF9800' }]}>Stock Update</Text>
            <Chip title={location} containerStyle={{ marginTop: 8 }} buttonStyle={{ backgroundColor: '#FF9800' }} />
          </View>

          <Text style={stylesStock.sectionLabel}>Scanned QR Codes ({scannedItems.length})</Text>
          {scannedItems.length === 0 ? (
            <Text style={{ color: '#aaa', textAlign: 'center', marginVertical: 12 }}>No scans yet. Tap "Scan QR" to add.</Text>
          ) : (
            <View style={stylesStock.scannedList}>
              {scannedItems.map((item, index) => (
                <View key={index} style={stylesStock.scannedItem}>
                  <View style={stylesStock.scannedItemInfo}>
                    <Text style={stylesStock.scannedItemNumber}>{index + 1}.</Text>
                    <Text style={stylesStock.scannedItemText} numberOfLines={1}>{item}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeScan(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="delete" type="material-community" size={20} color="#E53935" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Button
            title="Scan QR Code"
            onPress={() => setScannerVisible(true)}
            buttonStyle={{ backgroundColor: '#FF9800', borderRadius: 10, marginVertical: 12 }}
            icon={<Icon name="qrcode-scan" type="material-community" size={20} color="#fff" />}
          />

          {needsName && (
            <Input
              placeholder="Your Name *"
              leftIcon={<Icon name="account" type="material-community" size={20} color="#FF9800" />}
              value={name}
              onChangeText={setName}
              containerStyle={stylesForm.inputContainer}
            />
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
            <Button
              title="Back"
              type="outline"
              onPress={resetStock}
              containerStyle={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Submit"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || scannedItems.length === 0}
              buttonStyle={{ backgroundColor: '#FF9800' }}
              containerStyle={{ flex: 1, marginLeft: 8 }}
            />
          </View>
        </Card>
      </ScrollView>

      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScan}
        title="Scan Stock QR"
      />
    </>
  );
}

const stylesStock = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 8 },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  scannedList: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
    maxHeight: 200,
    marginBottom: 12,
  },
  scannedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scannedItemInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  scannedItemNumber: { fontWeight: 'bold', color: '#FF9800', width: 30 },
  scannedItemText: { fontSize: 13, color: '#333', flex: 1 },
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