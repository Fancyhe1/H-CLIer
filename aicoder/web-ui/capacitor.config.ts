import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hclier.app',
  appName: 'H CLIer',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    // 临时：启动时显示调试页面
    // url: 'http://localhost:8080',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#4facfe',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0f0f1a',
  },
};

export default config;
