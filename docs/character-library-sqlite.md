# Shared Published Character Library

## Storage ownership

- `data/character-library.sqlite` is the app-wide source of truth for published Character identities, immutable published versions, and their managed PNG assets.
- Browser IndexedDB continues to hold each browser profile's editable drafts and imported working files. Project/session data stays in the existing browser storage.
- Character Studio writes a draft locally. Publishing first uses the existing validation and immutable-version workflow, then syncs the verified Published Version and its PNGs into SQLite. A sync error is reported with a migration-tool retry path.
- Prompt Builder, Video Studio and the render resolvers read the SQLite catalog through the same-origin local API. A browser profile does not need its own copy of Published assets after migration.

The server binds to loopback (`127.0.0.1`). This shares published characters among browsers/profiles using this app on this computer. It does not make the catalog available to remote computers.

## First import from Chrome

1. Start the app with `run.bat` using Node.js 22.13 or newer.
2. In the Chrome profile that currently contains the Published Character Library, open `http://127.0.0.1:4173/dev/character-library-migrate.html`.
3. Check that the page reports `data/character-library.sqlite`, then select **Import Published from this browser's IndexedDB into SQLite**.
4. Review the imported identity/version/asset counts. The source IndexedDB is left intact.
5. Other browser profiles can now read the shared Published catalog when they open this same local app server.

The page can also download a JSON backup. The importer copies only identities with Published Versions, immutable versions, and referenced PNG assets. It never copies Character Drafts or project/session data. Reimport is idempotent for matching immutable version checksums and rejects conflicting versions or corrupt assets.

## API

- `GET /api/character-library/status`
- `GET /api/character-library/characters`
- `GET /api/character-library/versions`
- `GET /api/character-library/sprite-versions`
- `GET /api/character-library/characters/:id/versions/:version`
- `GET /api/character-library/assets/:assetId`
- `POST /api/character-library/import`

The import API is loopback-only through the app server and accepts a versioned JSON bundle. It validates PNG signatures, byte sizes, content-addressed IDs, SHA-256 hashes, immutable version checksums and all required asset references before committing one SQLite transaction.

## Recovery

Stop the app server before copying the SQLite database file directly. For a portable Published Library backup, use the migration page's JSON export. SQLite database and WAL files are ignored by Git and remain in the app's `data/` directory.
