const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const cookieParser = require('cookie-parser');
const generateCerts = require('./generate-certs');
const {
  isCloudinaryEnabled,
  getCloudinaryStatus,
  uploadToCloudinary,
  syncDatabaseToCloudinary,
  restoreDatabaseFromCloudinary
} = require('./cloudinary-helper');

const app = express();
const HTTP_PORT = process.env.PORT || process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DATA_FILE = path.join(__dirname, 'data', 'experiences.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Credenciais de Acesso do Professor / Confecção
const ADMIN_USER = process.env.ADMIN_USER || '3164231';
const ADMIN_PASS = process.env.ADMIN_PASS || '3164231';
const activeSessions = new Set();

// Middlewares Globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Helpers de Autenticação
function isAuthenticated(req) {
  const cookieToken = req.cookies && req.cookies.arpagadinho_token;
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const token = cookieToken || headerToken;
  return Boolean(token && activeSessions.has(token));
}

function requireAuthApi(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Acesso restrito à área do professor. Faça login para continuar.' });
  }
  next();
}

function requireAuthPage(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// Proteger rotas de páginas administrativas antes de servir estáticos
app.get('/studio.html', requireAuthPage, (req, res, next) => next());
app.get('/print-batch.html', requireAuthPage, (req, res, next) => next());
app.get('/studio', requireAuthPage, (req, res) => res.redirect('/studio.html'));
app.get('/admin', requireAuthPage, (req, res) => res.redirect('/studio.html'));
app.get('/login', (req, res) => res.redirect('/login.html'));

// Servir arquivos estáticos da pasta public e uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper: Obter endereço IP local da rede (para testes em celulares via Wi-Fi)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Helper: Ler e Salvar banco de dados JSON de experiências
function getExperiences() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const experiences = JSON.parse(data || '[]');

    // Auto-cura protetiva: se Cloudinary estiver ativo e algum vídeo tiver ficado com caminho relativo /uploads/
    if (isCloudinaryEnabled()) {
      const cName = getCloudinaryStatus().cloudName;
      if (cName) {
        experiences.forEach(exp => {
          if (exp.overlayVideoUrl && exp.overlayVideoUrl.startsWith('/uploads/') && exp.id) {
            // Se a imagem alvo ou o mind vierem do Cloudinary, o vídeo também pertence à nuvem
            if (exp.targetImageUrl && exp.targetImageUrl.includes('cloudinary')) {
              exp.overlayVideoUrl = `https://res.cloudinary.com/${cName}/video/upload/arpagadinho/${exp.id}/video.mp4`;
              exp.isPermanent = true;
            }
          }
        });
      }
    }

    return experiences;
  } catch (err) {
    console.error('Erro ao ler experiências:', err);
    return [];
  }
}

function saveExperiences(experiences) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(experiences, null, 2));
    return true;
  } catch (err) {
    console.error('Erro ao salvar experiências:', err);
    return false;
  }
}

// Configuração do Multer para upload organizado por ID de experiência
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.experienceId) {
      req.experienceId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    const targetDir = path.join(UPLOADS_DIR, req.experienceId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'targetImage') {
      cb(null, `target${ext}`);
    } else if (file.fieldname === 'overlayVideo') {
      cb(null, `video${ext}`);
    } else if (file.fieldname === 'targetMind') {
      cb(null, 'targets.mind');
    } else if (file.fieldname === 'model3d') {
      cb(null, `model${ext}`);
    } else {
      cb(null, `${file.fieldname}${ext}`);
    }
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 40 * 1024 * 1024 // 40MB limite máximo para web e mobile
  }
});

