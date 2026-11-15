# Local Character Library database

The local server creates `character-library.sqlite` in this folder on first start. SQLite is the shared source for published Character Library identities, immutable versions, and managed PNG assets. Drafts and session/project data remain in each browser profile's IndexedDB/local storage.

SQLite files and WAL/journal files are ignored by Git. Back up the database file while the server is stopped, or use the Character Library migration page to export a Published JSON backup.
