const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mockDir = path.join(__dirname, 'mock_dropbox');

// Create directories
const cases = [
  path.join(mockDir, 'Case_01_CarCrash', 'art'),
  path.join(mockDir, 'Case_02_PatentInfringement', 'art'),
  path.join(mockDir, 'Case_03_EmptyCase')
];

cases.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// 1x1 transparent PNG base64
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngBuffer = Buffer.from(pngBase64, 'base64');

// Write dummy files
const case1Art = cases[0];
const case2Art = cases[1];

// Write PNGs
const png1 = path.join(case1Art, 'diagram.png');
const png2 = path.join(case2Art, 'diagram.png');
fs.writeFileSync(png1, pngBuffer);
fs.writeFileSync(png2, pngBuffer);
console.log('Wrote mock PNGs');

// Write text file
fs.writeFileSync(path.join(case1Art, 'notes.txt'), 'Case 1 Notes text.');
console.log('Wrote mock TXT');

// Convert PNG to PSD using sips
try {
  execSync(`sips -s format psd "${png1}" --out "${path.join(case1Art, 'sketch.psd')}"`);
  execSync(`sips -s format psd "${png2}" --out "${path.join(case2Art, 'mockup.psd')}"`);
  console.log('Successfully generated valid PSD mock files!');
} catch (e) {
  console.log('Could not convert PSD using sips. Creating text-based PSD fallback.');
  fs.writeFileSync(path.join(case1Art, 'sketch.psd'), 'Dummy PSD');
  fs.writeFileSync(path.join(case2Art, 'mockup.psd'), 'Dummy PSD');
}

// Convert PNG to PDF/AI using sips
const aiFiles = [];

try {
  const blueprintAi = path.join(case2Art, 'blueprint.ai');
  execSync(`sips -s format pdf "${png2}" --out "${blueprintAi}"`);
  aiFiles.push({ aiPath: blueprintAi, pngPath: png2 });
  console.log('Successfully generated valid AI (PDF format) mock files!');
} catch (e) {
  console.log('Could not convert AI using sips. Creating text-based AI fallback.');
  const blueprintAi = path.join(case2Art, 'blueprint.ai');
  fs.writeFileSync(blueprintAi, 'Dummy AI (PDF) content');
  aiFiles.push({ aiPath: blueprintAi, pngPath: png2 });
}

function writeMockMetafile(outputPath, pngPath) {
  const fixturePath = path.join(__dirname, 'server/fixtures/chart.emf');

  if (process.platform === 'win32') {
    const scriptPath = path.join(__dirname, '.create-mock-emf.ps1');
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      `$png = '${pngPath.replace(/'/g, "''")}'`,
      `$emf = '${outputPath.replace(/'/g, "''")}'`,
      '$bmp = [System.Drawing.Bitmap]::FromFile($png)',
      '$fs = New-Object System.IO.FileStream($emf, [System.IO.FileMode]::Create)',
      '$meta = New-Object System.Drawing.Imaging.Metafile($fs, [System.Drawing.Imaging.EmfType]::EmfOnly)',
      '$g = [System.Drawing.Graphics]::FromImage($meta)',
      '$g.DrawImage($bmp, 0, 0)',
      '$g.Dispose()',
      '$meta.Dispose()',
      '$fs.Close()',
      '$bmp.Dispose()',
    ].join('\n');

    fs.writeFileSync(scriptPath, script, 'utf8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`);
    fs.unlinkSync(scriptPath);
    console.log(`Successfully generated EMF companion: ${path.basename(outputPath)}`);
    return;
  }

  try {
    execSync(`magick "${pngPath}" "${outputPath}"`);
    console.log(`Successfully generated EMF companion via ImageMagick: ${path.basename(outputPath)}`);
    return;
  } catch (e) {
    // Fall back to the checked-in fixture when ImageMagick is unavailable.
  }

  if (fs.existsSync(fixturePath)) {
    fs.copyFileSync(fixturePath, outputPath);
    console.log(`Copied EMF fixture for companion: ${path.basename(outputPath)}`);
    return;
  }

  fs.writeFileSync(outputPath, 'Mock EMF placeholder');
  console.log(`Created placeholder EMF companion: ${path.basename(outputPath)}`);
}

function writeEmfCompanionsForAiFiles(artDir, aiEntries) {
  for (const file of fs.readdirSync(artDir)) {
    if (file.toLowerCase().endsWith('.emf')) {
      fs.unlinkSync(path.join(artDir, file));
    }
  }

  for (const { aiPath, pngPath } of aiEntries) {
    const emfPath = aiPath.replace(/\.ai$/i, '.emf');
    writeMockMetafile(emfPath, pngPath);
  }
}

try {
  writeEmfCompanionsForAiFiles(case2Art, aiFiles);
} catch (e) {
  console.log('Could not create EMF companions for AI files:', e.message);
}

console.log('Mock Dropbox folders and assets created successfully at:', mockDir);
