/**
 * Testes Automatizados de Autenticação e Separação de Acesso
 * ARpagadinho - Mostra Cultural Projeto UBUNTU
 */

const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando Testes de Autenticação e Separação de Acessos...\n');
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

  try {
    // 1. Página inicial pública dos pais (Projeto UBUNTU)
    const homeRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET'
    });
    assert(homeRes.status === 200, 'Página inicial pública dos pais responde com status 200');
    assert(homeRes.body.includes('Projeto UBUNTU'), 'Página inicial contém o tema "Projeto UBUNTU"');
    assert(homeRes.body.includes('Eu sou porque nós somos'), 'Página inicial contém o lema "Eu sou porque nós somos"');
    assert(!homeRes.body.includes('server-ip-badge'), 'Página dos pais NÃO expõe banner de IP de rede');

    // 2. Visualizador WebAR público
    const viewRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/view.html',
      method: 'GET'
    });
    assert(viewRes.status === 200, 'Visualizador WebAR (/view.html) é público (200 OK)');

    // 3. Bloqueio de acesso a páginas administrativas sem login
    const studioRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/studio.html',
      method: 'GET'
    });
    assert(studioRes.status === 302, 'Acesso ao /studio.html sem login é redirecionado (302)');
    assert(studioRes.headers.location && studioRes.headers.location.includes('/login.html'), 'Redirecionamento aponta para /login.html');

    const printBatchRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/print-batch.html',
      method: 'GET'
    });
    assert(printBatchRes.status === 302, 'Acesso ao /print-batch.html sem login é redirecionado (302)');

    // 4. Bloqueio de APIs administrativas sem login
    const infoRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/info',
      method: 'GET'
    });
    assert(infoRes.status === 401, 'Endpoint de IP de rede (/api/info) bloqueado para visitantes (401)');

    const postExpRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/experiences',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { title: 'Teste Não Autorizado' });
    assert(postExpRes.status === 401, 'Criação de experiência sem autenticação bloqueada (401)');

    // 5. Teste de Login incorreto
    const wrongLoginRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: '3164231', password: 'senha_errada' });
    assert(wrongLoginRes.status === 401, 'Login com senha incorreta rejeitado (401)');

    // 6. Teste de Login correto (3164231 / 3164231)
    const validLoginRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: '3164231', password: '3164231' });
    assert(validLoginRes.status === 200, 'Login com 3164231 / 3164231 aceito com sucesso (200)');
    
    const setCookie = validLoginRes.headers['set-cookie'];
    assert(setCookie && setCookie[0].includes('arpagadinho_token'), 'Cookie arpagadinho_token foi configurado');

    const cookieStr = setCookie ? setCookie[0].split(';')[0] : '';

    // 7. Acesso autenticado ao /api/info e /studio.html
    const authedInfoRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/info',
      method: 'GET',
      headers: { 'Cookie': cookieStr }
    });
    assert(authedInfoRes.status === 200, 'Professor autenticado consegue acessar /api/info (200 OK)');
    
    const authedStudioRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/studio.html',
      method: 'GET',
      headers: { 'Cookie': cookieStr }
    });
    assert(authedStudioRes.status === 200, 'Professor autenticado consegue acessar /studio.html diretamente (200 OK)');

    // 8. Teste de Logout
    const logoutRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/logout',
      method: 'POST',
      headers: { 'Cookie': cookieStr }
    });
    assert(logoutRes.status === 200, 'Logout realizado com sucesso (200)');

    const afterLogoutCheck = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/check',
      method: 'GET',
      headers: { 'Cookie': cookieStr }
    });
    const checkData = JSON.parse(afterLogoutCheck.body);
    assert(checkData.authenticated === false, 'Após logout, sessão é invalidada com sucesso');

    console.log(`\n🏁 Resultado: ${passed}/${total} testes passaram com sucesso!`);
    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Erro durante execução dos testes:', err);
    process.exit(1);
  }
}

runTests();
