import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Generates a preview PNG for a given .psd or .ai file.
 * Returns the absolute path of the generated preview file in the temp directory, or null if it fails.
 */
export async function generatePreview(
  filePath: string,
  tempDir: string
): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.psd' && ext !== '.ai') {
    return null;
  }

  const basename = path.basename(filePath);
  
  if (process.platform !== 'darwin') {
    console.log(`[PREVIEW] Skipping preview for "${basename}". Preview rendering is supported on macOS only.`);
    return null;
  }
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Use qlmanage (Quick Look) first as it supports both PSD and AI.
  try {
    // Escape single quotes for shell safety
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const escapedTempDir = tempDir.replace(/'/g, "'\\''");
    
    // Command: qlmanage -t -s 1024 -o <tempDir> <filePath>
    // -t: compute thumbnails
    // -s 1024: size 1024px
    // -o: output directory
    await execAsync(`qlmanage -t -s 1024 -o '${escapedTempDir}' '${escapedPath}'`);
    
    // Read the temp directory to see what qlmanage created.
    // qlmanage typically creates file names like "filename.psd.png" or "filename.ai.png"
    const files = fs.readdirSync(tempDir);
    
    // Find the one that matches our filename prefix and ends in png
    // e.g. logo.ai.png
    const matchingFile = files.find(f => 
      f.toLowerCase().startsWith(basename.toLowerCase()) && 
      f.toLowerCase().endsWith('.png')
    );

    if (matchingFile) {
      return path.join(tempDir, matchingFile);
    }
  } catch (error) {
    console.error(`[PREVIEW] qlmanage failed for ${basename}:`, error);
  }

  // Fallback to sips (Scriptable Image Processing System) specifically for PSDs
  if (ext === '.psd') {
    try {
      console.log(`[PREVIEW] Attempting sips fallback for PSD: ${basename}`);
      const fallbackName = `${path.basename(filePath, ext)}.png`;
      const fallbackPath = path.join(tempDir, fallbackName);
      
      const escapedPath = filePath.replace(/'/g, "'\\''");
      const escapedFallbackPath = fallbackPath.replace(/'/g, "'\\''");
      
      // Command: sips -s format png <filePath> --out <fallbackPath>
      await execAsync(`sips -s format png '${escapedPath}' --out '${escapedFallbackPath}'`);
      
      if (fs.existsSync(fallbackPath)) {
        return fallbackPath;
      }
    } catch (error) {
      console.error(`[PREVIEW] sips fallback failed for PSD: ${basename}:`, error);
    }
  }

  return null;
}
