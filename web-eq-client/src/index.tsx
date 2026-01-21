import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.scss';
import "./i18n";
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  direction: 'ltr',
});

const renderApp = async () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
};

renderApp();
