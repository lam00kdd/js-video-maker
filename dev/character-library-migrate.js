import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';

const storage = new CharacterLibraryStorage();
const output = document.querySelector('#result');
const buttons = [...document.querySelectorAll('button')];
const setBusy = value => buttons.forEach(button => { button.disabled = value; });

async function showStatus() {
  const status = await storage.publishedCatalog?.status();
  if (!status) throw new Error('Trang này cần mở từ server local của app trên 127.0.0.1.');
  output.textContent = `Backend: ${status.database}\nDatabase: ${status.path}\nCharacters: ${status.characters}\nPublished versions: ${status.versions}\nManaged PNG assets: ${status.assets}`;
}

document.querySelector('#status').addEventListener('click', async () => {
  setBusy(true); try { await showStatus(); } catch (error) { output.textContent = error.message; } finally { setBusy(false); }
});

document.querySelector('#export').addEventListener('click', async () => {
  setBusy(true);
  try {
    const bundle = await storage.exportPublishedBundle();
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'character-library-published-backup.json'; link.click(); URL.revokeObjectURL(link.href);
    output.textContent = `Đã tạo backup chỉ gồm dữ liệu Published.\nCharacters: ${bundle.characters.length}\nVersions: ${bundle.versions.length}\nAssets: ${bundle.assets.length}`;
  } catch (error) { output.textContent = `Export lỗi: ${error.message}`; }
  finally { setBusy(false); }
});

document.querySelector('#import').addEventListener('click', async () => {
  setBusy(true);
  try {
    const result = await storage.importPublishedBrowserLibraryToSqlite();
    output.textContent = `Import thành công vào SQLite.\nCharacters: ${result.imported_characters}\nVersions: ${result.imported_versions}\nAssets: ${result.imported_assets}\nDatabase: ${result.status.path}\n\nIndexedDB và các draft trong trình duyệt vẫn được giữ nguyên.`;
  } catch (error) { output.textContent = `Import lỗi: ${error.message}`; }
  finally { setBusy(false); }
});

showStatus().catch(error => { output.textContent = error.message; });
