import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const API_URL = 'https://script.google.com/macros/s/AKfycbyLpLoBjFDvOCtpqkDG6PfPIccnYQZ7ovSQjtdwfdq19dVfrjBHV9ZzIkO3I7adAFnvcg/exec';

const WORKERS = [
  { id: 'onabanjo', name: 'Onabanjo Oladipupo' },
  { id: 'divine', name: 'Divine Favour' },
];

const COLORS = {
  navy: '#0B1440',
  blue: '#2C4BFF',
  bg: '#F5F7FB',
  white: '#FFFFFF',
  green: '#16A34A',
  greenBg: '#DCFCE7',
  amber: '#F59E0B',
  amberBg: '#FEF3C7',
  red: '#E11D48',
  redBg: '#FFE4E8',
  textMuted: '#6B7280',
  border: '#E7EAF0',
};

async function getDeviceId() {
  let id = await AsyncStorage.getItem('vc_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + Date.now();
    await AsyncStorage.setItem('vc_device_id', id);
  }
  return id;
}

async function apiCall(params: Record<string, string>) {
  const url = new URL(API_URL);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('The server is temporarily busy. Please wait a moment and try again.');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getGreeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type TodayRecord = {
  signIn?: { time: string; status: string };
  signOut?: { time: string };
};

// A button that gently scales down on press for a more tactile feel
function PressableScale({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={handlePress} disabled={disabled}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [selectedWorker, setSelectedWorker] = useState(WORKERS[0]);
  const [statusLine, setStatusLine] = useState('Select your name and tap Sign In or Sign Out.');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<Record<string, TodayRecord>>({});
  const [now, setNow] = useState(new Date());
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Fade+slide animation for the whole screen on first load
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  // Separate fade just for the status card, so it pulses gently whenever the message changes
  const statusFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshTodayLog = useCallback(async () => {
    try {
      const res = await apiCall({ action: 'getTodayRecords' });
      setRecords(res || {});
    } catch (err) {
      console.log('Could not load today records', err);
    } finally {
      setInitialLoadDone(true);
    }
  }, []);

  useEffect(() => {
    refreshTodayLog();
  }, [refreshTodayLog]);

  // Once fonts + first data fetch are both ready, fade the screen in
  useEffect(() => {
    if (fontsLoaded && initialLoadDone) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start();
    }
  }, [fontsLoaded, initialLoadDone]);

  // Pulse the status card whenever the status text changes
  useEffect(() => {
    statusFade.setValue(0.3);
    Animated.timing(statusFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [statusLine]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTodayLog();
    setRefreshing(false);
  }, [refreshTodayLog]);

  const rec = records[selectedWorker.id];
  const alreadySignedIn = !!(rec && rec.signIn);
  const alreadySignedOut = !!(rec && rec.signOut);

  let cardColor = COLORS.textMuted;
  let cardIcon: any = 'time-outline';
  if (rec && rec.signIn && rec.signOut) {
    cardColor = COLORS.green;
    cardIcon = 'checkmark-done-circle';
  } else if (rec && rec.signIn) {
    cardColor = rec.signIn.status === 'late' ? COLORS.amber : COLORS.green;
    cardIcon = rec.signIn.status === 'late' ? 'alert-circle' : 'checkmark-circle';
  } else if (
    statusLine.toLowerCase().includes('denied') ||
    statusLine.toLowerCase().includes('error') ||
    statusLine.toLowerCase().includes('busy') ||
    statusLine.toLowerCase().includes('off') ||
    statusLine.toLowerCase().includes('m from')
  ) {
    cardColor = COLORS.red;
    cardIcon = 'close-circle';
  }

  const handlePunch = async (type: 'in' | 'out') => {
    setLoading(true);
    setStatusLine('Checking your connection...');

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || netState.isInternetReachable === false) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('No Internet Connection', 'Please check your WiFi or mobile data and try again.');
        setStatusLine('No internet connection. Please try again.');
        setLoading(false);
        return;
      }

      setStatusLine('Checking location services...');
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Location Services Off', 'Please turn on Location/GPS in your phone settings, then try again.');
        setStatusLine('Location services are turned off on this phone.');
        setLoading(false);
        return;
      }

      setStatusLine('Checking your location permission...');
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Permission Denied', 'Location access is required to sign in or out.');
        setStatusLine('Location permission denied.');
        setLoading(false);
        return;
      }

      setStatusLine('Getting your location...');
      let location;
      try {
        location = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          20000,
          'Could not get your location in time. Try moving to an open area and try again.'
        );
      } catch (timeoutErr: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Location Timeout', timeoutErr.message);
        setStatusLine(timeoutErr.message);
        setLoading(false);
        return;
      }

      const { latitude, longitude } = location.coords;
      const deviceId = await getDeviceId();

      setStatusLine('Submitting attendance...');

      let res;
      try {
        res = await withTimeout(
          apiCall({
            action: 'punch',
            workerId: selectedWorker.id,
            workerName: selectedWorker.name,
            type,
            lat: String(latitude),
            lng: String(longitude),
            deviceId,
          }),
          25000,
          'The server took too long to respond. Please check your connection and try again.'
        );
      } catch (timeoutErr: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Connection Issue', timeoutErr.message);
        setStatusLine(timeoutErr.message);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Not Signed ' + (type === 'in' ? 'In' : 'Out'), res.error);
        setStatusLine(res.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', `Signed ${type} at ${res.time} (${res.dist}m from office).`);
        setStatusLine(`Signed ${type} at ${res.time} (${res.dist}m from office).`);
        refreshTodayLog();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message || 'Something went wrong.');
      setStatusLine(err.message || 'Something went wrong. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Branded loading screen while fonts + first data fetch are in progress
  if (!fontsLoaded || !initialLoadDone) {
    return (
      <View style={styles.loadingScreen}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <LinearGradient colors={[COLORS.navy, COLORS.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <Image
            source={require('@/assets/images/android-icon-foreground.png')}
            style={styles.watermark}
            resizeMode="contain"
          />
          <Text style={styles.greeting}>{getGreeting(now.getHours())}</Text>
          <Text style={styles.clock}>{now.toLocaleTimeString('en-GB')}</Text>
          <Text style={styles.dateText}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </LinearGradient>
      </Animated.View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.navy} />}
      >
        <Text style={styles.sectionLabel}>Who's signing in?</Text>
        <View style={styles.segmentWrap}>
          {WORKERS.map((w) => {
            const active = selectedWorker.id === w.id;
            return (
              <TouchableOpacity
                key={w.id}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedWorker(w);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                  {w.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Animated.View style={[styles.statusCard, { borderLeftColor: cardColor, opacity: statusFade }]}>
          <Ionicons name={cardIcon} size={26} color={cardColor} style={{ marginRight: 12 }} />
          <Text style={styles.statusText}>{statusLine}</Text>
        </Animated.View>

        <PressableScale
          onPress={() => handlePunch('in')}
          disabled={loading || alreadySignedIn}
          style={[styles.primaryButton, (loading || alreadySignedIn) && styles.buttonDisabled]}
        >
          <Ionicons name="log-in-outline" size={20} color={COLORS.white} />
          <Text style={styles.primaryButtonText}>{loading ? 'Please wait...' : 'Sign In'}</Text>
        </PressableScale>

        <PressableScale
          onPress={() => handlePunch('out')}
          disabled={loading || alreadySignedOut || !alreadySignedIn}
          style={[
            styles.secondaryButton,
            (loading || alreadySignedOut || !alreadySignedIn) && styles.buttonDisabled,
          ]}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.navy} />
          <Text style={styles.secondaryButtonText}>{loading ? 'Please wait...' : 'Sign Out'}</Text>
        </PressableScale>

        <View style={styles.logCard}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.logTitle}>Today's Attendance</Text>
            <Text style={styles.logHint}>Pull to refresh</Text>
          </View>

          {WORKERS.map((w) => {
            const r = records[w.id];
            const inTxt = r && r.signIn ? r.signIn.time : '—';
            const outTxt = r && r.signOut ? r.signOut.time : '—';
            let pillText = 'Not signed in';
            let pillColor = COLORS.red;
            let pillBg = COLORS.redBg;
            if (r && r.signIn) {
              if (r.signIn.status === 'late') {
                pillText = 'Late';
                pillColor = COLORS.amber;
                pillBg = COLORS.amberBg;
              } else {
                pillText = 'On time';
                pillColor = COLORS.green;
                pillBg = COLORS.greenBg;
              }
            }
            const firstName = w.name.split(' ')[0];
            return (
              <View key={w.id} style={styles.logRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(w.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logName} numberOfLines={1}>{firstName}</Text>
                  <Text style={styles.logTime}>In {inTxt}   ·   Out {outTxt}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: pillBg }]}>
                  <Text style={[styles.pillText, { color: pillColor }]}>{pillText}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 100,
    height: 100,
    borderRadius: 24,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -30,
    top: 10,
    width: 220,
    height: 220,
    opacity: 0.1,
    tintColor: '#FFFFFF',
  },
  greeting: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 6,
  },
  clock: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 42,
    color: COLORS.white,
    letterSpacing: 1,
  },
  dateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 10,
    marginTop: 8,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 999,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.navy,
  },
  segmentText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: COLORS.navy,
  },
  segmentTextActive: {
    color: COLORS.white,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    shadowColor: '#0B1440',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.navy,
    flex: 1,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: COLORS.navy,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: COLORS.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: COLORS.navy,
  },
  secondaryButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: COLORS.navy,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  logCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0B1440',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  logTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: COLORS.navy,
  },
  logHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8ECFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.navy,
  },
  logName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#222',
  },
  logTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});