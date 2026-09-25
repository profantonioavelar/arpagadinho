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
    console.log(`[Cloudinary] Enviando ${localFilePath} (${resourceType}) para public_id: ${publicId}...`);

    // 1. Tentar upload direto nativo (suporta image, video até 100MB e raw com Promise nativa)
    const result = await cloudinary.uploader.upload(localFilePath, {
      public_id: publicId,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true,
      timeout: 240000
    });

    if (result && result.secure_url) {
      console.log(`[Cloudinary] ✓ Upload direto concluído: ${result.secure_url}`);
      return result.secure_url;
    }
    throw new Error('Upload direto concluído sem secure_url retornada');
  } catch (err) {
    console.warn(`[Cloudinary] Upload direto de ${resourceType} avisou: ${err.message}.`);

    // 2. Se for vídeo grande e falhar no upload direto, tentar upload_large com callback envelopado em Promise
    if (resourceType === 'video') {
      try {
        console.log(`[Cloudinary] Tentando upload_large chunked para ${localFilePath}...`);
        const largeResult = await new Promise((resolve, reject) => {
          // Nota importante: upload_large recebe (path, callback, options)
          cloudinary.uploader.upload_large(localFilePath, (error, res) => {
            if (error) {
              console.error('[Cloudinary] Erro no callback upload_large:', error);
              return reject(error);
            }
            if (!res || !res.secure_url) {
              return reject(new Error('upload_large chunked terminou sem secure_url'));
            }
            resolve(res.secure_url);
          }, {
            public_id: publicId,
            resource_type: 'video',
            overwrite: true,
            invalidate: true,
            chunk_size: 6000000,
            timeout: 300000
          });
        });

        if (largeResult) {
          console.log(`[Cloudinary] ✓ upload_large chunked concluído: ${largeResult}`);
          return largeResult;
        }
      } catch (largeErr) {
        console.error('[Cloudinary] Falha no fallback upload_large:', largeErr.message);
      }
    }
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

          let merged = [...data];
          for (const item of localData) {
            if (!merged.some(e => e.id === item.id)) {
              merged.push(item);
            }
          }

          // Auto-cura de experiências: se o vídeo aponta para /uploads/ mas já foi salvo no Cloudinary, atualizar a URL
          const healed = await healExperiences(merged);
          if (healed) {
            console.log('[Cloudinary] ✓ Experiências recuperadas e reparadas com links permanentes da nuvem!');
            syncDatabaseToCloudinary(merged).catch(() => {});
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

/**
 * Verifica e repara links de experiências que ficaram apontando para o disco local (/uploads/)
 * substituindo por URLs do Cloudinary se o arquivo já existir lá.
 */
async function healExperiences(experiences) {
  if (!Array.isArray(experiences) || !isCloudinaryEnabled()) return false;
  const currentCreds = getCredentials();
  const cName = currentCreds.cloudName;
  if (!cName) return false;

  let changed = false;
  for (const exp of experiences) {
    // 1. Corrigir vídeo local se existir na nuvem
    if (exp.overlayVideoUrl && exp.overlayVideoUrl.startsWith('/uploads/')) {
      const candidateUrls = [
        `https://res.cloudinary.com/${cName}/video/upload/arpagadinho/${exp.id}/video.mp4`,
        `https://res.cloudinary.com/${cName}/video/upload/arpagadinho/${exp.id}/video`
      ];
      for (const candidate of candidateUrls) {
        try {
          const res = await fetch(candidate, { method: 'HEAD' });
          if (res.ok) {
            console.log(`[Cloudinary] ✓ Auto-cura: Atualizado vídeo de "${exp.title}" (${exp.id}) para ${candidate}`);
            exp.overlayVideoUrl = candidate;
            exp.isPermanent = true;
            changed = true;
            break;
          }
        } catch (e) {}
      }
    }

    // 2. Corrigir targets.mind local se existir na nuvem
    if (exp.mindTargetUrl && exp.mindTargetUrl.startsWith('/uploads/')) {
      const candidateMind = `https://res.cloudinary.com/${cName}/raw/upload/arpagadinho/${exp.id}/targets.mind`;
      try {
        const res = await fetch(candidateMind, { method: 'HEAD' });
        if (res.ok) {
          exp.mindTargetUrl = candidateMind;
          changed = true;
        }
      } catch (e) {}
    }

    // 3. Corrigir imagem alvo local se existir na nuvem
    if (exp.targetImageUrl && exp.targetImageUrl.startsWith('/uploads/')) {
      const candidateImg = `https://res.cloudinary.com/${cName}/image/upload/arpagadinho/${exp.id}/image.jpg`;
      try {
        const res = await fetch(candidateImg, { method: 'HEAD' });
        if (res.ok) {
          exp.targetImageUrl = candidateImg;
          changed = true;
        }
      } catch (e) {}
    }
  }

  return changed;
}

module.exports = {
  isCloudinaryEnabled,
  getCloudinaryStatus,
  uploadToCloudinary,
  syncDatabaseToCloudinary,
  restoreDatabaseFromCloudinary,
  healExperiences
};
