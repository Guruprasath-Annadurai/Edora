// ═══════════════════════════════════════════════════════════════════════════
// ClassroomCallbackPage — handles Google OAuth2 redirect for Classroom
// URL: /auth/classroom/callback?code=...&state=...
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { useTeacher } from '@/hooks/useTeacher';

export default function ClassroomCallbackPage() {
  const navigate = useNavigate();
  const { completeOAuth } = useTeacher();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Connecting your Google Classroom…');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    const errParam = params.get('error');

    // On native the Chrome Custom Tab is already closed by App.tsx deep-link handler,
    // but call close() defensively in case this page is opened another way.
    if (Capacitor.isNativePlatform()) Browser.close().catch(() => {});

    if (errParam) {
      setStatus('error');
      setMessage(errParam === 'access_denied'
        ? 'You cancelled the Google sign-in. Please try again.'
        : `Google returned an error: ${errParam}`);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code. Please try connecting again.');
      return;
    }

    completeOAuth(code, state)
      .then(googleEmail => {
        setEmail(googleEmail ?? '');
        setStatus('success');
        setMessage('Google Classroom connected successfully!');
        // Redirect to teacher dashboard after short delay
        setTimeout(() => navigate('/teacher', { replace: true }), 2000);
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message ?? 'Failed to connect. Please try again.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight:      '100dvh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '24px',
        background: 'linear-gradient(180deg, #0A0F25 0%, #080C1A 100%)',
      }}
    >
      <div
        style={{
          background:   'rgba(15,20,45,0.85)',
          borderRadius: '20px',
          padding:      '40px 32px',
          textAlign:    'center',
          maxWidth:     '380px',
          width:        '100%',
          boxShadow:    '0 25px 50px rgba(0,0,0,0.5)',
          border:       '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Icon */}
        <div style={{ marginBottom: '20px' }}>
          {status === 'processing' && (
            <Loader2
              size={52}
              style={{ color: '#5B6AF5', animation: 'spin 1s linear infinite', margin: '0 auto' }}
            />
          )}
          {status === 'success' && (
            <CheckCircle2 size={52} style={{ color: '#34D399', margin: '0 auto' }} />
          )}
          {status === 'error' && (
            <AlertCircle size={52} style={{ color: '#F87171', margin: '0 auto' }} />
          )}
        </div>

        {/* Logo */}
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '12px', fontWeight: 600 }}>
          EDORA × GOOGLE CLASSROOM
        </div>

        {/* Status */}
        <h2
          style={{
            fontSize:     '20px',
            fontWeight:   '800',
            color:        'white',
            marginBottom: '8px',
          }}
        >
          {status === 'processing' && 'Connecting…'}
          {status === 'success'    && 'Connected!'}
          {status === 'error'      && 'Connection Failed'}
        </h2>

        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          {message}
        </p>

        {status === 'success' && email && (
          <div
            style={{
              marginTop:    '16px',
              background:   'rgba(16,185,129,0.12)',
              border:       '1px solid rgba(16,185,129,0.3)',
              borderRadius: '10px',
              padding:      '10px 16px',
              fontSize:     '13px',
              color:        '#34D399',
              fontWeight:   600,
            }}
          >
            {email}
          </div>
        )}

        {status === 'success' && (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px' }}>
            Redirecting to Teacher Dashboard…
          </p>
        )}

        {status === 'error' && (
          <button
            onClick={() => navigate('/teacher')}
            style={{
              marginTop:    '20px',
              background:   'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
              color:        '#fff',
              border:       'none',
              borderRadius: '12px',
              padding:      '12px 28px',
              fontSize:     '14px',
              fontWeight:   700,
              cursor:       'pointer',
              width:        '100%',
            }}
          >
            Back to Dashboard
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
