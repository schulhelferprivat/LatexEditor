import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

document.addEventListener('contextmenu', (event) => event.preventDefault());

createRoot(document.getElementById('root')!).render(<App />);
const isLiveServer =
  ['5500', '5173'].includes(location.port) && ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && import.meta.env.PROD && !isLiveServer) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
