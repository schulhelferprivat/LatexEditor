import { useEffect, useState } from 'react';
import { Download, MonitorSmartphone } from 'lucide-react';
import { Dialog } from './Dialog';
import {
  currentBrowser,
  insecureChromium,
  isStandalone,
  pendingInstallPrompt,
  supportsFileSystemAccess,
  type InstallPrompt,
} from '../infra/platform';

const installDismissed = 'install-dismissed';
const browserDismissed = 'browser-dismissed';

export function InstallPrompts() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [insecure, setInsecure] = useState(false);
  useEffect(() => {
    const browser = currentBrowser();
    if (!supportsFileSystemAccess(browser) && localStorage.getItem(browserDismissed) !== '1') {
      setInsecure(insecureChromium(browser));
      setBrowserOpen(true);
      return;
    }
    if (isStandalone() || localStorage.getItem(installDismissed) === '1') return;
    const show = () => {
      const available = pendingInstallPrompt();
      if (!available) return;
      setPrompt(available);
      setInstallOpen(true);
    };
    show();
    window.addEventListener('installpromptready', show);
    const onInstalled = () => setInstallOpen(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('installpromptready', show);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  function dismissInstall() {
    localStorage.setItem(installDismissed, '1');
    setInstallOpen(false);
  }
  function install() {
    void prompt?.prompt().catch(() => {});
    setInstallOpen(false);
  }
  function dismissBrowser() {
    localStorage.setItem(browserDismissed, '1');
    setBrowserOpen(false);
  }
  if (browserOpen)
    return (
      <Dialog title="Nicht unterstützter Browser" onCancel={dismissBrowser}>
        <p className="question-message">
          {insecure
            ? 'LatexHelper wird über eine unsichere Verbindung geladen. Zum Öffnen und Speichern von Dateien ist https oder localhost nötig.'
            : 'LatexHelper braucht zum Öffnen und Speichern von Dateien die File System Access API. Die gibt es nur in Chromium-Browsern wie Chrome oder Edge.'}
        </p>
        <p className="muted">
          {insecure
            ? 'Rufe die Seite über https oder localhost auf.'
            : 'Öffne LatexHelper in Google Chrome oder Microsoft Edge. Ohne diese Unterstützung bleiben „Öffnen“ und „Speichern“ wirkungslos.'}
        </p>
        <div className="dialog-footer">
          <button className="button primary" onClick={dismissBrowser}>
            <MonitorSmartphone size={15} /> Verstanden
          </button>
        </div>
      </Dialog>
    );
  if (!installOpen) return null;
  return (
    <Dialog title="LatexHelper als App installieren" onCancel={dismissInstall}>
      <p className="question-message">Installiere den LatexHelper als App.</p>
      <p className="muted">
        Falls der Button unten nicht funktioniert, nutze das Symbol rechts in der Adresszeile.
      </p>
      <div className="dialog-footer">
        <button className="button" onClick={dismissInstall}>
          Später
        </button>
        <button className="button primary" onClick={install}>
          <Download size={15} /> Als App installieren
        </button>
      </div>
    </Dialog>
  );
}