// Seed de experiências de demonstração se o banco estiver vazio
function seedDemoExperiences() {
  const experiences = getExperiences();
  if (experiences.length > 0) return;

  const sample1Dir = path.join(__dirname, 'public', 'samples', 'sample-1');
  const sample2Dir = path.join(__dirname, 'public', 'samples', 'sample-2');

  const demoItems = [];

  if (fs.existsSync(path.join(sample1Dir, 'targets.mind'))) {
    demoItems.push({
      id: 'demo-card-tech',
      title: 'Cartão Postal Futurista (Demonstração)',
      description: 'Cartão postal ilustrado com animação sobreposta em realidade aumentada.',
      targetImageUrl: '/samples/sample-1/image.jpg',
      overlayVideoUrl: '/samples/sample-1/video.mp4',
      mindTargetUrl: '/samples/sample-1/targets.mind',
      targetWidth: 674,
      targetHeight: 372,
      aspectRatio: 372 / 674, // ~0.5519
      fitMode: 'match',
      loop: true,
      audioDefault: 'muted',
      isDemo: true,
      createdAt: new Date().toISOString()
    });
  }

  if (fs.existsSync(path.join(sample2Dir, 'targets.mind'))) {
    demoItems.push({
      id: 'demo-raccoon-art',
      title: 'Guaxinim Ilustrado (Demonstração)',
      description: 'Pôster quadrado artístico com animação fluida alinhada ao marcador.',
      targetImageUrl: '/samples/sample-2/image.jpg',
      overlayVideoUrl: '/samples/sample-2/video.mp4',
      mindTargetUrl: '/samples/sample-2/targets.mind',
      targetWidth: 1654,
      targetHeight: 1654,
      aspectRatio: 1.0,
      fitMode: 'match',
      loop: true,
      audioDefault: 'muted',
      isDemo: true,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    });
  }

  if (demoItems.length > 0) {
    saveExperiences(demoItems);
    console.log(`Carregadas ${demoItems.length} experiências de demonstração.`);
  }
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

// Login do Professor / Organizador
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    res.cookie('arpagadinho_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    });
    return res.json({ success: true, user: ADMIN_USER, token });
  }
  return res.status(401).json({ error: 'Credenciais inválidas. Matrícula ou senha incorretos.' });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = (req.cookies && req.cookies.arpagadinho_token) || 
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('arpagadinho_token');
  res.json({ success: true, message: 'Desconectado com sucesso' });
});

// Checagem de status de autenticação
app.get('/api/auth/check', (req, res) => {
  const authed = isAuthenticated(req);
  res.json({ authenticated: authed, user: authed ? ADMIN_USER : null });
});

// ==========================================
// ROTAS DA API REST
// ==========================================

// Obter informações do servidor e IP de rede (Apenas para o professor no estúdio)
app.get('/api/info', requireAuthApi, (req, res) => {
  const localIp = getLocalIpAddress();
  const protocol = req.protocol;
  const host = req.get('host');
  res.json({
    localIp,
    httpPort: HTTP_PORT,
    httpsPort: HTTPS_PORT,
    currentHost: `${protocol}://${host}`,
    networkHttpUrl: `http://${localIp}:${HTTP_PORT}`,
    networkHttpsUrl: `https://${localIp}:${HTTPS_PORT}`,
    cloudinaryEnabled: isCloudinaryEnabled(),
    storageStatus: getCloudinaryStatus()
  });
});

// Endpoint de status do armazenamento em nuvem
app.get('/api/storage-status', (req, res) => {
  res.json({
    ...getCloudinaryStatus(),
    experiencesCount: getExperiences().length
  });
});

// Endpoint para baixar backup completo de experiências (JSON)
app.get('/api/backup', requireAuthApi, (req, res) => {
  const experiences = getExperiences();
  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Disposition', `attachment; filename=arpagadinho_backup_${dateStr}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(experiences, null, 2));
});

// Endpoint para restaurar backup completo de experiências (JSON)
app.post('/api/backup/restore', requireAuthApi, (req, res) => {
  try {
    const backupData = req.body;
    if (!Array.isArray(backupData)) {
      return res.status(400).json({ error: 'O arquivo de backup deve conter uma lista (array) de experiências.' });
    }

    const currentExperiences = getExperiences();
    const merged = [...backupData];
    for (const exp of currentExperiences) {
      if (!merged.some(e => e.id === exp.id)) {
        merged.push(exp);
      }
    }

    saveExperiences(merged);
    if (isCloudinaryEnabled()) {
      syncDatabaseToCloudinary(merged).catch(err => console.warn(err));
    }

    res.json({
      success: true,
      message: `Backup restaurado com sucesso! Total de ${merged.length} experiências ativas.`,
      count: merged.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao restaurar backup: ' + err.message });
  }
});

// Listar todas as experiências
app.get('/api/experiences', (req, res) => {
  const experiences = getExperiences();
  res.json(experiences);
});

// Obter uma experiência específica
app.get('/api/experiences/:id', (req, res) => {
  const experiences = getExperiences();
  const exp = experiences.find(e => e.id === req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiência não encontrada' });
  }
  res.json(exp);
});

// Criar nova experiência com upload de arte, vídeo, arquivo .mind e modelo 3D opcional (Apenas professor)
const uploadMiddleware = upload.fields([
  { name: 'targetImage', maxCount: 1 },
  { name: 'overlayVideo', maxCount: 1 },
  { name: 'targetMind', maxCount: 1 },
  { name: 'model3d', maxCount: 1 },
  { name: 'customLogo', maxCount: 1 }
]);

const uploadFields = (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'Arquivo muito pesado! O tamanho máximo permitido é de 40 MB para garantir reprodução rápida nos smartphones dos pais.'
        });
      }
      return res.status(400).json({ error: `Erro no envio dos arquivos: ${err.message}` });
    }
    next();
  });
};

