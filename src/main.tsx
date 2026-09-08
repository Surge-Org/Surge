import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import App from './App';
import './styles/base.css';
import './styles/bits.css';
import './styles/bits-interactive.css';
import './styles/pages.css';

try {
  document.documentElement.dataset.theme = localStorage.getItem('surge-theme') || 'dark';
} catch { /* default theme when storage is unavailable */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
