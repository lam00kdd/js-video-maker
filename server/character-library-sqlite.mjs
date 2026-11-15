import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ID = /^char_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const ASSET = /^libsha256_([a-f0-9]{64})$/;
const CHECKSUM = /^[a-f0-9]{64}$/;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const imageAssetIds = record => record.character_type === 'sprite'
  ? record.asset_refs || []
  : [...new Set((record.manifest?.parts || []).filter(part => part.type === 'image').map(part => part.asset_id))];

export class PublishedCharacterSqliteStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS characters (
        character_id TEXT PRIMARY KEY,
        character_type TEXT NOT NULL CHECK(character_type IN ('sprite','rigged')),
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS versions (
        character_id TEXT NOT NULL,
        version TEXT NOT NULL,
        character_type TEXT NOT NULL CHECK(character_type IN ('sprite','rigged')),
        content_checksum TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY(character_id, version),
        FOREIGN KEY(character_id) REFERENCES characters(character_id)
      );
      CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        mime_type TEXT NOT NULL CHECK(mime_type='image/png'),
        byte_length INTEGER NOT NULL,
        data BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS version_assets (
        character_id TEXT NOT NULL,
        version TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        PRIMARY KEY(character_id, version, asset_id),
        FOREIGN KEY(character_id, version) REFERENCES versions(character_id, version),
        FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
      );
      CREATE INDEX IF NOT EXISTS versions_by_type ON versions(character_type, character_id);
    `);
    this.insertCharacter = this.db.prepare('INSERT INTO characters(character_id,character_type,payload_json) VALUES(?,?,?) ON CONFLICT(character_id) DO UPDATE SET payload_json=excluded.payload_json');
    this.insertVersion = this.db.prepare('INSERT INTO versions(character_id,version,character_type,content_checksum,payload_json) VALUES(?,?,?,?,?)');
    this.insertAsset = this.db.prepare('INSERT INTO assets(asset_id,sha256,mime_type,byte_length,data) VALUES(?,?,?,?,?) ON CONFLICT(asset_id) DO NOTHING');
    this.insertVersionAsset = this.db.prepare('INSERT INTO version_assets(character_id,version,asset_id) VALUES(?,?,?)');
  }

  status() {
    return {
      ok: true,
      database: 'SQLite',
      path: this.path,
      characters: this.db.prepare('SELECT COUNT(*) AS count FROM characters').get().count,
      versions: this.db.prepare('SELECT COUNT(*) AS count FROM versions').get().count,
      assets: this.db.prepare('SELECT COUNT(*) AS count FROM assets').get().count,
    };
  }

  listCharacters() {
    return this.db.prepare(`SELECT c.payload_json,
      (SELECT json_group_array(version) FROM (SELECT version FROM versions v WHERE v.character_id=c.character_id ORDER BY version)) AS versions_json
      FROM characters c ORDER BY c.character_id`).all().map(row => {
      const item = JSON.parse(row.payload_json);
      item.published_versions = JSON.parse(row.versions_json || '[]');
      return item;
    });
  }

  listVersions() {
    return this.db.prepare(`SELECT c.payload_json AS identity_json, v.payload_json AS version_json
      FROM versions v JOIN characters c USING(character_id)
      ORDER BY c.character_id, v.version`).all().map(row => ({ identity: JSON.parse(row.identity_json), version: JSON.parse(row.version_json) }));
  }

  listSpriteVersions() {
    return this.listVersions().filter(({ version }) => version.character_type === 'sprite').map(({ identity, version }) => {
      const snapshot = version.sprite_snapshot;
      return {
        character_id: version.character_id, character_type: 'sprite', version: version.version,
        content_checksum: version.content_checksum, display_name: snapshot.display_name || identity.display_name,
        role: snapshot.role, master_revision: snapshot.master?.revision, published_at: version.published_at,
        poses: (snapshot.poses || []).map(pose => ({ pose_id: pose.pose_id, label: pose.label, asset_id: pose.asset_id })),
        clips: (snapshot.clips || []).map(clip => ({ clip_id: clip.clip_id, label: clip.label, fps: clip.fps, frame_count: clip.frame_count })),
      };
    });
  }

  getVersion(characterId, version) {
    const row = this.db.prepare('SELECT payload_json FROM versions WHERE character_id=? AND version=?').get(characterId, version);
    if (!row) return null;
    const record = JSON.parse(row.payload_json), hashes = new Map();
    for (const assetId of record.asset_refs || []) {
      const asset = this.getAsset(assetId);
      if (!asset) throw new Error(`Published version asset ${assetId} is missing from SQLite.`);
      hashes.set(assetId, asset.sha256);
    }
    const assetList = (record.asset_refs || []).map(asset_id => ({ asset_id, sha256: hashes.get(asset_id) })).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
    const source = record.character_type === 'sprite'
      ? { sprite_snapshot: record.sprite_snapshot, assets: assetList }
      : { character_id: record.character_id, version: record.version, manifest: record.manifest, rig: record.rig, assets: (record.manifest?.parts || []).filter(part => part.type === 'image').map(part => ({ asset_id: part.asset_id, sha256: hashes.get(part.asset_id) })).sort((a, b) => a.asset_id.localeCompare(b.asset_id)) };
    if (sha256(Buffer.from(stable(source))) !== record.content_checksum) throw new Error(`Published version ${characterId}@${version} failed SQLite checksum verification.`);
    if (record.character_type === 'rigged' && sha256(Buffer.from(stable(record.manifest))) !== record.manifest_ref?.checksum) throw new Error(`Published manifest ${characterId}@${version} failed SQLite checksum verification.`);
    return record;
  }

  getAsset(assetId) {
    const row = this.db.prepare('SELECT sha256,mime_type,byte_length,data FROM assets WHERE asset_id=?').get(assetId) || null;
    if (!row) return null;
    const bytes = Buffer.from(row.data);
    if (row.mime_type !== 'image/png' || row.byte_length !== bytes.length || !PNG.equals(bytes.subarray(0, 8)) || sha256(bytes) !== row.sha256 || assetId !== `libsha256_${row.sha256}`) throw new Error(`SQLite asset ${assetId} failed PNG or SHA-256 integrity verification.`);
    return { ...row, data: bytes };
  }

  importBundle(bundle) {
    if (!bundle || bundle.schema_version !== 1 || !Array.isArray(bundle.characters) || !Array.isArray(bundle.versions) || bundle.characters.length > 10000 || bundle.versions.length > 50000) throw new Error('Import bundle schema or record count is invalid.');
    const characters = new Map();
    for (const source of bundle.characters) {
      if (!ID.test(String(source?.character_id || '')) || !['sprite', 'rigged'].includes(source?.character_type) || !String(source?.display_name || '').trim()) throw new Error('Imported Character identity is invalid.');
      const safe = { character_id: source.character_id, character_type: source.character_type, display_name: String(source.display_name).slice(0, 120), description: String(source.description || '').slice(0, 2000), created_at: source.created_at || null, updated_at: source.updated_at || null, source_metadata: source.source_metadata || {} };
      characters.set(safe.character_id, safe);
    }
    const assets = new Map();
    for (const item of bundle.assets || []) {
      const match = ASSET.exec(String(item?.asset_id || ''));
      if (!match || item.mime_type !== 'image/png' || typeof item.data_base64 !== 'string') throw new Error('Imported PNG asset metadata is invalid.');
      const data = Buffer.from(item.data_base64, 'base64'), digest = sha256(data);
      if (!data.length || !PNG.equals(data.subarray(0, 8)) || digest !== match[1] || digest !== item.sha256 || data.length !== Number(item.size)) throw new Error(`Imported asset ${item.asset_id} failed PNG, size, or SHA-256 validation.`);
      assets.set(item.asset_id, { asset_id: item.asset_id, sha256: digest, mime_type: 'image/png', data });
    }
    const versions = bundle.versions.map(entry => {
      const identity = characters.get(entry?.identity?.character_id);
      if (!identity || !entry.version || entry.version.character_id !== identity.character_id || !VERSION.test(String(entry.version.version || ''))) throw new Error('Imported Published Version identity or SemVer is invalid.');
      const record = structuredClone(entry.version);
      record.character_type = identity.character_type;
      if (!CHECKSUM.test(String(record.content_checksum || '')) || record.validation_status !== 'validated') throw new Error(`Published version ${identity.character_id}@${record.version} is not validated.`);
      const refs = [...new Set(imageAssetIds(record))];
      if (refs.some(assetId => !assets.has(assetId))) throw new Error(`Published version ${identity.character_id}@${record.version} is missing one or more PNG assets.`);
      const checksumAssets = refs.map(asset_id => ({ asset_id, sha256: assets.get(asset_id).sha256 })).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
      const payload = record.character_type === 'sprite'
        ? { sprite_snapshot: record.sprite_snapshot, assets: checksumAssets }
        : { character_id: record.character_id, version: record.version, manifest: record.manifest, rig: record.rig, assets: (record.manifest?.parts || []).filter(part => part.type === 'image').map(part => ({ asset_id: part.asset_id, sha256: assets.get(part.asset_id)?.sha256 })).sort((a, b) => a.asset_id.localeCompare(b.asset_id)) };
      if (sha256(Buffer.from(stable(payload))) !== record.content_checksum) throw new Error(`Published version ${identity.character_id}@${record.version} failed content checksum verification.`);
      delete record.assets; delete record.diagnostics;
      return { identity, record, refs };
    });

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [assetId, asset] of assets) {
        const prior = this.getAsset(assetId);
        if (prior && (prior.sha256 !== asset.sha256 || prior.byte_length !== asset.data.length)) throw new Error(`Immutable asset conflict for ${assetId}.`);
        this.insertAsset.run(assetId, asset.sha256, asset.mime_type, asset.data.length, asset.data);
      }
      for (const { identity, record, refs } of versions) {
        const existingCharacter = this.db.prepare('SELECT character_type FROM characters WHERE character_id=?').get(identity.character_id);
        if (existingCharacter && existingCharacter.character_type !== identity.character_type) throw new Error(`Character type conflict for ${identity.character_id}.`);
        const existingVersion = this.getVersion(identity.character_id, record.version);
        if (existingVersion && existingVersion.content_checksum !== record.content_checksum) throw new Error(`Immutable Published Version conflict for ${identity.character_id}@${record.version}.`);
        this.insertCharacter.run(identity.character_id, identity.character_type, JSON.stringify(identity));
        if (!existingVersion) {
          this.insertVersion.run(identity.character_id, record.version, identity.character_type, record.content_checksum, JSON.stringify(record));
          for (const assetId of refs) this.insertVersionAsset.run(identity.character_id, record.version, assetId);
        }
      }
      this.db.exec('COMMIT');
      return { imported_characters: new Set(versions.map(item => item.identity.character_id)).size, imported_versions: versions.length, imported_assets: assets.size, status: this.status() };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close() { this.db.close(); }
}
