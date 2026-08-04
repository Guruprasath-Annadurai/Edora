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
      // launchAutoHide was true with a fixed 1800ms duration — the native
      // splash (which has the real logo) hid on that fixed clock regardless
      // of whether the app was actually ready. Cold start awaits network
      // Google Fonts + initStorage() in main.tsx before React even renders;
      // on a slow connection/emulator that routinely exceeds 1800ms, so the
      // splash disappeared mid-boot and the WebView's dark background showed
      // with nothing painted yet — the "blank black screen, no logo" bug.
      // launchAutoHide: false keeps the splash (logo included) up until
      // main.tsx's explicit SplashScreen.hide() call, which only fires after
      // React has actually rendered.
      launchAutoHide: false, // launchShowDuration is ignored when this is false
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
