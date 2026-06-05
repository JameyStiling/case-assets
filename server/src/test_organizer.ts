import * as fs from 'fs';
import * as path from 'path';
import { scanDirectory, organizeCases } from './services/organizer';

async function runTest() {
  const rootPath = path.resolve(__dirname, '../../mock_dropbox');
  const outputDir = path.resolve(__dirname, '../../mock_dropbox/ART_TEMP_TEST');

  console.log('=== TEST 1: Scanning Directory ===');
  console.log(`Scanning: ${rootPath}`);
  
  try {
    const cases = await scanDirectory(rootPath);
    console.log(`Found ${cases.length} case folders:`);
    console.log(JSON.stringify(cases, null, 2));

    if (cases.length === 0) {
      console.error('FAIL: No cases found!');
      process.exit(1);
    }

    console.log('\n=== TEST 2: Running Organization in TEST Mode ===');
    console.log(`Output folder: ${outputDir}`);

    // Clear previous test outputs if any
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }

    await organizeCases({
      selectedCases: cases,
      outputDir,
      isTest: true,
      sortWithAI: false,
      onLog: (msg) => console.log(`[LOG] ${msg}`),
      onProgress: (pct) => console.log(`[PROGRESS] ${pct}%`),
    });

    console.log('\n=== TEST 3: Verifying File Outputs ===');
    if (!fs.existsSync(outputDir)) {
      console.error(`FAIL: Output directory ${outputDir} was not created!`);
      process.exit(1);
    }

    const copiedFiles = fs.readdirSync(outputDir);
    console.log('Files copied to ART_TEMP_TEST:', copiedFiles);

    // Dynamically check that for every copied .psd or .ai file, a corresponding .png preview was created.
    const psdOrAiFiles = copiedFiles.filter(f => f.endsWith('.psd') || f.endsWith('.ai'));
    let previewVerificationPassed = true;
    
    console.log('Verifying previews for copied PSD/AI files:');
    for (const file of psdOrAiFiles) {
      const ext = path.extname(file);
      const base = path.basename(file, ext);
      const expectedPreview = `${base}.png`;
      const hasPreview = copiedFiles.includes(expectedPreview);
      console.log(`- ${file} has preview "${expectedPreview}": ${hasPreview}`);
      if (!hasPreview) {
        previewVerificationPassed = false;
      }
    }

    // Verify collision resolution occurred
    const hasDiagram1 = copiedFiles.includes('diagram.png');
    const hasDiagram2 = copiedFiles.includes('diagram_[Case_02_PatentInfringement].png');
    
    console.log('Collision Verifications:');
    console.log(`- Has Case 1 diagram.png: ${hasDiagram1}`);
    console.log(`- Has Case 2 diagram.png (collision resolved): ${hasDiagram2}`);

    const collisionPassed = hasDiagram1 && hasDiagram2;

    if (previewVerificationPassed && collisionPassed && psdOrAiFiles.length > 0) {
      console.log('\nSUCCESS: Test run checks passed!');
    } else {
      console.error('\nFAIL: Test run verification failed.');
      process.exit(1);
    }

    console.log('\n=== TEST 4: Running Organization in FULL Mode ===');
    const outputDirFull = path.resolve(__dirname, '../../mock_dropbox/ART_TEMP_FULL');
    if (fs.existsSync(outputDirFull)) {
      fs.rmSync(outputDirFull, { recursive: true, force: true });
    }

    await organizeCases({
      selectedCases: cases,
      outputDir: outputDirFull,
      isTest: false,
      sortWithAI: false,
      onLog: (msg) => console.log(`[LOG] ${msg}`),
      onProgress: (pct) => console.log(`[PROGRESS] ${pct}%`),
    });

    console.log('\n=== TEST 5: Verifying Full Run Outputs ===');
    const fullFiles = fs.readdirSync(outputDirFull);
    console.log('Files copied to ART_TEMP_FULL:', fullFiles);

    const expectedPsdPreviews = ['sketch.png', 'mockup.png'];
    let psdPreviewsPassed = true;
    for (const expected of expectedPsdPreviews) {
      const exists = fullFiles.includes(expected);
      console.log(`- Has PSD preview "${expected}": ${exists}`);
      if (!exists) psdPreviewsPassed = false;
    }

    if (psdPreviewsPassed) {
      console.log('\nSUCCESS: Full run checks (including PSD previews) passed!');
    } else {
      console.error('\nFAIL: PSD previews were not generated correctly.');
      process.exit(1);
    }

    console.log('\n=== TEST 6: Running Organization with AI sorting enabled ===');
    const outputDirAI = path.resolve(__dirname, '../../mock_dropbox/ART_TEMP_AI');
    if (fs.existsSync(outputDirAI)) {
      fs.rmSync(outputDirAI, { recursive: true, force: true });
    }

    await organizeCases({
      selectedCases: cases,
      outputDir: outputDirAI,
      isTest: false,
      sortWithAI: true,
      onLog: (msg) => console.log(`[LOG] ${msg}`),
      onProgress: (pct) => console.log(`[PROGRESS] ${pct}%`),
    });

    console.log('\n=== TEST 7: Verifying AI Sorting Outputs ===');
    if (!fs.existsSync(outputDirAI)) {
      console.error(`FAIL: AI Output directory ${outputDirAI} was not created!`);
      process.exit(1);
    }

    const aiSubdirs = fs.readdirSync(outputDirAI).filter(item => {
      return fs.statSync(path.join(outputDirAI, item)).isDirectory();
    });

    console.log('Categories created by AI sorting:', aiSubdirs);
    if (aiSubdirs.length === 0) {
      console.error('FAIL: No category subdirectories were created!');
      process.exit(1);
    }

    // Verify files copied inside subdirs recursively
    let totalFilesCopiedInAI = 0;
    for (const subdir of aiSubdirs) {
      const filesInSub = fs.readdirSync(path.join(outputDirAI, subdir));
      console.log(`- Folder "${subdir}" contains files:`, filesInSub);
      totalFilesCopiedInAI += filesInSub.length;
    }

    console.log(`Total files sorted by AI: ${totalFilesCopiedInAI}`);
    if (totalFilesCopiedInAI > 0) {
      console.log('\nSUCCESS: AI sorting verification passed!');
    } else {
      console.error('\nFAIL: No files found inside AI category folders.');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test threw an error:', err);
    process.exit(1);
  }
}

runTest();
