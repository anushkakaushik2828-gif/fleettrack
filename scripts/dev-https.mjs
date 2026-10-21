import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import selfsigned from 'selfsigned';

const certDir = path.resolve('.cert');
fs.mkdirSync(certDir, { recursive: true });
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost-cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    }],
  });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  console.log('Created a local self-signed certificate in .cert/.');
}

console.log('Starting https://localhost:3443 (your browser will warn about the self-signed certificate).');
const child = spawn(process.execPath, ['server/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.HTTPS_PORT || '3443',
    HTTPS_KEY: keyPath,
    HTTPS_CERT: certPath,
    COOKIE_SECURE: 'true',
    NODE_ENV: process.env.NODE_ENV || 'development',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
