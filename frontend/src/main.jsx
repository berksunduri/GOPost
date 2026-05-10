import React from 'react';
import './App.css';
import App from './App';
import { createRoot } from 'react-dom/client';

export function render() {
  return <App />;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
