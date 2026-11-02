import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

function mountClearVoiceApp() {
  const container =
    document.getElementById('hdl-aac-speech-root') || document.getElementById('root');
  if (!container) return;

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountClearVoiceApp);
} else {
  mountClearVoiceApp();
}
