import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 30_000;

function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

async function execWithTimeout(command: string): Promise<void> {
  await Promise.race([
    execAsync(command),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`EMF command timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);
    }),
  ]);
}

async function generateEmfFromPngWindows(pngPath: string, emfPath: string): Promise<boolean> {
  const scriptPath = path.join(os.tmpdir(), `caseartorg-emf-write-${Date.now()}.ps1`);
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$png = '${pngPath.replace(/'/g, "''")}'`,
    `$emf = '${emfPath.replace(/'/g, "''")}'`,
    '$bmp = [System.Drawing.Bitmap]::FromFile($png)',
    '$fs = New-Object System.IO.FileStream($emf, [System.IO.FileMode]::Create)',
    '$meta = New-Object System.Drawing.Imaging.Metafile($fs, [System.Drawing.Imaging.EmfType]::EmfOnly)',
    '$g = [System.Drawing.Graphics]::FromImage($meta)',
    '$g.Clear([System.Drawing.Color]::White)',
    '$g.DrawImage($bmp, 0, 0)',
    '$g.Dispose()',
    '$meta.Dispose()',
    '$fs.Close()',
    '$bmp.Dispose()',
  ].join('\n');

  try {
    fs.writeFileSync(scriptPath, script, 'utf8');
    await execWithTimeout(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`);
    return fs.existsSync(emfPath);
  } catch (error) {
    console.error(`[EMF] Windows PNG-to-EMF conversion failed for ${path.basename(pngPath)}:`, error);
    return false;
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function generateEmfViaImageMagick(sourcePath: string, emfPath: string): Promise<boolean> {
  for (const command of ['magick', 'convert']) {
    try {
      const escapedSource = shellEscape(sourcePath);
      const escapedOutput = shellEscape(emfPath);
      await execWithTimeout(`${command} '${escapedSource}' '${escapedOutput}'`);
      if (fs.existsSync(emfPath)) {
        return true;
      }
    } catch {
      // Try the next ImageMagick command name.
    }
  }

  return false;
}

/**
 * Creates an EMF companion file from a PNG preview or other raster source.
 */
export async function generateEmfCompanion(
  sourceImagePath: string,
  outputEmfPath: string
): Promise<string | null> {
  if (!fs.existsSync(sourceImagePath)) {
    return null;
  }

  const outputDir = path.dirname(outputEmfPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (process.platform === 'win32') {
    if (await generateEmfFromPngWindows(sourceImagePath, outputEmfPath)) {
      return outputEmfPath;
    }
  }

  if (await generateEmfViaImageMagick(sourceImagePath, outputEmfPath)) {
    return outputEmfPath;
  }

  return null;
}

/** Whether EMF companion generation is expected to succeed on the current platform. */
export function shouldGenerateEmfCompanion(): boolean {
  return process.platform === 'win32';
}
