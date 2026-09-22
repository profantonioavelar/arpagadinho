const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Resolução flexível de variáveis de ambiente (suporta CLOUDINARY_* e UDINARY_* por tolerância a erros no Render)
function getCredentials() {
  const url = process.env.CLOUDINARY_URL || process.env.UDINARY_URL;
  if (url) {
    let cName = '';
    const match = url.match(/@([^/?#]+)/);
    if (match) cName = match[1];
    return { url, cloudName: cName, apiKey: '', apiSecret: '', isUrl: true };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.UDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.UDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.UDINARY_API_SECRET;

  return { url: null, cloudName, apiKey, apiSecret, isUrl: false };
}

const creds = getCredentials();

function isCloudinaryEnabled() {
  return Boolean(
    creds.url ||
    (creds.cloudName && creds.apiKey && creds.apiSecret)
  );
}

// Configuração do SDK Cloudinary
if (creds.url) {
  cloudinary.config({
    cloudinary_url: creds.url,
    secure: true
  });
} else if (creds.cloudName && creds.apiKey && creds.apiSecret) {
  cloudinary.config({
    cloud_name: creds.cloudName,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    secure: true
  });
}

function getCloudinaryStatus() {
  const currentCreds = getCredentials();
  const enabled = isCloudinaryEnabled();
  return {
    enabled,
    cloudName: currentCreds.cloudName || null,
    storageType: enabled ? 'permanent' : 'ephemeral',
    message: enabled
      ? `Nuvem Cloudinary conectada (${currentCreds.cloudName}). Seus vídeos estão gravados permanentemente.`
      : 'Cloudinary não configurado. Os vídeos e dados sumirão ao reiniciar o servidor Render.'
  };
}

/**
 * Envia um arquivo local para o Cloudinary de forma permanente
 * @param {string} localFilePath Caminho do arquivo no disco
 * @param {string} publicId Nome/identificador no Cloudinary
 * @param {'image'|'video'|'raw'} resourceType Tipo do recurso
 * @returns {Promise<string>} URL segura HTTPS permanente
 */
async function uploadToCloudinary(localFilePath, publicId, resourceType = 'auto') {
  if (!isCloudinaryEnabled()) return null;

  try {
    // Para vídeos grandes (até 40MB), usar upload_large com chunking para evitar timeout de rede
    if (resourceType === 'video') {
      const result = await cloudinary.uploader.upload_large(localFilePath, {
        public_id: publicId,
        resource_type: 'video',
        overwrite: true,
        invalidate: true,
        chunk_size: 6000000, // 6 MB por chunk
        timeout: 180000 // 3 minutos
      });
      return result.secure_url;
    }

    // Para imagens e arquivos raw (.mind, .json, .glb)
    const result = await cloudinary.uploader.upload(localFilePath, {
      public_id: publicId,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true,
      timeout: 120000
    });
    return result.secure_url;
  } catch (err) {
    console.error(`[Cloudinary] Erro ao enviar ${localFilePath} (${resourceType}):`, err.message);
    throw err;
  }
}

/**
 * Sincroniza o banco de dados experiences.json no Cloudinary
 * @param {Array} experiences Lista de experiências
 */
async function syncDatabaseToCloudinary(experiences) {
  if (!isCloudinaryEnabled()) return;

  try {
    const jsonStr = JSON.stringify(experiences, null, 2);
    const tempFile = path.join(__dirname, 'data', 'temp_experiences_sync.json');
    fs.writeFileSync(tempFile, jsonStr, 'utf8');

    // Sincronizar com extensão .json (recomendado) e sem extensão (retrocompatibilidade)
    const [resJson] = await Promise.all([
      cloudinary.uploader.upload(tempFile, {
        public_id: 'arpagadinho/database/experiences.json',
        resource_type: 'raw',
        overwrite: true,
        invalidate: true
      }),
      cloudinary.uploader.upload(tempFile, {
        public_id: 'arpagadinho/database/experiences',
        resource_type: 'raw',
        overwrite: true,
        invalidate: true
      }).catch(() => null)
    ]);

    try { fs.unlinkSync(tempFile); } catch (e) {}
    console.log('[Cloudinary] ✓ Banco de experiências sincronizado na nuvem:', resJson.secure_url);
    return resJson.secure_url;
  } catch (err) {
    console.warn('[Cloudinary] Falha ao sincronizar o banco na nuvem:', err.message);
  }
}

/**
 * Restaura o banco de dados do Cloudinary na inicialização do servidor
 * @param {string} localDbPath Caminho do experiences.json local
 */
async function restoreDatabaseFromCloudinary(localDbPath) {
  if (!isCloudinaryEnabled()) return;

  const currentCreds = getCredentials();
  const cName = currentCreds.cloudName;
  if (!cName) return;

  console.log(`[Cloudinary] Buscando backup do banco de experiências na nuvem (${cName})...`);

  // URLs possíveis para o banco de dados
  const candidateUrls = [
    `https://res.cloudinary.com/${cName}/raw/upload/arpagadinho/database/experiences.json`,
    `https://res.cloudinary.com/${cName}/raw/upload/arpagadinho/database/experiences`
  ];

  // Estratégia 1: Tentar via Cloudinary Admin SDK para obter a URL autenticada e versionada
  try {
    if (creds.apiKey && creds.apiSecret) {
      const resource = await cloudinary.api.resource('arpagadinho/database/experiences.json', { resource_type: 'raw' })
        .catch(() => cloudinary.api.resource('arpagadinho/database/experiences', { resource_type: 'raw' }))
        .catch(() => null);

      if (resource && resource.secure_url) {
        candidateUrls.unshift(resource.secure_url);
      }
    }
  } catch (apiErr) {
    console.log('[Cloudinary] Admin API não disponível, usando consulta HTTP direta:', apiErr.message);
  }

  // Estratégia 2: Testar cada URL candidata
  for (const url of candidateUrls) {
    try {
      console.log('[Cloudinary] Tentando recuperar banco em:', url);
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Fazer merge defensivo com o arquivo local
          let localData = [];
          try {
            if (fs.existsSync(localDbPath)) {
              localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8') || '[]');
            }
          } catch (e) {}

          const merged = [...data];
          for (const item of localData) {
            if (!merged.some(e => e.id === item.id)) {
              merged.push(item);
            }
          }

          fs.writeFileSync(localDbPath, JSON.stringify(merged, null, 2), 'utf8');
          console.log(`[Cloudinary] ✓ Sucesso! Banco restaurado da nuvem com ${merged.length} experiências recuperadas.`);
          return merged;
        }
      }
    } catch (fetchErr) {
      // Tentar próxima URL
    }
  }

  console.log('[Cloudinary] Nenhum banco de dados prévio encontrado na nuvem para restauração.');
}

module.exports = {
  isCloudinaryEnabled,
  getCloudinaryStatus,
  uploadToCloudinary,
  syncDatabaseToCloudinary,
  restoreDatabaseFromCloudinary
};
