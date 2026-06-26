import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.edora.app',
  appName: 'Edora',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'app.edora',
    cleartext: false,
    allowNavigation: ['app.edora', '*.supabase.co', 'accounts.google.com', 'appleid.apple.com', 'image.pollinations.ai'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      launchFadeOutDuration: 350,
      backgroundColor: '#060918',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // 'LIGHT' = white icons — correct for the dark deep-space background
      style: 'LIGHT',
      backgroundColor: '#060918',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#5B6AF5',
      sound: 'beep.wav',
    },
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#060918',
  },
};

export default config;
