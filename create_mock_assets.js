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
try {
  execSync(`sips -s format pdf "${png2}" --out "${path.join(case2Art, 'blueprint.ai')}"`);
  console.log('Successfully generated valid AI (PDF format) mock files!');
} catch (e) {
  console.log('Could not convert AI using sips. Creating text-based AI fallback.');
  fs.writeFileSync(path.join(case2Art, 'blueprint.ai'), 'Dummy AI (PDF) content');
}

console.log('Mock Dropbox folders and assets created successfully at:', mockDir);
