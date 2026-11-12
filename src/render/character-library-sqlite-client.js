const loopbackHost = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

export class CharacterLibrarySqliteClient {
  constructor({ baseUrl = null, fetchImpl = null } = {}) {
    const location = globalThis.location;
    this.baseUrl = baseUrl || (location && ['http:', 'https:'].includes(location.protocol) && loopbackHost(location.hostname) ? location.origin : null);
    // Native window.fetch requires its owning Window as the receiver.
    this.fetch = (fetchImpl || globalThis.fetch)?.bind(globalThis);
  }

  get enabled() { return Boolean(this.baseUrl && this.fetch); }

  async request(path, options = {}) {
    if (!this.enabled) throw new Error('The local SQLite Character Library backend is unavailable from this app origin.');
    let response;
    try { response = await this.fetch(`${this.baseUrl}${path}`, { cache: 'no-store', ...options }); }
    catch (error) { throw new Error(`Could not reach the local SQLite Character Library: ${error.message || String(error)}`); }
    if (!response.ok) {
      let message = `Local SQLite request failed (${response.status}).`;
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    return response;
  }

  async status() { return this.request('/api/character-library/status').then(response => response.json()); }
  async listCharacters() { return this.request('/api/character-library/characters').then(response => response.json()).then(data => data.characters); }
  async listVersions() { return this.request('/api/character-library/versions').then(response => response.json()).then(data => data.versions); }
  async listSpriteVersions() { return this.request('/api/character-library/sprite-versions').then(response => response.json()).then(data => data.versions); }

  async getVersion(characterId, versionId) {
    let response;
    try { response = await this.request(`/api/character-library/characters/${encodeURIComponent(characterId)}/versions/${encodeURIComponent(versionId)}`); }
    catch (error) { if (/was not found in local SQLite/.test(error.message)) return null; throw error; }
    const { version } = await response.json();
    const assets = new Map();
    for (const assetId of version.asset_refs || []) {
      const assetResponse = await this.request(`/api/character-library/assets/${encodeURIComponent(assetId)}`);
      assets.set(assetId, await assetResponse.blob());
    }
    return { ...version, assets, diagnostics: [] };
  }

  async getAsset(assetId) {
    try { return await this.request(`/api/character-library/assets/${encodeURIComponent(assetId)}`).then(response => response.blob()); }
    catch (error) { if (/was not found in local SQLite/.test(error.message)) return null; throw error; }
  }

  async importBundle(bundle) {
    return this.request('/api/character-library/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bundle) }).then(response => response.json());
  }
}
