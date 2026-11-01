/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppState, UserSession } from './types/barberia';
import {
  loadLocalState,
  saveLocalState,
  fetchStateFromGoogleSheets,
  pushStateToGoogleSheets,
} from './services/storage';
import { LoginView } from './components/LoginView';
import { AdminDashboard } from './components/AdminDashboard';
import { BarberDashboard } from './components/BarberDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';

const SESSION_KEY = 'barberia_baron_session_v1';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadLocalState());
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Initial cloud state check from Google Sheets if SCRIPT_URL exists
  useEffect(() => {
    if (appState.config.scriptUrl) {
      fetchStateFromGoogleSheets(appState.config.scriptUrl).then((cloudState) => {
        if (cloudState && cloudState.stations && cloudState.stations.length === 4) {
          setAppState((prev) => {
            const merged = { ...prev, ...cloudState };
            saveLocalState(merged);
            return merged;
          });
        }
      });
    }
  }, []);

  const handleLogin = (session: UserSession) => {
    setUserSession(session);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Error saving session:', e);
    }
  };

  const handleLogout = () => {
    setUserSession(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn('Error removing session:', e);
    }
  };

  const handleUpdateState = (newState: AppState, latestVoucher?: any) => {
    setAppState(newState);
    saveLocalState(newState);

    // Push to Google Sheets & Drive in background if scriptUrl is configured
    if (newState.config.scriptUrl) {
      pushStateToGoogleSheets(newState.config.scriptUrl, newState, latestVoucher).then((res) => {
        if (res.success && res.driveUrl) {
          setAppState((current) => {
            const updatedPayments = current.payments.map((p) => {
              if (
                latestVoucher &&
                (p.timestamp === latestVoucher.timestamp ||
                  (latestVoucher.amount === p.amount && latestVoucher.barberName === p.barberName && !p.driveFileUrl))
              ) {
                return { ...p, driveFileUrl: res.driveUrl };
              }
              return p;
            });
            const updated = { ...current, payments: updatedPayments };
            saveLocalState(updated);
            return updated;
          });
        }
      }).catch((err) => {
        console.warn('Fallo al sincronizar en segundo plano con Google Sheets:', err);
      });
    }
  };

  // If no user is logged in, show luxury Login view
  if (!userSession) {
    return (
      <>
        <LoginView appState={appState} onLogin={handleLogin} />
        <OfflineIndicator />
      </>
    );
  }

  // If logged in as Admin / Owner
  if (userSession.role === 'admin') {
    return (
      <>
        <AdminDashboard
          appState={appState}
          onUpdateState={handleUpdateState}
          onLogout={handleLogout}
        />
        <OfflineIndicator />
      </>
    );
  }

  // If logged in as Barber
  const currentStation = appState.stations.find((s) => s.id === userSession.stationId);

  if (!currentStation) {
    // Fallback if station not found
    handleLogout();
    return null;
  }

  return (
    <>
      <BarberDashboard
        station={currentStation}
        appState={appState}
        onUpdateState={handleUpdateState}
        onLogout={handleLogout}
      />
      <OfflineIndicator />
    </>
  );
}
