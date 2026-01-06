// Simple test to verify server functionality
import http from 'http';

interface CheckOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
}

const checkFile = (path: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const options: CheckOptions = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`${path}: ${res.statusCode} ${res.headers['content-type'] || 'no content-type'} ${data.length} bytes`);
        resolve(res.statusCode === 200);
      });
    });

    req.on('error', () => {
      console.log(`${path}: CONNECTION FAILED`);
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      console.log(`${path}: TIMEOUT`);
      resolve(false);
    });

    req.end();
  });
};

async function testFiles(): Promise<void> {
  console.log('Testing server at http://localhost:4000');
  
  const files = [
    '/',
    '/index.html', 
    '/src/index.ts',
    '/src/shared/Component.ts',
    '/src/components/Layout.ts'
  ];

  for (const file of files) {
    const success = await checkFile(file);
    if (!success && file !== '/') {
      console.log(`❌ Failed to load: ${file}`);
    }
  }
  
  console.log('\n✅ Test completed');
}

testFiles();