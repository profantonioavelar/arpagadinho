/**
 * EyeJack WebAR Viewer Controller
 * Gerencia a cena MindAR + A-Frame, sincronização de vídeo, alinhamento 3D,
 * detecção de marcadores físicos e políticas de áudio mobile.
 */

// Estado da visualização
const viewerState = {
  experience: null,
  isTargetFound: false,
  isAudioMuted: true,
  isVideoPlaying: false,
  hasUserInteracted: false
};

// Elementos DOM
const ui = {
  container: document.getElementById('scene-container'),
  statusBadge: document.getElementById('status-badge'),
  statusText: document.getElementById('status-text'),
  reticle: document.getElementById('scanning-reticle'),
  reticleThumb: document.getElementById('reticle-thumb'),
  titleBadge: document.getElementById('title-badge'),
  btnAudio: document.getElementById('btn-audio'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  btnShowArtwork: document.getElementById('btn-show-artwork'),
  modalArtwork: document.getElementById('modal-artwork'),
  artworkModalImg: document.getElementById('artwork-modal-img'),
  modalClose: document.getElementById('modal-artwork-close'),
  errorOverlay: document.getElementById('error-overlay'),
  errorMessage: document.getElementById('error-message')
};

// ==========================================================================
// Inicialização
// ==========================================================================
async function initViewer() {
  setupUiListeners();

  const urlParams = new URLSearchParams(window.location.search);
  const expId = urlParams.get('id');

  if (!expId) {
    showError('ID de experiência não informado na URL. Retorne ao início e selecione uma experiência.');
    return;
  }

  try {
    const res = await fetch(`/api/experiences/${encodeURIComponent(expId)}`);
    if (!res.ok) {
      throw new Error('Experiência não encontrada no servidor.');
    }

    const exp = await res.json();
    viewerState.experience = exp;

    // Atualizar UI básica
    if (ui.titleBadge) ui.titleBadge.textContent = exp.title;
    if (ui.reticleThumb) {
      ui.reticleThumb.src = exp.targetImageUrl;
      ui.reticleThumb.style.display = 'block';
    }
    if (ui.artworkModalImg) {
      ui.artworkModalImg.src = exp.targetImageUrl;
    }

    // Inicializar cena A-Frame e MindAR
    buildAndMountArScene(exp);
  } catch (err) {
    console.error('Erro ao carregar experiência WebAR:', err);
    showError(err.message || 'Falha ao carregar experiência de Realidade Aumentada.');
  }
}

// Configurar listeners da interface do visualizador
function setupUiListeners() {
  // Modal de visualização da imagem física (para testes em tela)
  if (ui.btnShowArtwork) {
    ui.btnShowArtwork.addEventListener('click', () => {
      if (ui.modalArtwork) ui.modalArtwork.classList.add('active');
    });
  }

  if (ui.modalClose) {
    ui.modalClose.addEventListener('click', () => {
      if (ui.modalArtwork) ui.modalArtwork.classList.remove('active');
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === ui.modalArtwork) {
      ui.modalArtwork.classList.remove('active');
    }
  });

  // Controle de Áudio (Unmute / Mute)
  if (ui.btnAudio) {
    ui.btnAudio.addEventListener('click', toggleAudio);
  }

  // Controle de Play / Pause
  if (ui.btnPlayPause) {
    ui.btnPlayPause.addEventListener('click', togglePlayPause);
  }

  // Tratamento de orientação e redimensionamento
  window.addEventListener('resize', () => {
    // Redimensionamento responsivo do retículo
  });
}

// ==========================================================================
// Construção Dinâmica da Cena A-Frame + MindAR
// ==========================================================================
function buildAndMountArScene(exp) {
  // Calcular dimensões do plano 3D do vídeo
  // No MindAR, a largura do marcador é normalizada para 1.0 unidade 3D
  const width = 1.0;
  const height = exp.aspectRatio || (exp.targetHeight / exp.targetWidth) || 1.0;

  console.log(`[WebAR] Configurando plano de vídeo: largura=${width}, altura=${height.toFixed(4)}`);

  // Montar HTML da cena A-Frame
  const sceneHtml = `
    <a-scene
      mindar-image="imageTargetSrc: ${exp.mindTargetUrl}; filterMinCF: 0.0001; filterBeta: 0.001; uiScanning: no; autoStart: true;"
      color-space="sRGB"
      renderer="colorManagement: true, physicallyCorrectLights"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      style="position: fixed; inset: 0; width: 100vw; height: 100vh;">
      
      <a-assets timeout="15000">
        <video id="ar-video-element"
               src="${exp.overlayVideoUrl}"
               preload="auto"
               ${exp.loop ? 'loop="true"' : ''}
               playsinline
               webkit-playsinline
               crossorigin="anonymous"
               muted></video>
        ${exp.model3dUrl ? `<a-asset-item id="model-3d-asset" src="${exp.model3dUrl}"></a-asset-item>` : ''}
      </a-assets>

      <!-- Câmera e Iluminação para 3D -->
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity light="type: ambient; intensity: 1.2;"></a-entity>
      <a-entity light="type: directional; intensity: 0.8;" position="1 2 1"></a-entity>

      <a-entity id="ar-target-entity" mindar-image-target="targetIndex: 0">
        <!-- 1. Plano de Vídeo (ancorado na parede / arte física em Z=0) -->
        <a-plane id="ar-video-plane"
                 src="#ar-video-element"
                 position="0 0 0"
                 width="${width}"
                 height="${height}"
                 rotation="0 0 0"
                 material="shader: flat; transparent: false; opacity: 1.0;"></a-plane>

        ${exp.model3dUrl ? `
        <!-- 2. Objeto 3D Híbrido (flutuando à frente do vídeo em Z=0.22 com rotação suave) -->
        <a-gltf-model id="ar-model-3d"
                      src="#model-3d-asset"
                      position="0 0 0.22"
                      scale="${exp.model3dScale || '0.35 0.35 0.35'}"
                      animation="property: rotation; to: 0 360 0; loop: true; dur: 9000; easing: linear;"></a-gltf-model>
        ` : ''}
      </a-entity>
    </a-scene>
  `;

  ui.container.innerHTML = sceneHtml;

  const sceneEl = ui.container.querySelector('a-scene');
  const targetEntity = ui.container.querySelector('#ar-target-entity');
  const videoEl = ui.container.querySelector('#ar-video-element');

  // Configurar listeners de eventos do MindAR
  setupMindArEvents(sceneEl, targetEntity, videoEl);
}

// ==========================================================================
// Eventos MindAR (Detecção e Perda do Marcador Físico)
// ==========================================================================
function setupMindArEvents(sceneEl, targetEntity, videoEl) {
  if (!targetEntity || !videoEl) return;

  // Carregar vídeo antecipadamente
  videoEl.load();

  // Evento quando a cena está pronta
  sceneEl.addEventListener('renderstart', () => {
    console.log('[WebAR] Cena A-Frame iniciada.');
  });

  // Evento: Marcador detectado pela câmera
  targetEntity.addEventListener('targetFound', () => {
    console.log('[WebAR] 🎯 Marcador encontrado!');
    viewerState.isTargetFound = true;

    // Atualizar badge e retículo
    if (ui.statusBadge) {
      ui.statusBadge.className = 'webar-status-badge status-found';
    }
    if (ui.statusText) {
      ui.statusText.textContent = '✨ Arte detectada! Reproduzindo animação...';
    }
    if (ui.reticle) {
      ui.reticle.classList.add('hidden');
    }

    // Iniciar reprodução do vídeo
    videoEl.play().then(() => {
      viewerState.isVideoPlaying = true;
      updatePlayPauseButtonState(true);
    }).catch(err => {
      console.warn('[WebAR] Autoplay bloqueado pelo navegador:', err);
    });

    // Feedback tátil no mobile (se suportado)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  });

  // Evento: Marcador perdido (saiu do enquadramento da câmera)
  targetEntity.addEventListener('targetLost', () => {
    console.log('[WebAR] 🔍 Marcador perdido.');
    viewerState.isTargetFound = false;

    // Atualizar badge e exibir retículo guia
    if (ui.statusBadge) {
      ui.statusBadge.className = 'webar-status-badge status-hunting';
    }
    if (ui.statusText) {
      ui.statusText.textContent = '🔍 Aponte a câmera para a imagem impressa';
    }
    if (ui.reticle) {
      ui.reticle.classList.remove('hidden');
    }

    // Pausar vídeo para economizar processamento e bateria
    videoEl.pause();
    viewerState.isVideoPlaying = false;
    updatePlayPauseButtonState(false);
  });

  // Capturar possíveis erros de permissão de câmera
  sceneEl.addEventListener('arError', (e) => {
    console.error('[WebAR] Erro de AR:', e);
    showError('Não foi possível acessar a câmera. Verifique as permissões do navegador e se a conexão é segura (HTTPS).');
  });
}

// ==========================================================================
// Controle de Áudio e Políticas de Navegadores Móveis
// ==========================================================================
function toggleAudio() {
  const videoEl = document.querySelector('#ar-video-element');
  if (!videoEl) return;

  viewerState.hasUserInteracted = true;
  videoEl.muted = !videoEl.muted;
  viewerState.isAudioMuted = videoEl.muted;

  if (videoEl.muted) {
    ui.btnAudio.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
      <span>🔇 Ativar Áudio</span>
    `;
    ui.btnAudio.classList.remove('btn-unmute-pulse');
  } else {
    ui.btnAudio.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
      <span>🔊 Som Ativo</span>
    `;
    ui.btnAudio.classList.remove('btn-unmute-pulse');
  }
}

// Controle Manual de Play / Pause
function togglePlayPause() {
  const videoEl = document.querySelector('#ar-video-element');
  if (!videoEl) return;

  if (videoEl.paused) {
    videoEl.play();
    viewerState.isVideoPlaying = true;
    updatePlayPauseButtonState(true);
  } else {
    videoEl.pause();
    viewerState.isVideoPlaying = false;
    updatePlayPauseButtonState(false);
  }
}

function updatePlayPauseButtonState(isPlaying) {
  if (!ui.btnPlayPause) return;

  if (isPlaying) {
    ui.btnPlayPause.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>Pausar</span>
    `;
  } else {
    ui.btnPlayPause.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>Reproduzir</span>
    `;
  }
}

// ==========================================================================
// Tratamento de Erros
// ==========================================================================
function showError(msg) {
  if (ui.errorMessage) ui.errorMessage.textContent = msg;
  if (ui.errorOverlay) ui.errorOverlay.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', initViewer);
