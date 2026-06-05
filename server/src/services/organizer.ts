import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import AdmZip from 'adm-zip';
import { generatePreview } from './preview';
import { classifyImage } from './classifier';

export interface CaseFolder {
  path: string;
  name: string;
  artFolderPath: string;
  fileCount: number;
  fileTypes: Record<string, number>;
  totalSizeMb: number;
}

export interface OrganizeProgress {
  log: string;
  progress: number;
  completed: boolean;
}

/**
 * Recursively search a folder to find all files.
 */
function getAllFilesRecursive(dirPath: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dirPath)) return results;
  
  const resolvedDir = path.resolve(dirPath);
  const list = fs.readdirSync(resolvedDir);
  for (const file of list) {
    const filePath = path.resolve(resolvedDir, file);
    
    // Path traversal check
    if (!filePath.startsWith(resolvedDir)) {
      continue;
    }
    
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFilesRecursive(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * Downloads a Dropbox shared folder link, extracts the ZIP archive locally,
 * and returns the path to the folder.
 */
async function downloadAndExtractDropbox(urlStr: string, targetDir: string): Promise<string> {
  const parsedUrl = new URL(urlStr);
  if (!parsedUrl.hostname.includes('dropbox.com')) {
    throw new Error('Invalid URL. Only dropbox.com links are supported.');
  }

  // Set download parameter to force zip download
  parsedUrl.searchParams.set('dl', '1');
  const downloadUrl = parsedUrl.toString();

  // Create clean download target directory in the workspace
  const resolvedTarget = path.resolve(targetDir);
  if (fs.existsSync(resolvedTarget)) {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  }
  fs.mkdirSync(resolvedTarget, { recursive: true });

  const workspaceDir = path.resolve(__dirname, '../../../');
  const tempZipPath = path.join(workspaceDir, 'downloaded.zip');

  if (fs.existsSync(tempZipPath)) {
    fs.unlinkSync(tempZipPath);
  }

  try {
    console.log(`[DOWNLOAD] Starting download from: ${downloadUrl}`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Dropbox link. HTTP Status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Response body stream is empty');
    }

    const fileWriter = fs.createWriteStream(tempZipPath);
    await pipeline(Readable.fromWeb(response.body as any), fileWriter);
    console.log(`[DOWNLOAD] ZIP downloaded to: ${tempZipPath}`);

    // Extract ZIP archive using cross-platform AdmZip
    console.log(`[EXTRACT] Unzipping via AdmZip to: ${resolvedTarget}`);
    try {
      const zip = new AdmZip(tempZipPath);
      zip.extractAllTo(resolvedTarget, true);
      console.log('[EXTRACT] Unzipped successfully');
    } catch (unzipErr: any) {
      throw new Error(`Failed to extract zip archive: ${unzipErr.message}`);
    }

  } finally {
    // Cleanup ZIP file
    if (fs.existsSync(tempZipPath)) {
      try {
        fs.unlinkSync(tempZipPath);
      } catch (e) {
        // Ignore unlink error
      }
    }
  }

  // Resolve root directory of cases inside targetDir (Dropbox zip structure check)
  let scanTarget = resolvedTarget;
  const items = fs.readdirSync(resolvedTarget);
  const dirs = items.filter(item => {
    try {
      const stat = fs.statSync(path.join(resolvedTarget, item));
      return stat.isDirectory() && !item.startsWith('.');
    } catch (e) {
      return false;
    }
  });
  const files = items.filter(item => {
    try {
      const stat = fs.statSync(path.join(resolvedTarget, item));
      return stat.isFile() && !item.startsWith('.');
    } catch (e) {
      return false;
    }
  });
  
  if (dirs.length === 1 && files.length === 0) {
    scanTarget = path.join(resolvedTarget, dirs[0]);
    console.log(`[EXTRACT] Resolved scan sub-directory: ${scanTarget}`);
  }

  return scanTarget;
}

/**
 * Scans a root directory for case folders containing an 'art' subfolder.
 */
export async function scanDirectory(rootPath: string): Promise<CaseFolder[]> {
  const cases: CaseFolder[] = [];
  let scanTarget: string;

  // Check if input path is a web link
  if (rootPath.startsWith('http://') || rootPath.startsWith('https://')) {
    const workspaceDir = path.resolve(__dirname, '../../../');
    const downloadFolder = path.join(workspaceDir, '.downloaded_cases');
    
    // Download and extract to .downloaded_cases
    scanTarget = await downloadAndExtractDropbox(rootPath, downloadFolder);
  } else {
    scanTarget = path.resolve(rootPath);
  }

  if (!fs.existsSync(scanTarget)) {
    throw new Error(`Directory does not exist: ${scanTarget}`);
  }

  const entries = fs.readdirSync(scanTarget, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const casePath = path.resolve(scanTarget, entry.name);
      
      // Path traversal check
      if (!casePath.startsWith(scanTarget)) {
        continue;
      }
      
      // Look for a subfolder named 'art' (case-insensitive)
      const subEntries = fs.readdirSync(casePath, { withFileTypes: true });
      const artFolderEntry = subEntries.find(
        (sub) => sub.isDirectory() && sub.name.toLowerCase() === 'art'
      );

      if (artFolderEntry) {
        const artFolderPath = path.resolve(casePath, artFolderEntry.name);
        
        // Path traversal check
        if (!artFolderPath.startsWith(casePath)) {
          continue;
        }
        
        const allFiles = getAllFilesRecursive(artFolderPath);

        const fileTypes: Record<string, number> = {};
        let totalSize = 0;

        for (const filePath of allFiles) {
          const ext = path.extname(filePath).toLowerCase() || 'no-extension';
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
          
          try {
            const stat = fs.statSync(filePath);
            totalSize += stat.size;
          } catch (e) {
            // Ignore stats errors
          }
        }

        cases.push({
          path: casePath,
          name: entry.name,
          artFolderPath,
          fileCount: allFiles.length,
          fileTypes,
          totalSizeMb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        });
      }
    }
  }

  return cases;
}

/**
 * Resolves a destination file path to prevent naming collisions.
 * E.g., if sketch.psd exists, it returns sketch_[CaseName].psd.
 * If that exists, it returns sketch_[CaseName]_1.psd, etc.
 */
function resolveDestPath(
  originalFileName: string,
  caseFolderName: string,
  outputDir: string,
  onLog: (msg: string) => void
): { resolvedPath: string; resolvedName: string } {
  const ext = path.extname(originalFileName);
  const base = path.basename(originalFileName, ext);
  
  const initialDestPath = path.join(outputDir, originalFileName);
  if (!fs.existsSync(initialDestPath)) {
    return { resolvedPath: initialDestPath, resolvedName: originalFileName };
  }

  // First resolution step: Append the case folder name
  // E.g., sketch_[CaseName].psd
  const caseSuffixName = `${base}_[${caseFolderName}]${ext}`;
  const caseSuffixPath = path.join(outputDir, caseSuffixName);
  
  if (!fs.existsSync(caseSuffixPath)) {
    onLog(`[COLLISION] File "${originalFileName}" already exists in output folder. Renaming to "${caseSuffixName}"`);
    return { resolvedPath: caseSuffixPath, resolvedName: caseSuffixName };
  }

  // Second resolution step: Append numeric increments
  // E.g., sketch_[CaseName]_1.psd
  let counter = 1;
  while (true) {
    const incrementedName = `${base}_[${caseFolderName}]_${counter}${ext}`;
    const incrementedPath = path.join(outputDir, incrementedName);
    if (!fs.existsSync(incrementedPath)) {
      onLog(`[COLLISION] File "${caseSuffixName}" already exists. Renaming to "${incrementedName}"`);
      return { resolvedPath: incrementedPath, resolvedName: incrementedName };
    }
    counter++;
  }
}

/**
 * Core function that executes the organization task (copy + previews).
 */
export async function organizeCases({
  selectedCases,
  outputDir,
  isTest,
  sortWithAI,
  onLog,
  onProgress,
}: {
  selectedCases: CaseFolder[];
  outputDir: string;
  isTest: boolean;
  sortWithAI: boolean;
  onLog: (msg: string) => void;
  onProgress: (progress: number) => void;
}): Promise<void> {
  const resolvedOutputDir = path.resolve(outputDir);
  
  // Ensure output directory exists
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
    onLog(`[DIR] Created output directory: ${resolvedOutputDir}`);
  }

  // Setup local temp previews directory inside the workspace
  const workspaceDir = path.resolve(__dirname, '../../../');
  const tempPreviewsDir = path.join(workspaceDir, '.temp_previews');
  
  if (fs.existsSync(tempPreviewsDir)) {
    fs.rmSync(tempPreviewsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempPreviewsDir, { recursive: true });

  try {
    // 1. Gather all file operations first
    const fileOperations: Array<{
      srcPath: string;
      originalName: string;
      caseName: string;
      artFolderPath: string;
    }> = [];

    for (const caseFolder of selectedCases) {
      if (!fs.existsSync(caseFolder.artFolderPath)) {
        onLog(`[WARNING] Art folder not found for case: ${caseFolder.name}`);
        continue;
      }

      let filesInCase = getAllFilesRecursive(caseFolder.artFolderPath);
      
      if (isTest) {
        // Limit to 2 files per file type per case for testing
        const countsByExt: Record<string, number> = {};
        const testFiles: string[] = [];
        
        for (const filePath of filesInCase) {
          const ext = path.extname(filePath).toLowerCase() || 'no-extension';
          countsByExt[ext] = countsByExt[ext] || 0;
          if (countsByExt[ext] < 2) {
            testFiles.push(filePath);
            countsByExt[ext]++;
          }
        }
        
        onLog(`[TEST RUN] Limiting ${caseFolder.name} files to 2 per file type. Selected ${testFiles.length} of ${filesInCase.length} files.`);
        filesInCase = testFiles;
      }

      for (const filePath of filesInCase) {
        // Extract relative path inside the art folder to preserve name structure
        const relativeName = path.relative(caseFolder.artFolderPath, filePath);
        // Replace slash with underscore if there were subfolders inside 'art', to flatten it "loose"
        const flatName = relativeName.replace(/[\\/]/g, '_');
        
        fileOperations.push({
          srcPath: filePath,
          originalName: flatName,
          caseName: caseFolder.name,
          artFolderPath: caseFolder.artFolderPath,
        });
      }
    }

    const totalFiles = fileOperations.length;
    if (totalFiles === 0) {
      onLog('[COMPLETE] No files found to copy.');
      onProgress(100);
      return;
    }

    onLog(`[START] Beginning copy operations for ${totalFiles} files...`);

    let processedCount = 0;

    for (const op of fileOperations) {
      const { srcPath, originalName, caseName, artFolderPath } = op;
      
      try {
        // Path traversal safety checks on inputs
        const resolvedSrcPath = path.resolve(srcPath);
        const resolvedArtFolder = path.resolve(artFolderPath);
        if (!resolvedSrcPath.startsWith(resolvedArtFolder)) {
          throw new Error(`Path traversal attempt blocked reading file: ${srcPath}`);
        }

        const ext = path.extname(srcPath).toLowerCase();

        // 1. Generate preview first if PSD/AI so we can use the preview for AI classification!
        let tempPreviewPath: string | null = null;
        let generatedPreview = false;

        if (ext === '.psd' || ext === '.ai') {
          // Check if PSD/AI to generate preview in temp directory
          const fileTempDir = path.join(tempPreviewsDir, `preview_${processedCount}`);
          tempPreviewPath = await generatePreview(resolvedSrcPath, fileTempDir);
          generatedPreview = true;
        }

        // 2. Classify to find the target category folder if enabled
        let categoryFolder = '';
        if (sortWithAI) {
          // If we have a preview, classify the preview. Otherwise classify the source file.
          const pathToClassify = tempPreviewPath && fs.existsSync(tempPreviewPath) ? tempPreviewPath : resolvedSrcPath;
          categoryFolder = await classifyImage(pathToClassify, onLog);
        }

        const fileOutputDir = categoryFolder ? path.join(resolvedOutputDir, categoryFolder) : resolvedOutputDir;

        // Ensure output sub-directory exists
        if (!fs.existsSync(fileOutputDir)) {
          fs.mkdirSync(fileOutputDir, { recursive: true });
        }

        // 3. Resolve target name with collision handling in the correct sub-directory
        const { resolvedPath, resolvedName } = resolveDestPath(
          originalName,
          caseName,
          fileOutputDir,
          onLog
        );

        const absoluteResolvedPath = path.resolve(resolvedPath);
        if (!absoluteResolvedPath.startsWith(fileOutputDir)) {
          throw new Error(`Path traversal attempt blocked writing file: ${resolvedName}`);
        }

        // Perform safe copy
        fs.copyFileSync(resolvedSrcPath, absoluteResolvedPath);
        onLog(`[COPY] "${originalName}" from case "${caseName}" -> "${categoryFolder ? categoryFolder + '/' : ''}${resolvedName}"`);

        // 4. Handle Preview Placement next to the copied file
        if (generatedPreview) {
          if (tempPreviewPath && fs.existsSync(tempPreviewPath)) {
            // The preview should have the same base name as the copied file but with .png
            const previewBaseName = `${path.basename(resolvedName, ext)}.png`;
            const finalPreviewPath = path.join(fileOutputDir, previewBaseName);
            
            // Check for collision on the preview name as well
            let resolvedPreviewPath = finalPreviewPath;
            if (fs.existsSync(finalPreviewPath)) {
              const previewExt = '.png';
              const previewBase = path.basename(previewBaseName, previewExt);
              resolvedPreviewPath = path.join(fileOutputDir, `${previewBase}_preview${previewExt}`);
            }
            
            const absolutePreviewPath = path.resolve(resolvedPreviewPath);
            if (!absolutePreviewPath.startsWith(fileOutputDir)) {
              throw new Error(`Path traversal attempt blocked writing preview file: ${path.basename(resolvedPreviewPath)}`);
            }

            fs.copyFileSync(tempPreviewPath, absolutePreviewPath);
            onLog(`[PREVIEW] Preview created: "${categoryFolder ? categoryFolder + '/' : ''}${path.basename(resolvedPreviewPath)}"`);
          } else {
            onLog(`[PREVIEW] Could not generate preview for "${resolvedName}"`);
          }
        }
      } catch (err: any) {
        onLog(`[ERROR] Failed to process file "${originalName}" from case "${caseName}": ${err.message}`);
      }

      processedCount++;
      onProgress(Math.round((processedCount / totalFiles) * 100));
    }

    onLog(`[COMPLETE] Finished organizing cases. Total files processed: ${processedCount}/${totalFiles}`);
  } finally {
    // Cleanup temporary previews folder
    if (fs.existsSync(tempPreviewsDir)) {
      try {
        fs.rmSync(tempPreviewsDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to cleanup temp previews folder:', e);
      }
    }
  }
}
