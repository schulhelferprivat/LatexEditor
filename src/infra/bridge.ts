import type { BuildRequest, BuildResult, Capabilities, SyncLocation } from '../domain/types';
export { bridgeDownloads, currentDownload } from './download';
const api = `${import.meta.env.VITE_BRIDGE_URL ?? ''}/api/v1`;
export const bridgeUnreachable =
  'Bridge nicht erreichbar. Bitte LatexHelper Bridge starten und den Zugriff auf lokale Geräte erlauben.';
export class Bridge {
  private token = '';
  private connecting?: Promise<Capabilities>;
  onReset?: () => void;
  connect(): Promise<Capabilities> {
    if (this.connecting) return this.connecting;
    this.connecting = this.connectOnce().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  private async connectOnce(): Promise<Capabilities> {
    const response = await fetch(`${api}/session`, {
      method: 'POST',
      headers: {
        'X-LatexHelper-Client': '1',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      throw new Error(bridgeUnreachable);
    });
    if (!response.ok) {
      if (response.status === 403)
        throw new Error(
          'Bridge verweigert den Zugriff. Bitte die App über http://localhost:38471/ öffnen und den Zugriff auf lokale Geräte erlauben.',
        );
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(detail || `Bridge: ${response.status}`);
    }
    const data = await response.json();
    if (data.capabilities?.version !== '1')
      throw new Error('App und Bridge benötigen dieselbe API-Version. Bitte gemeinsam aktualisieren.');
    if (this.token && this.token !== data.token) this.onReset?.();
    this.token = data.token;
    return data.capabilities;
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.token) await this.connect();
    const response = await fetch(api + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error((await response.text()) || `Bridge: ${response.status}`);
    return response.json();
  }
  refreshCapabilities() {
    return this.request<Capabilities>('/capabilities/refresh', 'POST');
  }
  setGnuplotDir(dir: string | null) {
    return this.request<Capabilities>('/gnuplot-dir', 'POST', { dir });
  }
  setTexDir(dir: string | null) {
    return this.request<Capabilities>('/tex-dir', 'POST', { dir });
  }
  workspace(previous?: string, files?: { path: string; size: number; hash: string }[]) {
    return this.request<{ id: string; missing?: string[] }>(
      `/workspaces${previous ? `?previous=${encodeURIComponent(previous)}` : ''}`,
      'POST',
      files ? { files } : undefined,
    );
  }
  async upload(id: string, path: string, file: Blob) {
    const response = await fetch(`${api}/workspaces/${id}/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.token}` },
      body: file,
    });
    if (!response.ok) throw new Error(await response.text());
  }
  build(request: BuildRequest) {
    return this.request<{ id: string }>('/builds', 'POST', request);
  }
  status(id: string) {
    return this.request<BuildResult>(`/builds/${id}`);
  }
  cancel(id: string) {
    return this.request(`/builds/${id}/cancel`, 'POST');
  }
  unload(workspaces: string[], job?: string) {
    if (job)
      void fetch(`${api}/builds/${job}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        keepalive: true,
      }).catch(() => {});
    for (const id of workspaces)
      void fetch(`${api}/workspaces/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
        keepalive: true,
      }).catch(() => {});
  }
  release(id: string) {
    return this.request(`/workspaces/${id}`, 'DELETE');
  }
  async pdf(build: string, variant: string) {
    const response = await fetch(`${api}/builds/${build}/pdf/${variant}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await response.text());
    return response.blob();
  }
  sync(build: string, variant: string, location: SyncLocation) {
    return this.request<SyncLocation[]>(`/builds/${build}/sync/${variant}`, 'POST', location);
  }
}
