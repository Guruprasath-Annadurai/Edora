import './styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import App from './App';

async function bootstrap() {
  // Wait for fonts before mounting so reviewers never see FOUC
  if (document.fonts) await document.fonts.ready;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  if (Capacitor.isNativePlatform()) {
    // Hide splash only after React has painted the first frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        SplashScreen.hide({ fadeOutDuration: 500 });
      });
    });
  }
}

bootstrap();