app.post('/api/experiences', requireAuthApi, uploadFields, async (req, res) => {
  try {
    const {
      title,
      description,
      studentName,
      studentClass,
      targetWidth,
      targetHeight,
      fitMode,
      loop,
      audioDefault,
      model3dScale,
      chromaKey,
      backdropMode
    } = req.body;

    const files = req.files;
    if (!files || !files.targetImage || !files.overlayVideo || !files.targetMind) {
      return res.status(400).json({
        error: 'É necessário enviar a imagem alvo, o vídeo e o arquivo targets.mind compilado.'
      });
    }

    const expId = req.experienceId;
    const targetImageFile = files.targetImage[0];
    const overlayVideoFile = files.overlayVideo[0];
    const targetMindFile = files.targetMind[0];
    const model3dFile = files.model3d ? files.model3d[0] : null;
    const customLogoFile = files.customLogo ? files.customLogo[0] : null;

    const width = parseFloat(targetWidth) || 1000;
    const height = parseFloat(targetHeight) || 1000;
    const aspectRatio = height / width;

    let targetImageUrl = `/uploads/${expId}/${targetImageFile.filename}`;
    let overlayVideoUrl = `/uploads/${expId}/${overlayVideoFile.filename}`;
    let mindTargetUrl = `/uploads/${expId}/${targetMindFile.filename}`;
    let model3dUrl = model3dFile ? `/uploads/${expId}/${model3dFile.filename}` : null;
    let customLogoUrl = customLogoFile ? `/uploads/${expId}/${customLogoFile.filename}` : (req.body.customLogoUrl || null);

    let warningMessage = null;

    if (isCloudinaryEnabled()) {
      console.log(`[Cloudinary] Enviando arquivos de "${title}" (${expId}) para armazenamento permanente na nuvem...`);
      try {
        const [cImg, cVid, cMind, cModel, cLogo] = await Promise.all([
          uploadToCloudinary(targetImageFile.path, `arpagadinho/${expId}/image`, 'image'),
          uploadToCloudinary(overlayVideoFile.path, `arpagadinho/${expId}/video`, 'video'),
          uploadToCloudinary(targetMindFile.path, `arpagadinho/${expId}/targets`, 'raw'),
          model3dFile ? uploadToCloudinary(model3dFile.path, `arpagadinho/${expId}/model`, 'raw') : Promise.resolve(null),
          customLogoFile ? uploadToCloudinary(customLogoFile.path, `arpagadinho/${expId}/logo`, 'image') : Promise.resolve(null)
        ]);
        if (cImg) targetImageUrl = cImg;
        if (cVid) overlayVideoUrl = cVid;
        if (cMind) mindTargetUrl = cMind;
        if (cModel) model3dUrl = cModel;
        if (cLogo) customLogoUrl = cLogo;

        // Se o Cloudinary estiver ativo e o vídeo por algum motivo não tiver retornado URL http, gerar a URL canônica garantida
        if (isCloudinaryEnabled() && !overlayVideoUrl.startsWith('http')) {
          const cName = getCloudinaryStatus().cloudName;
          if (cName) {
            overlayVideoUrl = `https://res.cloudinary.com/${cName}/video/upload/arpagadinho/${expId}/video.mp4`;
          }
        }

        console.log(`[Cloudinary] ✓ Arquivos salvos permanentemente na nuvem com sucesso! Video: ${overlayVideoUrl}`);
      } catch (uploadErr) {
        console.error('[Cloudinary] Falha ao enviar para nuvem:', uploadErr.message);
        warningMessage = `Atenção: A experiência foi salva temporariamente no servidor local, mas o envio permanente para a nuvem falhou (${uploadErr.message}).`;
      }
    } else {
      warningMessage = 'Atenção: O Cloudinary NÃO está ativo no Render. Esta experiência foi salva apenas no disco temporário e será perdida quando o servidor reiniciar!';
      console.warn('[Storage] AVISO: Gravando experiência em modo temporário (sem Cloudinary).');
    }

    const parsedName = (studentName && studentName.trim()) || (title && title.includes(' - ') ? title.split(' - ')[0].trim() : (title ? title.trim() : 'Estudante'));
    const parsedClass = (studentClass && studentClass.trim()) || (title && title.includes(' - ') ? title.split(' - ').slice(1).join(' - ').trim() : '');

    const isPermanent = Boolean(isCloudinaryEnabled() && targetImageUrl.startsWith('http') && overlayVideoUrl.startsWith('http'));

    const newExperience = {
      id: expId,
      title: title || (parsedClass ? `${parsedName} - ${parsedClass}` : parsedName),
      studentName: parsedName,
      studentClass: parsedClass,
      description: description || '',
      targetImageUrl,
      overlayVideoUrl,
      mindTargetUrl,
      model3dUrl,
      model3dScale: model3dScale || '0.35 0.35 0.35',
      customLogoUrl: customLogoUrl || null,
      chromaKey: chromaKey || 'none',
      backdropMode: backdropMode || 'none',
      targetWidth: width,
      targetHeight: height,
      aspectRatio,
      fitMode: fitMode || 'match',
      loop: loop === 'true' || loop === true,
      audioDefault: audioDefault || 'muted',
      isDemo: false,
      isPermanent,
      createdAt: new Date().toISOString()
    };

    const experiences = getExperiences();
    experiences.unshift(newExperience);
    saveExperiences(experiences);

    if (isCloudinaryEnabled()) {
      syncDatabaseToCloudinary(experiences).catch(e => console.warn(e));
    }

    res.status(201).json({
      ...newExperience,
      warning: warningMessage
    });
  } catch (err) {
    console.error('Erro ao criar experiência:', err);
    res.status(500).json({ error: 'Erro interno ao salvar experiência: ' + err.message });
  }
});

