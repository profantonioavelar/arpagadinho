const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

async function generateCerts() {
  const sslDir = path.join(__dirname, 'ssl');
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  const certPath = path.join(sslDir, 'cert.pem');
  const keyPath = path.join(sslDir, 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('Certificados SSL já existem em ssl/');
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }

  console.log('Gerando certificados SSL autoassinados para HTTPS...');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, { days: 365 });

  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  console.log('Certificados SSL gerados com sucesso em ssl/cert.pem e ssl/key.pem');

  return { cert: pems.cert, key: pems.private };
}

if (require.main === module) {
  generateCerts().catch(err => {
    console.error('Erro ao gerar certificados SSL:', err);
    process.exit(1);
  });
}

module.exports = generateCerts;
