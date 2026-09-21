/**
 * MindAR In-Browser Target Compiler
 * Responsável por compilar imagens alvo em arquivos binários .mind
 * diretamente no navegador do usuário utilizando WebGL e WASM.
 */

let MindARCompilerModule = null;

/**
 * Carrega dinamicamente o módulo do compilador MindAR via CDN
 */
export async function loadMindARCompiler() {
  if (MindARCompilerModule) return MindARCompilerModule;

  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
    MindARCompilerModule = mod.Compiler || window.MINDAR?.IMAGE?.Compiler;
    if (!MindARCompilerModule) {
      throw new Error('Classe Compiler não encontrada no bundle do MindAR.');
    }
    return MindARCompilerModule;
  } catch (err) {
    console.error('Falha ao carregar o compilador MindAR:', err);
    throw new Error('Não foi possível carregar a biblioteca do compilador MindAR. Verifique sua conexão com a internet.');
  }
}

/**
 * Carrega um objeto File ou Blob em um elemento HTMLImageElement
 * @param {File|Blob} file 
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao carregar a imagem selecionada. Formato inválido ou corrompido.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Compila a imagem alvo em buffer .mind com relatório de progresso
 * @param {HTMLImageElement} imgElement 
 * @param {Function} onProgress (percent: number) => void
 * @returns {Promise<{ buffer: Uint8Array, dataList: Array, width: number, height: number, aspectRatio: number }>}
 */
export async function compileTargetImage(imgElement, onProgress = () => {}) {
  const CompilerClass = await loadMindARCompiler();
  const compiler = new CompilerClass();

  const width = imgElement.naturalWidth || imgElement.width;
  const height = imgElement.naturalHeight || imgElement.height;
  const aspectRatio = height / width;

  console.log(`[MindAR Compiler] Iniciando compilação: ${width}x${height}, proporção: ${aspectRatio.toFixed(4)}`);

  const startTime = Date.now();

  // Executar compilação com callback de progresso
  const dataList = await compiler.compileImageTargets([imgElement], (progress) => {
    const percent = Math.min(100, Math.max(0, progress));
    onProgress(percent);
  });

  const durationMs = Date.now() - startTime;
  console.log(`[MindAR Compiler] Compilação concluída em ${(durationMs / 1000).toFixed(2)}s`);

  // Exportar os dados binários do marcador (.mind)
  const buffer = await compiler.exportData();

  return {
    buffer,
    dataList,
    width,
    height,
    aspectRatio
  };
}

/**
 * Desenha visualização dos pontos de interesse (feature points) detectados sobre a imagem
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} imgElement
 * @param {Array} dataList
 */
export function renderFeaturePointsVisualization(canvas, imgElement, dataList) {
  if (!canvas || !imgElement || !dataList || dataList.length === 0) return;

  const ctx = canvas.getContext('2d');
  const w = imgElement.naturalWidth || imgElement.width;
  const h = imgElement.naturalHeight || imgElement.height;

  canvas.width = w;
  canvas.height = h;

  // Desenhar a imagem base com leve esmaecimento para destacar os pontos
  ctx.drawImage(imgElement, 0, 0, w, h);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(0, 0, w, h);

  const targetData = dataList[0];
  let pointsCount = 0;

  // 1. Pontos de tracking
  if (targetData.trackingData && targetData.trackingData[0] && targetData.trackingData[0].points) {
    const points = targetData.trackingData[0].points;
    pointsCount += points.length;

    ctx.fillStyle = '#10b981'; // Verde esmeralda brilhante
    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Pontos de correspondência KPM (maxima e minima)
  if (targetData.matchingData && targetData.matchingData[0]) {
    const md = targetData.matchingData[0];
    const kpmPoints = [...(md.maximaPoints || []), ...(md.minimaPoints || [])];
    pointsCount += kpmPoints.length;

    ctx.fillStyle = '#06b6d4'; // Ciano neon
    for (const pt of kpmPoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  console.log(`[MindAR Compiler] Visualização gerada com ~${pointsCount} pontos de interesse.`);
  return pointsCount;
}