// Excluir experiência (Apenas professor)
app.delete('/api/experiences/:id', requireAuthApi, (req, res) => {
  const { id } = req.params;
  const experiences = getExperiences();
  const expIndex = experiences.findIndex(e => e.id === id);

  if (expIndex === -1) {
    return res.status(404).json({ error: 'Experiência não encontrada' });
  }

  const exp = experiences[expIndex];
  experiences.splice(expIndex, 1);
  saveExperiences(experiences);

  if (isCloudinaryEnabled()) {
    syncDatabaseToCloudinary(experiences).catch(e => console.warn(e));
  }

  // Deletar pasta de uploads se não for demo
  if (!exp.isDemo) {
    const dir = path.join(UPLOADS_DIR, id);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Erro ao apagar diretório ${dir}:`, err);
      }
    }
  }

  res.json({ success: true, message: 'Experiência removida com sucesso' });
});

// Atualizar metadados da experiência (Apenas professor - Turma/Sala, Nome do Aluno, Título)
app.patch('/api/experiences/:id', requireAuthApi, (req, res) => {
  const { id } = req.params;
  const { title, studentName, studentClass, description } = req.body;
  const experiences = getExperiences();
  const exp = experiences.find(e => e.id === id);

  if (!exp) {
    return res.status(404).json({ error: 'Experiência não encontrada' });
  }

  if (studentName !== undefined) exp.studentName = String(studentName).trim();
  if (studentClass !== undefined) exp.studentClass = String(studentClass).trim();

  if (title !== undefined && String(title).trim()) {
    exp.title = String(title).trim();
  } else if (studentName !== undefined || studentClass !== undefined) {
    const sName = exp.studentName || 'Estudante';
    exp.title = exp.studentClass ? `${sName} - ${exp.studentClass}` : sName;
  }

  if (description !== undefined) exp.description = String(description).trim();

  if (req.body.customLogoUrl !== undefined) {
    exp.customLogoUrl = req.body.customLogoUrl ? String(req.body.customLogoUrl).trim() : null;
  }

  saveExperiences(experiences);

  if (isCloudinaryEnabled()) {
    syncDatabaseToCloudinary(experiences).catch(e => console.warn(e));
  }

  res.json({ success: true, experience: exp });
});

// Upload ou remoção direta de Logo de uma experiência existente
app.post('/api/experiences/:id/logo', requireAuthApi, upload.single('customLogo'), async (req, res) => {
  try {
    const { id } = req.params;
    const experiences = getExperiences();
    const exp = experiences.find(e => e.id === id);

    if (!exp) {
      return res.status(404).json({ error: 'Experiência não encontrada' });
    }

    if (req.file) {
      let logoUrl = `/uploads/${id}/${req.file.filename}`;
      if (isCloudinaryEnabled()) {
        try {
          const cLogo = await uploadToCloudinary(req.file.path, `arpagadinho/${id}/logo`, 'image');
          if (cLogo) logoUrl = cLogo;
        } catch (e) {
          console.warn('Erro ao enviar logo para Cloudinary:', e.message);
        }
      }
      exp.customLogoUrl = logoUrl;
    } else if (req.body.removeLogo === 'true' || req.body.removeLogo === true) {
      exp.customLogoUrl = null;
    }

    saveExperiences(experiences);

    if (isCloudinaryEnabled()) {
      syncDatabaseToCloudinary(experiences).catch(e => console.warn(e));
    }

    res.json({ success: true, customLogoUrl: exp.customLogoUrl, experience: exp });
  } catch (err) {
    console.error('Erro ao atualizar logo:', err);
    res.status(500).json({ error: 'Erro ao atualizar logo: ' + err.message });
  }
});

// Gerar QR Code para uma experiência
app.get('/api/qrcode/:id', async (req, res) => {
  const { id } = req.params;
  const { format, base, protocol } = req.query;

  const localIp = getLocalIpAddress();
  
  let origin = base;
  if (!origin) {
    if (process.env.RENDER_EXTERNAL_URL) {
      origin = process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    } else {
      const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
      const forwardedProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      
      if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.startsWith('127.') && !forwardedHost.startsWith('10.') && !forwardedHost.startsWith('192.168.')) {
        origin = `${forwardedProto}://${forwardedHost}`;
      } else {
        const proto = protocol || 'https';
        const port = proto === 'https' ? HTTPS_PORT : HTTP_PORT;
        origin = `${proto}://${localIp}:${port}`;
      }
    }
  }

  const targetUrl = `${origin}/view.html?id=${encodeURIComponent(id)}`;

  try {
    if (format === 'png') {
      res.setHeader('Content-Type', 'image/png');
      return QRCode.toFileStream(res, targetUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 400,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    }

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      targetUrl,
      qrDataUrl,
      origin,
      localIp,
      httpsUrl: `${origin}/view.html?id=${encodeURIComponent(id)}`,
      httpUrl: `${origin}/view.html?id=${encodeURIComponent(id)}`,
      desktopUrl: `${origin}/view.html?id=${encodeURIComponent(id)}`
    });
  } catch (err) {
    console.error('Erro ao gerar QR Code:', err);
    res.status(500).json({ error: 'Erro ao gerar QR Code: ' + err.message });
  }
});

