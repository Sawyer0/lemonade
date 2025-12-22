import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import * as MetaWearables from '../modules/meta-wearables';
import { MetaStreamView } from '../modules/meta-wearables';

export default function ConnectGlassesScreen() {
  const [registrationState, setRegistrationState] = useState<string>('UNKNOWN');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamState, setStreamState] = useState<string>('STOPPED');
  const [deviceId, setDeviceId] = useState<string>('mock-device-id'); // In a real app, this comes from discovery

  useEffect(() => {
    MetaWearables.initialize();
    setRegistrationState(MetaWearables.getRegistrationState());

    const regSub = MetaWearables.addRegistrationChangeListener((event) => {
      setRegistrationState(event.state);
    });

    const streamSub = MetaWearables.addStreamStateChangeListener((event) => {
      setStreamState(event.state);
    });

    return () => {
      regSub.remove();
      streamSub.remove();
    };
  }, []);

  const handleRegister = () => {
    MetaWearables.startRegistration();
  };

  const handleRequestPermissions = async () => {
    try {
      await MetaWearables.requestPermission('CAMERA');
    } catch (e) {
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const handleToggleStream = async () => {
    if (isStreaming) {
      MetaWearables.stopStream();
      setIsStreaming(false);
    } else {
      try {
        await MetaWearables.startStream(deviceId);
        setIsStreaming(true);
      } catch (e) {
        Alert.alert('Error', 'Failed to start stream');
      }
    }
  };

  const handleCapture = async () => {
    try {
      const uri = await MetaWearables.capturePhoto();
      Alert.alert('Success', `Photo captured: ${uri}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Ray-Ban Meta Integration</Text>
      
      <View style={styles.section}>
        <Text style={styles.label}>Registration Status: {registrationState}</Text>
        <TouchableOpacity style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>Start Registration Handshake</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.button} onPress={handleRequestPermissions}>
          <Text style={styles.buttonText}>Request Camera Permissions</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Stream Status: {streamState}</Text>
        <TouchableOpacity 
          style={[styles.button, isStreaming && styles.buttonStop]} 
          onPress={handleToggleStream}
        >
          <Text style={styles.buttonText}>{isStreaming ? 'Stop POV Stream' : 'Start POV Stream'}</Text>
        </TouchableOpacity>
      </View>

      {isStreaming && (
        <View style={styles.previewContainer}>
          <MetaStreamView style={styles.preview} deviceId={deviceId} />
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <Text style={styles.buttonText}>Capture 12MP Still</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    marginTop: 20,
    color: '#333',
  },
  section: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonStop: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  previewContainer: {
    marginTop: 20,
    height: 400,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
  },
  captureButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  }
});
