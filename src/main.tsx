import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './ui/App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { useGame } from './state/store.ts';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*
      Outside the app, so a throw anywhere inside it is caught — including
      one in the store's own render path. The run is read from the store at
      the moment of the crash rather than held here, because whatever the
      boundary was holding would be as stale as the component that threw.
    */}
    <ErrorBoundary runAtCrash={() => useGame.getState().game}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
