import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const port = 4000;

// MIME types map
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  try {
    let filePath = req.url === '/' ? '/index.html' : req.url || '';
    const fullPath = join(projectRoot, filePath);
    
    // Security check - don't allow directory traversal
    if (!fullPath.startsWith(projectRoot)) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';
    
    try {
      const content = readFileSync(fullPath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    } catch (error) {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(port, () => {
  console.log('\n🚀 Iteronix Web UI (Simple Server)');
  console.log(`📁 Serving from: ${projectRoot}`);
  console.log(`🌐 Server running at: http://localhost:${port}`);
  console.log(`🔥 Ready for Stagehand interaction`);
  console.log(`📸 Screenshots: ${join(projectRoot, 'screenshots')}\n`);
});