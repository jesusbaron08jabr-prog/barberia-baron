import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.baron.barberia',
  appName: 'Barbería Barón',
  webDir: 'dist',
  backgroundColor: '#09090B',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#09090B',
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
