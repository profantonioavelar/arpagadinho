const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.UDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.UDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.UDINARY_API_SECRET;

// Auto-configura via process.env.CLOUDINARY_URL se disponível
function isCloudinaryEnabled() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
    (cloudName && apiKey && apiSecret)
  );
}

// Configuração explícita caso fornecido por variáveis separadas
if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

/**
 * Envia um arquivo local para o Cloudinary
 * @param {string} localFilePath Caminho do arquivo no disco
 * @param {string} publicId Nome/identificador no Cloudinary
 * @param {'image'|'video'|'raw'} resourceType Tipo do recurso
 * @returns {Promise<string>} URL segura HTTPS permanente
 */
async function uploadToCloudinary(localFilePath, publicId, resourceType = 'auto') {
  if (!isCloudinaryEnabled()) return null;

  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      public_id: publicId,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true
    });
    return result.secure_url;
  } catch (err) {
    console.error(`[Cloudinary] Erro ao enviar ${localFilePath}:`, err);
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

    const result = await cloudinary.uploader.upload(tempFile, {
      public_id: 'arpagadinho/database/experiences',
      resource_type: 'raw',
      overwrite: true,
      invalidate: true
    });

    try { fs.unlinkSync(tempFile); } catch (e) {}
    console.log('[Cloudinary] Banco de experiências sincronizado na nuvem:', result.secure_url);
    return result.secure_url;
  } catch (err) {
    console.warn('[Cloudinary] Não foi possível sincronizar o banco na nuvem:', err.message);
  }
}

/**
 * Restaura o banco de dados do Cloudinary na inicialização do servidor
 * @param {string} localDbPath Caminho do experiences.json local
 */
async function restoreDatabaseFromCloudinary(localDbPath) {
  if (!isCloudinaryEnabled()) return;

  try {
    let cName = '';
    if (process.env.CLOUDINARY_URL) {
      const match = process.env.CLOUDINARY_URL.match(/@(.+)$/);
      if (match) cName = match[1];
    } else {
      cName = cloudName;
    }

    if (!cName) return;

    const dbUrl = `https://res.cloudinary.com/${cName}/raw/upload/arpagadinho/database/experiences`;
    console.log('[Cloudinary] Verificando backup do banco na nuvem em:', dbUrl);

    const response = await fetch(dbUrl, { method: 'GET', cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[Cloudinary] ✓ Banco restaurado com sucesso! ${data.length} experiências recuperadas.`);
        return data;
      }
    }
  } catch (err) {
    console.log('[Cloudinary] Nenhum banco remoto prévio para restaurar ou erro:', err.message);
  }
}

module.exports = {
  isCloudinaryEnabled,
  uploadToCloudinary,
  syncDatabaseToCloudinary,
  restoreDatabaseFromCloudinary
};
