import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, unlinkSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const logDir = join(root, 'logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, 'run.log');
function log(message) { const line = `[${new Date().toISOString()}] ${message}`; console.log(line); try { appendFileSync(logFile, `${line}\n`, 'utf8'); } catch {} }
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ttsRoot = join(root, '.runtime', 'korvatts');
const ttsPython = join(ttsRoot, 'venv', 'Scripts', 'python.exe');
const ttsWorker = join(ttsRoot, 'korvatts_worker.py');
const ttsAssets = join(ttsRoot, 'assets');
const ttsTemp = join(ttsRoot, 'tmp');
mkdirSync(ttsTemp, { recursive: true });
function runKorva(request) { return new Promise((resolve, reject) => { const requestId = randomUUID(), inputPath = join(ttsTemp, `${requestId}.request`), outputPath = join(ttsTemp, `${requestId}.stdout`), errorPath = join(ttsTemp, `${requestId}.stderr`); let inputFd, outputFd, errorFd; try { writeFileSync(inputPath, `${JSON.stringify(request)}\n`, 'utf8'); inputFd = openSync(inputPath, 'r'); outputFd = openSync(outputPath, 'w'); errorFd = openSync(errorPath, 'w'); const child = spawn(ttsPython, [ttsWorker, '--serve'], { windowsHide: true, stdio: [inputFd, outputFd, errorFd], env: { ...process.env, PYTHONIOENCODING: 'utf-8', KORVATTS_ASSETS_DIR: ttsAssets, VIDEO04A_TEMP_DIR: ttsTemp, HF_HUB_OFFLINE: '1', HF_DATASETS_OFFLINE: '1' } }); closeSync(inputFd); inputFd = null; closeSync(outputFd); outputFd = null; closeSync(errorFd); errorFd = null; child.on('error', error => { cleanup(); reject(error); }); child.on('close', code => { try { const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').trim().split(/\r?\n/)[0] : ''; const stderr = existsSync(errorPath) ? readFileSync(errorPath, 'utf8').trim() : ''; if (code !== 0 && !output) throw new Error((stderr || `KorvaTTS exited ${code}`).slice(-1200)); resolve(JSON.parse(output)); } catch (error) { reject(error); } finally { cleanup(); } }); } catch (error) { if (inputFd !== undefined && inputFd !== null) closeSync(inputFd); if (outputFd !== undefined && outputFd !== null) closeSync(outputFd); if (errorFd !== undefined && errorFd !== null) closeSync(errorFd); cleanup(); reject(error); } function cleanup() { for (const path of [inputPath, outputPath, errorPath]) if (existsSync(path)) { try { unlinkSync(path); } catch {} } } }); }
async function readRequestJson(req, maxBytes = 16 * 1024) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw new Error('Request body too large.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
const korvaVoiceIds = ['bao_kim', 'gia_bao', 'hoang_nam', 'huu_dat', 'khanh_vy', 'ngoc_huyen', 'phuong_linh', 'quang_huy', 'quynh_nhu', 'thanh_phong'];
function normalizeKorvaVoice(value) { const key = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); return korvaVoiceIds.includes(key) ? key : korvaVoiceIds.find(id => key.endsWith(id)) || 'phuong_linh'; }
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/tts/voices' && req.method === 'GET') { runKorva({ id: randomUUID(), op: 'status' }).then(body => { if (!body.ok || body.status !== 'ready') throw new Error(body.error || 'Vietnamese TTS model is unavailable.'); const names = { bao_kim: 'Bảo Kim', gia_bao: 'Gia Bảo', hoang_nam: 'Hoàng Nam', huu_dat: 'Hữu Đạt', khanh_vy: 'Khánh Vy', ngoc_huyen: 'Ngọc Huyền', phuong_linh: 'Phương Linh', quang_huy: 'Quang Huy', quynh_nhu: 'Quỳnh Như', thanh_phong: 'Thanh Phong' }; res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ voices: body.voices.map(id => ({ id, name: names[id] || id })), provider: 'KorvaTTS' })); }).catch(error => { log(`TTS voice listing failed: ${error.message}`); res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: error.message })); }); return; }
  if (pathname === '/api/tts/synthesize' && req.method === 'POST') { (async () => { let outputPath; try { const body = await readRequestJson(req); if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) throw new Error('Lời thoại phải có từ 1 đến 5.000 ký tự.'); const voice = normalizeKorvaVoice(body.voice); const speed = Math.max(0.5, Math.min(2, Number(body.rate) || 1)); const jobId = randomUUID().replaceAll('-', ''); const result = await runKorva({ id: randomUUID(), op: 'synthesize', job_id: jobId, text: body.text, voice, speed, total_steps: 24 }); if (!result.ok) throw new Error(result.error || 'Vietnamese TTS generation failed.'); outputPath = join(ttsTemp, `${jobId}.wav`); const wav = readFileSync(outputPath); res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' }); res.end(wav); } catch (error) { log(`TTS synthesis failed: ${error.message}`); if (!res.headersSent) { res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: error.message })); } } finally { if (outputPath && existsSync(outputPath)) unlinkSync(outputPath); } })(); return; }
  const relative = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
server.on('error', error => { log(`Server error: ${error.stack || error.message}`); process.exitCode = 1; });
process.on('uncaughtException', error => { log(`Uncaught exception: ${error.stack || error.message}`); process.exitCode = 1; });
process.on('unhandledRejection', error => { log(`Unhandled rejection: ${error?.stack || error}`); process.exitCode = 1; });
const port = Number(process.env.LAM_STUDIO_PORT || 4173);
server.listen(port, '127.0.0.1', () => { const path = process.env.LAM_STUDIO_OPEN_PATH || '/'; const url = `http://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}`; log(`LAM AI Motion Studio ready at ${url}`); if (process.env.LAM_STUDIO_OPEN_BROWSER === '1') spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); });
