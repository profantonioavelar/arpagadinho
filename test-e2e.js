const fs = require('fs');
const path = require('path');

async function runTests() {
  const BASE_URL = 'http://localhost:3000';
  console.log('--- Iniciando Testes Automatizados da API WebAR com Autenticação ---');

  // 0. Autenticação com credenciais de confecção
  console.log('0. Testando login do professor (POST /api/auth/login)...');
  const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '3164231', password: '3164231' })
  });
  if (!resLogin.ok) throw new Error('Falha no login: ' + resLogin.status);
  const loginData = await resLogin.json();
  const token = loginData.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('   ✓ Login efetuado com sucesso para usuário:', loginData.user);

  // 1. Teste /api/info (protegido)
  console.log('1. Testando GET /api/info...');
  const resInfo = await fetch(`${BASE_URL}/api/info`, { headers: authHeaders });
  if (!resInfo.ok) throw new Error('Falha no endpoint /api/info: ' + resInfo.status);
  const info = await resInfo.json();
  console.log('   ✓ Info obtida com sucesso. IP local:', info.localIp);

  // 2. Teste /api/experiences (Listagem pública)
  console.log('2. Testando GET /api/experiences (público)...');
  const resExp = await fetch(`${BASE_URL}/api/experiences`);
  if (!resExp.ok) throw new Error('Falha no endpoint /api/experiences: ' + resExp.status);
  const experiences = await resExp.json();
  console.log(`   ✓ Total de experiências carregadas: ${experiences.length}`);

  // 3. Teste POST /api/experiences (Criação de nova experiência com autenticação)
  console.log('3. Testando POST /api/experiences com upload...');
  const sample1Dir = path.join(__dirname, 'public', 'samples', 'sample-1');
  const dummyImg = fs.readFileSync(path.join(sample1Dir, 'image.jpg'));
  const dummyVid = fs.readFileSync(path.join(sample1Dir, 'video.mp4'));
  const dummyMind = fs.readFileSync(path.join(sample1Dir, 'targets.mind'));

  const formData = new FormData();
  formData.append('title', 'Experiência de Teste Ubuntu');
  formData.append('description', 'Teste com autenticação');
  formData.append('targetWidth', '674');
  formData.append('targetHeight', '372');
  formData.append('fitMode', 'match');
  formData.append('loop', 'true');
  formData.append('audioDefault', 'muted');
  formData.append('targetImage', new Blob([dummyImg], { type: 'image/jpeg' }), 'test-target.jpg');
  formData.append('overlayVideo', new Blob([dummyVid], { type: 'video/mp4' }), 'test-video.mp4');
  formData.append('targetMind', new Blob([dummyMind], { type: 'application/octet-stream' }), 'targets.mind');

  const resCreate = await fetch(`${BASE_URL}/api/experiences`, {
    method: 'POST',
    headers: authHeaders,
    body: formData
  });

  if (!resCreate.ok) {
    const err = await resCreate.text();
    throw new Error('Falha ao criar experiência: ' + err);
  }

  const createdExp = await resCreate.json();
  console.log(`   ✓ Experiência criada com ID: ${createdExp.id}, Título: ${createdExp.title}`);

  // 4. Teste GET /api/qrcode/:id (público)
  console.log('4. Testando GET /api/qrcode/:id...');
  const resQr = await fetch(`${BASE_URL}/api/qrcode/${createdExp.id}`);
  if (!resQr.ok) throw new Error('Falha no endpoint /api/qrcode: ' + resQr.status);
  const qr = await resQr.json();
  if (!qr.qrDataUrl || !qr.qrDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('QR Code não retornou data URL válida.');
  }
  console.log('   ✓ QR Code gerado com sucesso para a URL:', qr.targetUrl);

  // 5. Teste DELETE /api/experiences/:id (protegido)
  console.log('5. Testando DELETE /api/experiences/:id...');
  const resDel = await fetch(`${BASE_URL}/api/experiences/${createdExp.id}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  if (!resDel.ok) throw new Error('Falha ao excluir experiência: ' + resDel.status);
  console.log('   ✓ Experiência excluída com sucesso.');

  console.log('\n🎉 TODOS OS TESTES DA API FORAM CONCLUÍDOS COM SUCESSO!');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
