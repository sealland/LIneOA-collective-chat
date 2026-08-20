const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const configPath = path.join(__dirname, 'config.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 460,
    resizable: false,
    title: 'LINE OA Connect',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

function readConfigServerUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return typeof raw.serverUrl === 'string' ? raw.serverUrl : null;
  } catch {
    return null;
  }
}

function resolveConnectRunner() {
  const distJs = path.join(projectRoot, 'dist', 'scripts', 'lineOaConnect.js');
  if (fs.existsSync(distJs)) {
    return {
      cmd: process.execPath,
      args: [distJs, '--config', configPath],
      label: distJs,
    };
  }

  const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const tsEntry = path.join(projectRoot, 'src', 'scripts', 'lineOaConnect.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(tsEntry)) {
    return {
      cmd: process.execPath,
      args: [tsxCli, tsEntry, '--config', configPath],
      label: tsEntry,
    };
  }

  return null;
}

function playwrightChromiumReady() {
  try {
    const playwrightPath = path.join(projectRoot, 'node_modules', 'playwright');
    if (!fs.existsSync(playwrightPath)) {
      return { ok: false, missing: 'package' };
    }
    const { chromium } = require(playwrightPath);
    const execPath = chromium.executablePath();
    if (!fs.existsSync(execPath)) {
      return { ok: false, missing: 'browser' };
    }
    return { ok: true };
  } catch {
    return { ok: false, missing: 'package' };
  }
}

function preflightConnect() {
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      message:
        'ไม่พบ session-helper\\config.json\nคัดลอกจาก config.json.example แล้วใส่ serverUrl กับ uploadToken',
    };
  }

  const runner = resolveConnectRunner();
  if (!runner) {
    return {
      ok: false,
      message:
        'ยังไม่ได้ติดตั้งโปรแกรมที่โฟลเดอร์โปรเจกต์\nเปิด Command Prompt ที่โฟลเดอร์นี้ แล้วรัน: npm install\nจากนั้น: npm run build',
    };
  }

  const rootNodeModules = path.join(projectRoot, 'node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    return {
      ok: false,
      message:
        'ไม่พบ node_modules ที่โฟลเดอร์โปรเจกต์\nรัน npm install ที่โฟลเดอร์ LINE-Collect-data ก่อน',
    };
  }

  const pw = playwrightChromiumReady();
  if (!pw.ok) {
    if (pw.missing === 'package') {
      return {
        ok: false,
        message:
          'ไม่พบ Playwright\nรัน npm install ที่โฟลเดอร์โปรเจกต์ (ต้องไม่ใช้ --omit=dev)',
      };
    }
    return {
      ok: false,
      message:
        'ยังไม่ได้ติดตั้ง Chromium สำหรับ Playwright\nรันที่โฟลเดอร์โปรเจกต์:\nnpx playwright install chromium',
    };
  }

  return { ok: true, runner };
}

function summarizeFailure(lastProgress, outputLines, exitCode, spawnError) {
  if (spawnError) {
    return spawnError;
  }

  if (
    lastProgress.phase === 'error' &&
    lastProgress.message &&
    lastProgress.message !== 'กำลังเริ่ม…'
  ) {
    return lastProgress.message;
  }

  if (lastProgress.message === 'กำลังเริ่ม…') {
    lastProgress = { phase: 'error', message: '' };
  }

  const useful = outputLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('PROGRESS:'))
    .filter((line) => !line.startsWith('>'))
    .filter((line) => !/^npm run line-oa-connect/.test(line))
    .filter((line) => !/^tsx src\/scripts\/lineOaConnect/.test(line))
    .filter((line) => line !== '========================================')
    .filter((line) => !/^LINE OA Connect$/.test(line))
    .filter((line) => !/^Server:/.test(line))
    .filter((line) => !/^\d+\./.test(line));

  const errLine = [...useful]
    .reverse()
    .find((line) => line.startsWith('✗') || /error|invalid|failed|ENOENT|not found/i.test(line));

  if (errLine) {
    return errLine.replace(/^✗\s*/, '').trim();
  }

  if (useful.length > 0) {
    return useful[useful.length - 1];
  }

  const serverUrl = readConfigServerUrl();
  const serverHint = serverUrl ? `\nServer: ${serverUrl}` : '';

  return (
    `โปรแกรมย่อยจบด้วยรหัส ${exitCode ?? 'unknown'} — ไม่มีรายละเอียดเพิ่ม` +
    serverHint +
    '\n\nตรวจสอบ:\n• รันบน PC ที่มีหน้าจอ (ไม่ใช่ server แบบ headless)\n• ติดตั้ง Node.js + npm install ที่โฟลเดอร์โปรเจกต์\n• config.json ถูกต้อง (serverUrl + uploadToken)'
  );
}

ipcMain.handle('start-connect', (event) => {
  const preflight = preflightConnect();
  if (!preflight.ok) {
    return Promise.resolve({
      ok: false,
      phase: 'error',
      message: preflight.message,
    });
  }

  const { runner } = preflight;

  return new Promise((resolve) => {
    const outputLines = [];
    let lastProgress = { phase: 'login', message: 'กำลังเริ่ม…' };
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      outputLines.push(trimmed);
      if (trimmed.startsWith('PROGRESS:')) {
        try {
          lastProgress = JSON.parse(trimmed.slice('PROGRESS:'.length));
          if (!event.sender.isDestroyed()) {
            event.sender.send('connect-progress', lastProgress);
          }
        } catch {
          /* ignore malformed progress */
        }
      }
    };

    const child = spawn(runner.cmd, runner.args, {
      cwd: projectRoot,
      env: { ...process.env },
      windowsHide: true,
    });

    child.on('error', (err) => {
      finish({
        ok: false,
        phase: 'error',
        message: summarizeFailure(lastProgress, outputLines, null, err.message),
      });
    });

    child.stdout?.on('data', (buf) => {
      String(buf)
        .split(/\r?\n/)
        .forEach(handleLine);
    });

    child.stderr?.on('data', (buf) => {
      String(buf)
        .split(/\r?\n/)
        .forEach(handleLine);
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish({
          ok: true,
          phase: lastProgress.phase,
          message: lastProgress.message || 'เชื่อมต่อ LINE สำเร็จ',
        });
        return;
      }

      finish({
        ok: false,
        phase: lastProgress.phase === 'login' ? 'error' : lastProgress.phase,
        message: summarizeFailure(lastProgress, outputLines, code, null),
      });
    });
  });
});

ipcMain.handle('close-app', () => {
  app.quit();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