// Redirecionamento amigável para o visualizador: /view/:id -> /view.html?id=:id
app.get('/view/:id', (req, res) => {
  res.redirect(`/view.html?id=${encodeURIComponent(req.params.id)}`);
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR (HTTP & HTTPS)
// ==========================================

async function startServers() {
  if (isCloudinaryEnabled()) {
    console.log('☁️ Armazenamento Cloudinary ativo! Sincronizando banco de experiências...');
    await restoreDatabaseFromCloudinary(DATA_FILE);
  }

  seedDemoExperiences();

  const localIp = getLocalIpAddress();

  // Iniciar servidor HTTP padrão
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`✨ Plataforma WebAR ARpagadinho em execução!`);
    console.log(`💻 Estúdio Desktop (Navegador): http://localhost:${HTTP_PORT}`);
    console.log(`📱 Acesso na Rede Local (HTTP): http://${localIp}:${HTTP_PORT}`);
  });

  // Iniciar servidor HTTPS por padrão (essencial para câmera do celular)
  try {
    const certs = await generateCerts();
    const httpsServer = https.createServer(
      {
        key: certs.key,
        cert: certs.cert
      },
      app
    );

    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 Servidor HTTPS Ativo (Obrigatório para câmera no smartphone):`);
      console.log(`📱 Acesso Mobile Seguro: https://${localIp}:${HTTPS_PORT}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.warn('⚠️ Não foi possível iniciar o servidor HTTPS:', err.message);
    console.log(`======================================================\n`);
  }
}

startServers();
