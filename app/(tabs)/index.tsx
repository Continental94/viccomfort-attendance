import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const API_URL = 'https://script.google.com/macros/s/AKfycbyLpLoBjFDvOCtpqkDG6PfPIccnYQZ7ovSQjtdwfdq19dVfrjBHV9ZzIkO3I7adAFnvcg/exec';

const WORKERS = [
  { id: 'onabanjo', name: 'Onabanjo Oladipupo' },
  { id: 'divine', name: 'Divine Favour' },
];

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
    // The server returned something that isn't JSON (often an HTML error
    // page from Google when the script is overloaded or misconfigured).
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

type TodayRecord = {
  signIn?: { time: string; status: string };
  signOut?: { time: string };
};

export default function HomeScreen() {
  const [selectedWorker, setSelectedWorker] = useState(WORKERS[0]);
  const [statusLine, setStatusLine] = useState('Select your name and tap Sign In or Sign Out.');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<Record<string, TodayRecord>>({});
  const [now, setNow] = useState(new Date());

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
    }
  }, []);

  useEffect(() => {
    refreshTodayLog();
  }, [refreshTodayLog]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTodayLog();
    setRefreshing(false);
  }, [refreshTodayLog]);

  const rec = records[selectedWorker.id];
  const alreadySignedIn = !!(rec && rec.signIn);
  const alreadySignedOut = !!(rec && rec.signOut);

  const handlePunch = async (type: 'in' | 'out') => {
    setLoading(true);
    setStatusLine('Checking your connection...');

    try {
      // 1. Check internet connection
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || netState.isInternetReachable === false) {
        Alert.alert('No Internet Connection', 'Please check your WiFi or mobile data and try again.');
        setStatusLine('No internet connection. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Check that location SERVICES (GPS) are turned on at the OS level
      setStatusLine('Checking location services...');
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(
          'Location Services Off',
          'Please turn on Location/GPS in your phone settings, then try again.'
        );
        setStatusLine('Location services are turned off on this phone.');
        setLoading(false);
        return;
      }

      // 3. Ask for app-level location permission
      setStatusLine('Checking your location permission...');
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to sign in or out.');
        setStatusLine('Location permission denied.');
        setLoading(false);
        return;
      }

      // 4. Get GPS location, with a 15-second timeout
      setStatusLine('Getting your location...');
      let location;
      try {
          location = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          20000,
          'Could not get your location in time. Try moving to an open area and try again.'
        );
      } catch (timeoutErr: any) {
        Alert.alert('Location Timeout', timeoutErr.message);
        setStatusLine(timeoutErr.message);
        setLoading(false);
        return;
      }

      const { latitude, longitude } = location.coords;
      const deviceId = await getDeviceId();

      setStatusLine('Submitting attendance...');

      // 5. Send to backend, with a 25-second timeout for slow cold-starts
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
        Alert.alert('Connection Issue', timeoutErr.message);
        setStatusLine(timeoutErr.message);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        Alert.alert('Not Signed ' + (type === 'in' ? 'In' : 'Out'), res.error);
        setStatusLine(res.error);
      } else {
        Alert.alert('Success', `Signed ${type} at ${res.time} (${res.dist}m from office).`);
        setStatusLine(`Signed ${type} at ${res.time} (${res.dist}m from office).`);
        refreshTodayLog();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      setStatusLine(err.message || 'Something went wrong. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1D3D47" />
      }
    >
      <Text style={styles.title}>Viccomfort Attendance</Text>

      <Text style={styles.clockTime}>{now.toLocaleTimeString('en-GB')}</Text>
      <Text style={styles.clockDate}>
        {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </Text>

      <Text style={styles.label}>Select your name:</Text>
      <View style={styles.workerList}>
        {WORKERS.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[
              styles.workerOption,
              selectedWorker.id === w.id && styles.workerOptionSelected,
            ]}
            onPress={() => setSelectedWorker(w)}
          >
            <Text
              style={[
                styles.workerOptionText,
                selectedWorker.id === w.id && styles.workerOptionTextSelected,
              ]}
            >
              {w.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.status}>{statusLine}</Text>

      <TouchableOpacity
        style={[styles.clockInButton, (loading || alreadySignedIn) && styles.buttonDisabled]}
        onPress={() => handlePunch('in')}
        disabled={loading || alreadySignedIn}
      >
        <Text style={styles.buttonText}>{loading ? 'Please wait...' : 'Sign In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.clockOutButton,
          (loading || alreadySignedOut || !alreadySignedIn) && styles.buttonDisabled,
        ]}
        onPress={() => handlePunch('out')}
        disabled={loading || alreadySignedOut || !alreadySignedIn}
      >
        <Text style={styles.buttonText}>{loading ? 'Please wait...' : 'Sign Out'}</Text>
      </TouchableOpacity>

      <View style={styles.logSection}>
        <Text style={styles.logTitle}>Today's Attendance</Text>
        <Text style={styles.logHint}>Pull down to refresh</Text>
        {WORKERS.map((w) => {
          const r = records[w.id];
          const inTxt = r && r.signIn ? r.signIn.time : '—';
          const outTxt = r && r.signOut ? r.signOut.time : '—';
          let pillText = 'Not signed in';
          if (r && r.signIn) {
            pillText = r.signIn.status === 'late' ? 'Late' : 'On time';
          }
          return (
            <View key={w.id} style={styles.logRow}>
              <View>
                <Text style={styles.logName}>{w.name}</Text>
                <Text style={styles.logTime}>In {inTxt}   ·   Out {outTxt}</Text>
              </View>
              <Text style={styles.logPill}>{pillText}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1D3D47',
  },
  clockTime: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1D3D47',
    marginTop: 16,
    marginBottom: 2,
  },
  clockDate: {
    fontSize: 13,
    color: '#777',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  workerList: {
    width: '100%',
    marginBottom: 20,
  },
  workerOption: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  workerOptionSelected: {
    borderColor: '#1D3D47',
    backgroundColor: '#E6F4FE',
  },
  workerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  workerOptionTextSelected: {
    color: '#1D3D47',
    fontWeight: 'bold',
  },
  status: {
    fontSize: 14,
    marginBottom: 20,
    color: '#555',
    textAlign: 'center',
  },
  clockInButton: {
    backgroundColor: '#1D3D47',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginBottom: 15,
    width: '80%',
    alignItems: 'center',
  },
  clockOutButton: {
    backgroundColor: '#A1CEDC',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  logSection: {
    width: '100%',
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 20,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1D3D47',
    marginBottom: 2,
  },
  logHint: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 12,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  logTime: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  logPill: {
    fontSize: 12,
    color: '#1D3D47',
    fontWeight: 'bold',
  },
});