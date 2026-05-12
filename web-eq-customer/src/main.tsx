import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.scss';

const renderApp = async () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
  );
};

renderApp();
