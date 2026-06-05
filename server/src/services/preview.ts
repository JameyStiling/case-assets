import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { isPreviewable } from './fileTypes';

const execAsync = promisify(exec);
const PREVIEW_COMMAND_TIMEOUT_MS = 30_000;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

async function execWithTimeout(command: string): Promise<void> {
  await Promise.race([
    execAsync(command),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Preview command timed out after ${PREVIEW_COMMAND_TIMEOUT_MS}ms`));
      }, PREVIEW_COMMAND_TIMEOUT_MS);
    }),
  ]);
}

function isValidMetafile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(44);
    fs.readSync(fd, header, 0, 44, 0);
    fs.closeSync(fd);

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.emf') {
      return header.readUInt32LE(0) === 1 && header.readUInt32LE(40) === 0x464d4520;
    }

    if (ext === '.wmf') {
      return header.readUInt16LE(0) === 1 || header.readUInt16LE(0) === 2;
    }
  } catch {
    return false;
  }

  return false;
}

async function tryQlmanage(filePath: string, tempDir: string, basename: string): Promise<string | null> {
  try {
    const escapedPath = shellEscape(filePath);
    const escapedTempDir = shellEscape(tempDir);
    await execWithTimeout(`qlmanage -t -s 1024 -o '${escapedTempDir}' '${escapedPath}'`);

    const files = fs.readdirSync(tempDir);
    const matchingFile = files.find(
      (f) =>
        f.toLowerCase().startsWith(basename.toLowerCase()) &&
        f.toLowerCase().endsWith('.png')
    );

    if (matchingFile) {
      return path.join(tempDir, matchingFile);
    }
  } catch (error) {
    console.error(`[PREVIEW] qlmanage failed for ${basename}:`, error);
  }

  return null;
}

async function trySipsPsd(filePath: string, tempDir: string, basename: string, ext: string): Promise<string | null> {
  try {
    console.log(`[PREVIEW] Attempting sips fallback for PSD: ${basename}`);
    const fallbackName = `${path.basename(filePath, ext)}.png`;
    const fallbackPath = path.join(tempDir, fallbackName);
    const escapedPath = shellEscape(filePath);
    const escapedFallbackPath = shellEscape(fallbackPath);

    await execWithTimeout(`sips -s format png '${escapedPath}' --out '${escapedFallbackPath}'`);

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  } catch (error) {
    console.error(`[PREVIEW] sips fallback failed for PSD: ${basename}:`, error);
  }

  return null;
}

async function tryImageMagick(filePath: string, outputPath: string): Promise<string | null> {
  for (const command of ['magick', 'convert']) {
    try {
      const escapedPath = shellEscape(filePath);
      const escapedOutputPath = shellEscape(outputPath);
      await execWithTimeout(`${command} '${escapedPath}' '${escapedOutputPath}'`);
      if (fs.existsSync(outputPath)) {
        return outputPath;
      }
    } catch {
      // Try the next ImageMagick command name.
    }
  }

  return null;
}

async function generateMetafilePreviewWindows(filePath: string, tempDir: string): Promise<string | null> {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const outputPath = path.join(tempDir, `${basename}.png`);
  const scriptPath = path.join(os.tmpdir(), `caseartorg-emf-${Date.now()}.ps1`);

  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$src = '${filePath.replace(/'/g, "''")}'`,
    `$dest = '${outputPath.replace(/'/g, "''")}'`,
    '$meta = [System.Drawing.Imaging.Metafile]::FromFile($src)',
    '$bmp = New-Object System.Drawing.Bitmap ([int]$meta.Width), ([int]$meta.Height)',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.Clear([System.Drawing.Color]::White)',
    '$g.DrawImage($meta, 0, 0)',
    '$bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)',
    '$g.Dispose()',
    '$bmp.Dispose()',
    '$meta.Dispose()',
  ].join('\n');

  try {
    fs.writeFileSync(scriptPath, script, 'utf8');
    await execWithTimeout(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`);
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }
  } catch (error) {
    console.error(`[PREVIEW] Windows metafile render failed for ${basename}${ext}:`, error);
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }

  return null;
}

async function generateAdobePreviewMac(
  filePath: string,
  tempDir: string,
  ext: string
): Promise<string | null> {
  const basename = path.basename(filePath);
  const preview = await tryQlmanage(filePath, tempDir, basename);
  if (preview) {
    return preview;
  }

  if (ext === '.psd') {
    return trySipsPsd(filePath, tempDir, basename, ext);
  }

  return null;
}

async function generateMetafilePreview(
  filePath: string,
  tempDir: string,
  ext: string
): Promise<string | null> {
  const basename = path.basename(filePath, ext);
  const outputPath = path.join(tempDir, `${basename}.png`);

  if (process.platform === 'win32') {
    const preview = await generateMetafilePreviewWindows(filePath, tempDir);
    if (preview) {
      return preview;
    }
  }

  if (process.platform === 'darwin') {
    const preview = await tryQlmanage(filePath, tempDir, path.basename(filePath));
    if (preview) {
      return preview;
    }
  }

  return tryImageMagick(filePath, outputPath);
}

/**
 * Generates a preview PNG for previewable source files (.psd, .ai, .emf, .wmf).
 * Returns the absolute path of the generated preview file in the temp directory, or null if it fails.
 */
export async function generatePreview(
  filePath: string,
  tempDir: string
): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (!isPreviewable(ext)) {
    return null;
  }

  const basename = path.basename(filePath);
  ensureDir(tempDir);

  if (ext === '.psd' || ext === '.ai') {
    if (process.platform !== 'darwin') {
      console.log(
        `[PREVIEW] Skipping preview for "${basename}". PSD/AI preview rendering is supported on macOS only.`
      );
      return null;
    }

    return generateAdobePreviewMac(filePath, tempDir, ext);
  }

  if (ext === '.emf' || ext === '.wmf') {
    if (!isValidMetafile(filePath)) {
      console.log(`[PREVIEW] Skipping preview for "${basename}" — file is not a valid ${ext} metafile.`);
      return null;
    }

    const preview = await generateMetafilePreview(filePath, tempDir, ext);
    if (!preview) {
      console.log(`[PREVIEW] Could not generate preview for "${basename}". EMF/WMF preview requires Windows or ImageMagick.`);
    }
    return preview;
  }

  return null;
}
