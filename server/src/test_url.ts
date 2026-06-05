import { scanDirectory } from './services/organizer';

async function testUrl() {
  const url = 'https://www.dropbox.com/scl/fo/jocy16n7atk2tuv4cbmj1/AEeC09DkKkh1DkFzOj1AdJE?rlkey=adtq1mvxkm4sjududkxwoyvt3&e=1&dl=0';
  console.log('Testing scan of Dropbox URL:', url);
  try {
    const cases = await scanDirectory(url);
    console.log('SUCCESS: URL scan found cases:');
    console.log(JSON.stringify(cases, null, 2));
  } catch (err) {
    console.error('FAIL: URL scan failed:', err);
  }
}

testUrl();
