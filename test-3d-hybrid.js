/**
 * Testes Automatizados para Suporte a Objeto 3D (.GLB) + Vídeo
 */
const fs = require('fs');
const path = require('path');

async function run3dTests() {
  const BASE_URL = 'http://localhost:3000';
  console.log('🧪 Iniciando Testes de Suporte a Objeto 3D Híbrido (.GLB)...\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASSOU] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FALHOU] ${message}`);
    }
  }

  // 1. Verificar se a amostra 3D cristal.glb é servida publicamente
  const resGlb = await fetch(`${BASE_URL}/samples/sample-3d/cristal.glb`);
  assert(resGlb.ok, 'Arquivo 3D /samples/sample-3d/cristal.glb é servido com sucesso (200 OK)');
  const glbBuffer = await resGlb.arrayBuffer();
  assert(glbBuffer.byteLength > 500, `Arquivo GLB possui tamanho válido (${glbBuffer.byteLength} bytes)`);

  // 2. Verificar se a experiência demo inclui o modelo 3D
  const resExp = await fetch(`${BASE_URL}/api/experiences/demo-card-tech`);
  assert(resExp.ok, 'Experiência demo-card-tech obtida com sucesso');
  const expData = await resExp.json();
  assert(expData.model3dUrl === '/samples/sample-3d/cristal.glb', 'demo-card-tech possui model3dUrl configurado');

  // 3. Login do professor para teste de upload com 3D
  const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '3164231', password: '3164231' })
  });
  assert(resLogin.ok, 'Login do professor realizado com sucesso');
  const loginData = await resLogin.json();
  const authHeaders = { 'Authorization': `Bearer ${loginData.token}` };

  // 4. Upload de nova experiência híbrida (Imagem + Vídeo + Mind + Modelo 3D .glb)
  const sample1Dir = path.join(__dirname, 'public', 'samples', 'sample-1');
  const sample3dDir = path.join(__dirname, 'public', 'samples', 'sample-3d');
  const imgData = fs.readFileSync(path.join(sample1Dir, 'image.jpg'));
  const vidData = fs.readFileSync(path.join(sample1Dir, 'video.mp4'));
  const mindData = fs.readFileSync(path.join(sample1Dir, 'targets.mind'));
  const modelData = fs.readFileSync(path.join(sample3dDir, 'cristal.glb'));

  const formData = new FormData();
  formData.append('title', 'Teste Aluno com Escultura 3D');
  formData.append('description', 'Apresentação com modelo 3D flutuando à frente');
  formData.append('targetWidth', '674');
  formData.append('targetHeight', '372');
  formData.append('targetImage', new Blob([imgData], { type: 'image/jpeg' }), 'arte.jpg');
  formData.append('overlayVideo', new Blob([vidData], { type: 'video/mp4' }), 'apresentacao.mp4');
  formData.append('targetMind', new Blob([mindData], { type: 'application/octet-stream' }), 'targets.mind');
  formData.append('model3d', new Blob([modelData], { type: 'model/gltf-binary' }), 'escultura.glb');

  const resUpload = await fetch(`${BASE_URL}/api/experiences`, {
    method: 'POST',
    headers: authHeaders,
    body: formData
  });

  assert(resUpload.ok, 'Upload de experiência híbrida (Vídeo + 3D) aceito pelo servidor (201 Created)');
  const newExp = await resUpload.json();
  assert(!!newExp.model3dUrl, `model3dUrl gerado com sucesso: ${newExp.model3dUrl}`);

  // 5. Testar se o arquivo .glb gravado no servidor pode ser baixado
  const resUploadedGlb = await fetch(`${BASE_URL}${newExp.model3dUrl}`);
  assert(resUploadedGlb.ok, 'Arquivo 3D salvo na pasta uploads/ é acessível publicamente (200 OK)');

  // 6. Limpar experiência de teste
  const resDel = await fetch(`${BASE_URL}/api/experiences/${newExp.id}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  assert(resDel.ok, 'Experiência temporária excluída com sucesso');

  console.log(`\n🏁 Resultado: ${passed}/${total} testes de suporte a 3D passaram com 100% de sucesso!`);
  if (passed === total) process.exit(0);
  else process.exit(1);
}

run3dTests().catch(err => {
  console.error('Erro nos testes 3D:', err);
  process.exit(1);
});
