/**
 * EyeJack WebAR Viewer Controller
 * Gerencia a cena MindAR + A-Frame, sincronização de vídeo, alinhamento 3D,
 * detecção de marcadores físicos, Chroma Key / transparência de murais,
 * e captura de fotos e gravação de vídeos WebAR com compartilhamento.
 */

// ==========================================================================
// Registro do Shader Chroma Key no A-Frame
// ==========================================================================
if (typeof AFRAME !== 'undefined' && (!AFRAME.shaders || !AFRAME.shaders['chromakey'])) {
  AFRAME.registerShader('chromakey', {
    schema: {
      src: { type: 'map' },
      color: { default: { x: 0.0, y: 1.0, z: 0.0 }, type: 'vec3' },
      similarity: { default: 0.38, type: 'number' },
      smoothness: { default: 0.12, type: 'number' }
    },
    init: function (data) {
      let videoTexture = null;
      if (data.src) {
        if (data.src instanceof HTMLVideoElement) {
          videoTexture = new THREE.VideoTexture(data.src);
        } else if (typeof data.src === 'string') {
          const el = document.querySelector(data.src);
          if (el) videoTexture = new THREE.VideoTexture(el);
        } else if (data.src.isTexture) {
          videoTexture = data.src;
        }
      }
      if (!videoTexture) {
        const defaultEl = document.querySelector('#ar-video-element');
        if (defaultEl) videoTexture = new THREE.VideoTexture(defaultEl);
      }
      if (videoTexture) {
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.generateMipmaps = false;
      }
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(data.color.x, data.color.y, data.color.z) },
          similarity: { value: data.similarity },
          smoothness: { value: data.smoothness },
          myTexture: { value: videoTexture }
        },
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main(void) {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform float similarity;
          uniform float smoothness;
          uniform sampler2D myTexture;
          varying vec2 vUv;

          // Conversão de RGB para YCbCr para isolamento preciso de verde
          vec3 rgb2ycbcr(vec3 c) {
            float y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
            float cb = (c.b - y) * 0.564 + 0.5;
            float cr = (c.r - y) * 0.713 + 0.5;
            return vec3(y, cb, cr);
          }

          void main(void) {
            vec4 pixelColor = texture2D(myTexture, vUv);
            vec3 keyYCbCr = rgb2ycbcr(color);
            vec3 pixelYCbCr = rgb2ycbcr(pixelColor.rgb);

            float d = distance(keyYCbCr.yz, pixelYCbCr.yz);
            float mask = smoothstep(similarity, similarity + smoothness, d);

            gl_FragColor = vec4(pixelColor.rgb, pixelColor.a * mask);
          }
        `,
        transparent: true
      });
    },
    update: function (data) {
      if (this.material && this.material.uniforms) {
        let videoTexture = null;
        if (data.src) {
          if (data.src instanceof HTMLVideoElement) {
            videoTexture = new THREE.VideoTexture(data.src);
          } else if (typeof data.src === 'string') {
            const el = document.querySelector(data.src);
            if (el) videoTexture = new THREE.VideoTexture(el);
          } else if (data.src.isTexture) {
            videoTexture = data.src;
          }
        }
        if (!videoTexture) {
          const defaultEl = document.querySelector('#ar-video-element');
          if (defaultEl) videoTexture = new THREE.VideoTexture(defaultEl);
        }
        if (videoTexture) {
          videoTexture.minFilter = THREE.LinearFilter;
          videoTexture.generateMipmaps = false;
          this.material.uniforms.myTexture.value = videoTexture;
        }
        if (data.color) {
          this.material.uniforms.color.value = new THREE.Color(data.color.x, data.color.y, data.color.z);
        }
        if (data.similarity !== undefined) {
          this.material.uniforms.similarity.value = data.similarity;
        }
        if (data.smoothness !== undefined) {
          this.material.uniforms.smoothness.value = data.smoothness;
        }
      }
    }
  });
}

// Estado da visualização
const viewerState = {
  experience: null,
  isTargetFound: false,
  isAudioMuted: true,
  isVideoPlaying: false,
  hasUserInteracted: false,
  // Gravação e Captura
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
  recordingTimerId: null,
  recordingSeconds: 0,
  currentCapturedBlob: null,
  currentCapturedType: null, // 'photo' | 'video'
  currentCapturedUrl: null,
  // Modo Cenário Vivo (Pessoa na frente / Chroma Key ao Vivo com IA)
  isLiveSetActive: false,
  selfieSegmentation: null,
  isProcessingSegmentation: false,
  liveSetLoopRunning: false,
  targetLostGraceTimer: null
};

// Elementos DOM
const ui = {
  container: document.getElementById('scene-container'),
  statusBadge: document.getElementById('status-badge'),
  statusText: document.getElementById('status-text'),
  reticle: document.getElementById('scanning-reticle'),
  reticleThumb: document.getElementById('reticle-thumb'),
  studentName: document.getElementById('student-name-display'),
  studentRoom: document.getElementById('student-room-display'),
  titleBadge: document.getElementById('title-badge'),
  btnAudio: document.getElementById('btn-audio'),
  audioIconWrap: document.getElementById('audio-icon-wrap'),
  audioBtnLabel: document.getElementById('audio-btn-label'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playPauseIconWrap: document.getElementById('play-pause-icon-wrap'),
  playPauseBtnLabel: document.getElementById('play-pause-btn-label'),
  btnToggleLiveSet: document.getElementById('btn-toggle-live-set'),
  liveSetBtnText: document.getElementById('live-set-btn-text'),
  modeContainerLiveSet: document.getElementById('mode-container-live-set'),
  personCanvas: document.getElementById('person-foreground-canvas'),
  btnShowArtwork: document.getElementById('btn-show-artwork'),
  modalArtwork: document.getElementById('modal-artwork'),
  artworkModalImg: document.getElementById('artwork-modal-img'),
  modalClose: document.getElementById('modal-artwork-close'),
  errorOverlay: document.getElementById('error-overlay'),
  errorMessage: document.getElementById('error-message'),
  // Tela de Carregamento Imersiva com Logo Customizada
  loadingScreen: document.getElementById('webar-loading-screen'),
  loadingLogoImg: document.getElementById('loading-logo-img'),
  loadingTitle: document.getElementById('loading-title'),
  loadingStudent: document.getElementById('loading-student'),
  loadingStatusMsg: document.getElementById('loading-status-msg'),
  mascotImg: document.getElementById('webar-mascot-img'),
  // Captura & Mídia
  btnTakePhoto: document.getElementById('btn-take-photo'),
  btnRecordVideo: document.getElementById('btn-record-video'),
  recordBtnText: document.getElementById('record-btn-text'),
  cameraFlash: document.getElementById('camera-flash'),
  modalCapturedMedia: document.getElementById('modal-captured-media'),
  modalMediaClose: document.getElementById('modal-media-close'),
  capturedMediaTitle: document.getElementById('captured-media-title'),
  capturedPhotoImg: document.getElementById('captured-photo-img'),
  capturedVideoPlayer: document.getElementById('captured-video-player'),
  btnDownloadMedia: document.getElementById('btn-download-media'),
  btnShareMedia: document.getElementById('btn-share-media'),
  btnRetakeMedia: document.getElementById('btn-retake-media')
};

// ==========================================================================
// Controle da Tela de Carregamento
// ==========================================================================
function hideLoadingScreen() {
  if (ui.loadingScreen && !ui.loadingScreen.classList.contains('fade-out')) {
    ui.loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      ui.loadingScreen.style.display = 'none';
    }, 650);
  }
}

// ==========================================================================
// Helpers de Extração e Ajuste de Retículo
// ==========================================================================
function extractStudentInfo(exp) {
  let name = (exp.studentName || '').trim();
  let room = (exp.studentClass || '').trim();

  if (!name && exp.title) {
    if (exp.title.includes(' - ')) {
      const parts = exp.title.split(' - ');
      name = parts[0].trim();
      if (!room) room = parts.slice(1).join(' - ').trim();
    } else if (exp.title.includes(' • ')) {
      const parts = exp.title.split(' • ');
      name = parts[0].trim();
      if (!room) room = parts.slice(1).join(' • ').trim();
    } else {
      name = exp.title.trim();
    }
  }

  if (!name) name = 'Estudante EMJPa';

  return { name, room };
}

function adjustReticleSize(aspectRatio) {
  if (!ui.reticle) return;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // Expansão lateral ampla para cobrir desenhos/cartões na horizontal
  const maxReticleWidth = Math.min(viewportWidth * 0.95, 540);

  if (aspectRatio && aspectRatio > 0) {
    let calcHeight = maxReticleWidth * aspectRatio;
    const maxAllowedHeight = viewportHeight * 0.58;
    if (calcHeight > maxAllowedHeight) {
      calcHeight = maxAllowedHeight;
      const calcWidth = calcHeight / aspectRatio;
      ui.reticle.style.width = `${Math.round(calcWidth)}px`;
      ui.reticle.style.height = `${Math.round(calcHeight)}px`;
      return;
    }
    ui.reticle.style.width = `${Math.round(maxReticleWidth)}px`;
    ui.reticle.style.height = `${Math.round(calcHeight)}px`;
  } else {
    ui.reticle.style.width = 'min(95vw, 540px)';
    ui.reticle.style.height = 'min(95vw, 540px)';
  }
}

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

    // Atualizar Logo dinâmica da experiência (customizada ou mascote Apagadinho padrão)
    const activeLogo = exp.customLogoUrl || '/assets/mascote_apagadinho.png';
    if (ui.loadingLogoImg) ui.loadingLogoImg.src = activeLogo;
    if (ui.mascotImg) ui.mascotImg.src = activeLogo;

    // Atualizar UI com Nome do Estudante e Sala da EMJPa
    const { name, room } = extractStudentInfo(exp);
    if (ui.studentName) ui.studentName.textContent = name;
    if (ui.loadingTitle) ui.loadingTitle.textContent = exp.title || 'Realidade Aumentada';
    if (ui.loadingStudent) ui.loadingStudent.textContent = room ? `${name} • ${room}` : name;
    const roomDivider = document.getElementById('student-room-divider');
    if (ui.studentRoom) {
      if (room) {
        ui.studentRoom.textContent = room;
        ui.studentRoom.style.display = 'inline-block';
        if (roomDivider) roomDivider.style.display = 'inline-block';
      } else {
        ui.studentRoom.textContent = '';
        ui.studentRoom.style.display = 'none';
        if (roomDivider) roomDivider.style.display = 'none';
      }
    }
    if (ui.titleBadge) ui.titleBadge.textContent = room ? `${name} - ${room}` : name;

    // Configurar tamanho responsivo e proporcional do retículo ampliado
    adjustReticleSize(exp.aspectRatio);

    if (ui.reticleThumb) {
      ui.reticleThumb.src = exp.targetImageUrl;
      ui.reticleThumb.style.display = 'block';
    }
    if (ui.artworkModalImg) {
      ui.artworkModalImg.src = exp.targetImageUrl;
    }

    // Inicializar cena A-Frame e MindAR
    buildAndMountArScene(exp);

    // Exibir o seletor do modo Cenário Vivo apenas para experiências compatíveis
    const isLiveSetSupported = (exp.backdropMode === 'live_set') || (urlParams.get('liveset') === '1');
    if (isLiveSetSupported && ui.modeContainerLiveSet) {
      ui.modeContainerLiveSet.style.display = 'flex';
    }

    // Por padrão o visualizador inicia no modo nativo ultra-nítido a 60 FPS (sem sobreposições).
    // O usuário ativa com 1 toque no botão se houver alguém na frente, ou via ?liveset=1.
    if (urlParams.get('liveset') === '1') {
      console.log('[WebAR] Modo Cenário Vivo habilitado via URL.');
      enableLiveSet(true);
    }
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

  // Controle de Áudio (Unmute / Mute)
  if (ui.btnAudio) {
    ui.btnAudio.addEventListener('click', toggleAudio);
  }

  // Controle de Play / Pause
  if (ui.btnPlayPause) {
    ui.btnPlayPause.addEventListener('click', togglePlayPause);
  }

  // Alternar Cenário Vivo (Pessoa na frente / Chroma Key ao Vivo com IA)
  if (ui.btnToggleLiveSet) {
    ui.btnToggleLiveSet.addEventListener('click', toggleLiveSet);
  }

  // Captura de Foto
  if (ui.btnTakePhoto) {
    ui.btnTakePhoto.addEventListener('click', takeArPhoto);
  }

  // Gravação de Vídeo
  if (ui.btnRecordVideo) {
    ui.btnRecordVideo.addEventListener('click', toggleVideoRecording);
  }

  // Modal de Mídia Capturada
  if (ui.modalMediaClose) {
    ui.modalMediaClose.addEventListener('click', closeCapturedMediaModal);
  }
  if (ui.btnRetakeMedia) {
    ui.btnRetakeMedia.addEventListener('click', closeCapturedMediaModal);
  }
  if (ui.btnDownloadMedia) {
    ui.btnDownloadMedia.addEventListener('click', downloadCapturedMedia);
  }
  if (ui.btnShareMedia) {
    ui.btnShareMedia.addEventListener('click', shareCapturedMedia);
  }

  // Fechar modais ao clicar no fundo escuro
  window.addEventListener('click', (e) => {
    if (e.target === ui.modalArtwork) {
      ui.modalArtwork.classList.remove('active');
    }
    if (e.target === ui.modalCapturedMedia) {
      closeCapturedMediaModal();
    }
  });

  // Tratamento de orientação e redimensionamento do retículo
  window.addEventListener('resize', () => {
    if (viewerState.experience) {
      adjustReticleSize(viewerState.experience.aspectRatio);
    }
  });
}

// ==========================================================================
// Construção Dinâmica da Cena A-Frame + MindAR
// ==========================================================================
function buildAndMountArScene(exp) {
  // No MindAR, a largura do marcador é normalizada para 1.0 unidade 3D
  const width = 1.0;
  const height = exp.aspectRatio || (exp.targetHeight / exp.targetWidth) || 1.0;

  // Configuração do material baseada no modo Chroma Key
  let planeMaterial = 'shader: flat; src: #ar-video-element; transparent: false; opacity: 1.0;';
  const chroma = exp.chromaKey || 'none';

  if (chroma === 'green') {
    planeMaterial = 'shader: chromakey; src: #ar-video-element; color: 0 1 0; similarity: 0.38; smoothness: 0.12; transparent: true;';
  } else if (chroma === 'black') {
    // Efeito Aditivo: Preto fica 100% invisível; luzes, asas douradas, partículas e neon brilham sobre o mural
    planeMaterial = 'shader: flat; src: #ar-video-element; blending: additive; transparent: true; depthWrite: false;';
  } else if (chroma === 'transparent') {
    // Transparência nativa para WebM com canal alfa ou GIF
    planeMaterial = 'shader: flat; src: #ar-video-element; transparent: true; alphaTest: 0.05;';
  }

  console.log(`[WebAR] Configurando cena: largura=${width}, altura=${height.toFixed(4)}, chromaKey=${chroma}`);

  // Montar HTML da cena A-Frame com preserveDrawingBuffer para suporte à captura de foto e vídeo
  // missTolerance: 25 estende a tolerância para pessoas em frente a murais
  const sceneHtml = `
    <a-scene
      mindar-image="imageTargetSrc: ${exp.mindTargetUrl}; filterMinCF: 0.0001; filterBeta: 0.001; missTolerance: 25; uiScanning: no; autoStart: true;"
      color-space="sRGB"
      renderer="preserveDrawingBuffer: true; colorManagement: true; physicallyCorrectLights: true;"
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
                 position="0 0 0"
                 width="${width}"
                 height="${height}"
                 rotation="0 0 0"
                 material="${planeMaterial}"></a-plane>

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
// Eventos MindAR (Detecção, Perda e Tolerância Suave a Oclusão)
// ==========================================================================
function setupMindArEvents(sceneEl, targetEntity, videoEl) {
  if (!targetEntity || !videoEl) return;

  videoEl.load();

  videoEl.addEventListener('error', (e) => {
    console.error('[WebAR] Falha ao carregar o vídeo:', videoEl.error);
    if (ui.statusBadge) {
      ui.statusBadge.className = 'webar-status-badge status-hunting';
    }
    if (ui.statusText) {
      ui.statusText.textContent = '⚠️ Vídeo indisponível (404). Recarregue a página.';
    }
  });

  videoEl.addEventListener('canplay', () => {
    console.log('[WebAR] ✓ Arquivo de vídeo carregado e pronto para exibição.');
  });

  sceneEl.addEventListener('renderstart', () => {
    console.log('[WebAR] Cena A-Frame iniciada.');
  });

  // Evento: MindAR inicializou a câmera e compilou os shaders (Câmera pronta!)
  sceneEl.addEventListener('arReady', () => {
    console.log('[WebAR] ✓ MindAR arReady disparado! Câmera e rastreamento prontos.');
    hideLoadingScreen();
  });

  // Timeout de segurança caso arReady demore ou já tenha sido disparado
  setTimeout(() => {
    hideLoadingScreen();
  }, 3800);

  // Evento: Marcador detectado pela câmera
  targetEntity.addEventListener('targetFound', () => {
    console.log('[WebAR] 🎯 Marcador encontrado!');
    if (viewerState.targetLostGraceTimer) {
      clearTimeout(viewerState.targetLostGraceTimer);
      viewerState.targetLostGraceTimer = null;
    }
    viewerState.isTargetFound = true;

    if (ui.statusBadge) {
      ui.statusBadge.className = 'webar-status-badge status-found';
    }
    if (ui.statusText) {
      ui.statusText.textContent = viewerState.isLiveSetActive ? '✨ Cenário Vivo Sincronizado!' : '✨ Arte detectada!';
    }
    if (ui.reticle) {
      ui.reticle.classList.add('hidden');
    }

    videoEl.play().then(() => {
      viewerState.isVideoPlaying = true;
      updatePlayPauseButtonState(true);
    }).catch(err => {
      console.warn('[WebAR] Autoplay bloqueado pelo navegador:', err);
    });

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  });

  // Evento: Marcador temporariamente fora de vista
  // Tolerância suave de 800ms: absorve movimentos rápidos sem travar a imagem flutuando no chão
  targetEntity.addEventListener('targetLost', () => {
    console.log('[WebAR] 🔍 Marcador momentaneamente ocluso (iniciando tolerância)...');
    if (viewerState.targetLostGraceTimer) clearTimeout(viewerState.targetLostGraceTimer);

    const graceDuration = 800;

    viewerState.targetLostGraceTimer = setTimeout(() => {
      viewerState.targetLostGraceTimer = null;
      console.log('[WebAR] 🔍 Marcador perdido após tolerância.');
      viewerState.isTargetFound = false;

      if (ui.statusBadge) {
        ui.statusBadge.className = 'webar-status-badge status-hunting';
      }
      if (ui.statusText) {
        ui.statusText.textContent = viewerState.isLiveSetActive 
          ? 'Aponte para o mural para sincronizar o cenário' 
          : 'Aponte a câmera para a imagem impressa';
      }
      if (ui.reticle) {
        ui.reticle.classList.remove('hidden');
      }

      videoEl.pause();
      viewerState.isVideoPlaying = false;
      updatePlayPauseButtonState(false);
    }, graceDuration);
  });

  sceneEl.addEventListener('arError', (e) => {
    console.error('[WebAR] Erro de AR:', e);
    hideLoadingScreen();
    showError('Não foi possível acessar a câmera. Verifique as permissões do navegador e se a conexão é segura (HTTPS).');
  });
}

// ==========================================================================
// Módulo Cenário Vivo (Live Virtual Set / Chroma Key Reverso com IA)
// Mantém a pessoa real em 1º plano e o mural animado atrás dela
// ==========================================================================

function toggleLiveSet() {
  enableLiveSet(!viewerState.isLiveSetActive);
}

async function enableLiveSet(enable) {
  viewerState.isLiveSetActive = !!enable;

  if (ui.btnToggleLiveSet) {
    if (viewerState.isLiveSetActive) {
      ui.btnToggleLiveSet.classList.add('is-active');
      if (ui.liveSetBtnText) ui.liveSetBtnText.textContent = 'Cenário Vivo Ativo';
    } else {
      ui.btnToggleLiveSet.classList.remove('is-active');
      if (ui.liveSetBtnText) ui.liveSetBtnText.textContent = 'Cenário Vivo (Pessoa na Frente)';
    }
  }

  if (ui.personCanvas) {
    ui.personCanvas.style.display = viewerState.isLiveSetActive ? 'block' : 'none';
  }

  if (viewerState.isLiveSetActive) {
    console.log('[LiveSet] Modo Cenário Vivo ATIVADO. Inicializando IA...');
    await initSelfieSegmentation();
    startLiveSegmentationLoop();
  } else {
    console.log('[LiveSet] Modo Cenário Vivo DESATIVADO.');
    viewerState.liveSetLoopRunning = false;
    if (ui.personCanvas) {
      const ctx = ui.personCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, ui.personCanvas.width, ui.personCanvas.height);
    }
  }
}

async function initSelfieSegmentation() {
  if (viewerState.selfieSegmentation) return;

  // Fallback caso o script MediaPipe ainda não tenha finalizado o download
  if (typeof SelfieSegmentation === 'undefined') {
    console.log('[LiveSet] Aguardando biblioteca SelfieSegmentation...');
    await new Promise((resolve) => {
      let waitCount = 0;
      const checkInterval = setInterval(() => {
        waitCount++;
        if (typeof SelfieSegmentation !== 'undefined' || waitCount > 30) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  if (typeof SelfieSegmentation === 'undefined') {
    console.warn('[LiveSet] SelfieSegmentation não disponível no navegador.');
    return;
  }

  try {
    const segmenter = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });

    segmenter.setOptions({
      modelSelection: 1, // 1: Landscape (ideal para pessoas em pé/corpo médio em frente a murais)
      selfieMode: false
    });

    segmenter.onResults(onSelfieResults);
    viewerState.selfieSegmentation = segmenter;
    console.log('[LiveSet] ✓ IA de Segmentação inicializada com sucesso!');
  } catch (err) {
    console.error('[LiveSet] Erro ao inicializar SelfieSegmentation:', err);
  }
}

function onSelfieResults(results) {
  if (!viewerState.isLiveSetActive || !ui.personCanvas) return;

  const canvas = ui.personCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const displayW = window.innerWidth;
  const displayH = window.innerHeight;

  if (canvas.width !== displayW || canvas.height !== displayH) {
    canvas.width = displayW;
    canvas.height = displayH;
  }

  const vW = results.image.width || results.image.videoWidth || displayW;
  const vH = results.image.height || results.image.videoHeight || displayH;

  const maskW = (results.segmentationMask && results.segmentationMask.width) ? results.segmentationMask.width : vW;
  const maskH = (results.segmentationMask && results.segmentationMask.height) ? results.segmentationMask.height : vH;

  const screenAspect = displayH / displayW;
  const videoAspect = vH / vW;
  let sW, sH, sX, sY;

  if (videoAspect > screenAspect) {
    sW = vW;
    sH = Math.round(vW * screenAspect);
    sX = 0;
    sY = Math.round((vH - sH) / 2);
  } else {
    sH = vH;
    sW = Math.round(vH / screenAspect);
    sX = Math.round((vW - sW) / 2);
    sY = 0;
  }

  // Escalar as coordenadas de corte proporcionalmente para o tamanho da máscara do MediaPipe
  const scaleX = maskW / vW;
  const scaleY = maskH / vH;
  const msX = Math.round(sX * scaleX);
  const msY = Math.round(sY * scaleY);
  const msW = Math.round(sW * scaleX);
  const msH = Math.round(sH * scaleY);

  ctx.save();
  ctx.clearRect(0, 0, displayW, displayH);

  // 1. Desenha a máscara da silhueta da pessoa com o enquadramento exato
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(results.segmentationMask, msX, msY, msW, msH, 0, 0, displayW, displayH);

  // 2. Isola a pessoa real com 'source-in'
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(results.image, sX, sY, sW, sH, 0, 0, displayW, displayH);

  ctx.restore();
}

function startLiveSegmentationLoop() {
  if (viewerState.liveSetLoopRunning) return;
  viewerState.liveSetLoopRunning = true;

  function findCamera() {
    return Array.from(document.querySelectorAll('video')).find(v => v.id !== 'ar-video-element' && v.videoWidth > 0);
  }

  async function step() {
    if (!viewerState.isLiveSetActive || !viewerState.liveSetLoopRunning) {
      viewerState.liveSetLoopRunning = false;
      return;
    }

    const cameraVideo = findCamera();
    if (cameraVideo && cameraVideo.readyState >= 2 && !cameraVideo.paused && !viewerState.isProcessingSegmentation) {
      if (viewerState.selfieSegmentation) {
        viewerState.isProcessingSegmentation = true;
        try {
          await viewerState.selfieSegmentation.send({ image: cameraVideo });
        } catch (e) {
          // Frame drop tolerado suavemente
        } finally {
          viewerState.isProcessingSegmentation = false;
        }
      }
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ==========================================================================
// Controle de Áudio e Play / Pause
// ==========================================================================
function toggleAudio() {
  const videoEl = document.querySelector('#ar-video-element');
  if (!videoEl) return;

  viewerState.hasUserInteracted = true;
  videoEl.muted = !videoEl.muted;
  viewerState.isAudioMuted = videoEl.muted;

  if (videoEl.muted) {
    if (ui.audioIconWrap) {
      ui.audioIconWrap.innerHTML = `
        <svg class="dock-svg" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
        </svg>
      `;
    }
    if (ui.audioBtnLabel) ui.audioBtnLabel.textContent = 'Som';
    if (ui.btnAudio) ui.btnAudio.classList.add('btn-unmute-pulse');
  } else {
    if (ui.audioIconWrap) {
      ui.audioIconWrap.innerHTML = `
        <svg class="dock-svg" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
        </svg>
      `;
    }
    if (ui.audioBtnLabel) ui.audioBtnLabel.textContent = 'Som';
    if (ui.btnAudio) ui.btnAudio.classList.remove('btn-unmute-pulse');
  }
}

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
    if (ui.playPauseIconWrap) {
      ui.playPauseIconWrap.innerHTML = `
        <svg class="dock-svg" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      `;
    }
    if (ui.playPauseBtnLabel) ui.playPauseBtnLabel.textContent = 'Pausar';
  } else {
    if (ui.playPauseIconWrap) {
      ui.playPauseIconWrap.innerHTML = `
        <svg class="dock-svg" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      `;
    }
    if (ui.playPauseBtnLabel) ui.playPauseBtnLabel.textContent = 'Play';
  }
}

// ==========================================================================
// Captura de Foto e Gravação de Vídeo WebAR
// ==========================================================================

/**
 * Desenha a marca d'água comemorativa do projeto escolar
 */
function drawWatermarkBadge(ctx, w, h) {
  const badgeH = Math.round(h * 0.075);
  const padX = Math.round(w * 0.04);
  const padY = Math.round(h * 0.025);
  const badgeW = w - (padX * 2);
  const badgeY = h - padY - badgeH;
  const radius = Math.round(badgeH * 0.22);

  ctx.save();
  // Fundo translúcido escuro
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(padX, badgeY, badgeW, badgeH, radius);
  } else {
    ctx.rect(padX, badgeY, badgeW, badgeH);
  }
  ctx.fill();
  ctx.stroke();

  // Texto Linha 1: "Projeto UBUNTU — EMJPa 2026"
  const fontSizeL1 = Math.max(16, Math.round(badgeH * 0.35));
  ctx.font = `bold ${fontSizeL1}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText('✨ Projeto UBUNTU — EMJPa 2026', padX + 16, badgeY + (badgeH * 0.16));

  // Texto Linha 2: Aluno e Turma
  const info = extractStudentInfo(viewerState.experience || {});
  const studentText = `🎨 Aluno(a): ${info.name} • ${info.room}`;
  const fontSizeL2 = Math.max(13, Math.round(badgeH * 0.26));
  ctx.font = `500 ${fontSizeL2}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(studentText, padX + 16, badgeY + (badgeH * 0.56));

  ctx.restore();
}

/**
 * Captura um quadro composto em alta definição: Câmera Real + Realidade Aumentada WebGL + Marca d'água
 */
function captureCompositeFrame(targetWidth = 1080) {
  const cameraVideo = Array.from(document.querySelectorAll('video')).find(v => v.id !== 'ar-video-element') || document.querySelector('video');
  const arCanvas = document.querySelector('canvas.a-canvas') || document.querySelector('canvas');

  const screenW = window.innerWidth || 720;
  const screenH = window.innerHeight || 1280;
  const aspect = screenH / screenW;

  const destW = targetWidth;
  const destH = Math.round(destW * aspect);

  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d', { alpha: false });

  // 1. Câmera com object-fit: cover idêntico ao visor do celular
  if (cameraVideo && cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0) {
    const vW = cameraVideo.videoWidth;
    const vH = cameraVideo.videoHeight;
    const vAspect = vH / vW;
    let sW, sH, sX, sY;

    if (vAspect > aspect) {
      sW = vW;
      sH = Math.round(vW * aspect);
      sX = 0;
      sY = Math.round((vH - sH) / 2);
    } else {
      sH = vH;
      sW = Math.round(vH / aspect);
      sX = Math.round((vW - sW) / 2);
      sY = 0;
    }
    ctx.drawImage(cameraVideo, sX, sY, sW, sH, 0, 0, destW, destH);
  } else {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, destW, destH);
  }

  // 2. Sobrepor a cena WebGL A-Frame (Realidade Aumentada)
  if (arCanvas) {
    ctx.drawImage(arCanvas, 0, 0, destW, destH);
  }

  // 3. Sobrepor a pessoa real em primeiro plano se o modo Cenário Vivo estiver ativo
  if (ui.personCanvas && ui.personCanvas.style.display !== 'none' && ui.personCanvas.width > 0) {
    ctx.drawImage(ui.personCanvas, 0, 0, destW, destH);
  }

  // 4. Marca d'água de lembrança comemorativa
  drawWatermarkBadge(ctx, destW, destH);

  return canvas;
}

/**
 * Tira uma foto da Realidade Aumentada
 */
async function takeArPhoto() {
  try {
    // Efeito de flash na tela
    if (ui.cameraFlash) {
      ui.cameraFlash.classList.add('flash-active');
      setTimeout(() => ui.cameraFlash.classList.remove('flash-active'), 200);
    }

    if (navigator.vibrate) {
      navigator.vibrate([40, 20, 40]);
    }

    const canvas = captureCompositeFrame(1080);
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Não foi possível gerar a foto.');
        return;
      }

      viewerState.currentCapturedBlob = blob;
      viewerState.currentCapturedType = 'photo';
      if (viewerState.currentCapturedUrl) {
        URL.revokeObjectURL(viewerState.currentCapturedUrl);
      }
      viewerState.currentCapturedUrl = URL.createObjectURL(blob);

      showCapturedMediaModal('photo', viewerState.currentCapturedUrl);
    }, 'image/jpeg', 0.92);
  } catch (err) {
    console.error('Erro ao tirar foto WebAR:', err);
    alert('Erro ao tirar foto: ' + err.message);
  }
}

/**
 * Alterna entre iniciar ou pausar a gravação de vídeo
 */
function toggleVideoRecording() {
  if (viewerState.isRecording) {
    stopArVideoRecording();
  } else {
    startArVideoRecording();
  }
}

/**
 * Inicia a gravação de vídeo do stream composto
 */
async function startArVideoRecording() {
  try {
    viewerState.recordedChunks = [];
    viewerState.recordingSeconds = 0;

    const screenW = window.innerWidth || 720;
    const screenH = window.innerHeight || 1280;
    const aspect = screenH / screenW;
    const destW = 720;
    const destH = Math.round(destW * aspect);

    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = destW;
    recordCanvas.height = destH;
    const recordCtx = recordCanvas.getContext('2d', { alpha: false });

    // Stream a 25 FPS
    const stream = recordCanvas.captureStream(25);

    // Conectar áudio do vídeo da experiência se estiver reproduzindo
    const arVideo = document.querySelector('#ar-video-element');
    if (arVideo && typeof arVideo.captureStream === 'function') {
      try {
        const audioStream = arVideo.captureStream();
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      } catch (audioErr) {
        console.log('[WebAR] Áudio do vídeo não adicionado ao recorder:', audioErr);
      }
    }

    // Detecção de formato de vídeo suportado
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }
    }

    const options = mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined;
    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        viewerState.recordedChunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      finishVideoRecording(mimeType || 'video/webm');
    };

    viewerState.mediaRecorder = recorder;
    viewerState.isRecording = true;
    recorder.start(200);

    // Loop de renderização frame a frame
    const cameraVideo = Array.from(document.querySelectorAll('video')).find(v => v.id !== 'ar-video-element') || document.querySelector('video');
    const arCanvas = document.querySelector('canvas.a-canvas') || document.querySelector('canvas');

    function renderLoop() {
      if (!viewerState.isRecording) return;

      // 1. Câmera
      if (cameraVideo && cameraVideo.videoWidth > 0) {
        const vW = cameraVideo.videoWidth;
        const vH = cameraVideo.videoHeight;
        const vAspect = vH / vW;
        let sW, sH, sX, sY;

        if (vAspect > aspect) {
          sW = vW;
          sH = Math.round(vW * aspect);
          sX = 0;
          sY = Math.round((vH - sH) / 2);
        } else {
          sH = vH;
          sW = Math.round(vH / aspect);
          sX = Math.round((vW - sW) / 2);
          sY = 0;
        }
        recordCtx.drawImage(cameraVideo, sX, sY, sW, sH, 0, 0, destW, destH);
      } else {
        recordCtx.fillStyle = '#0f172a';
        recordCtx.fillRect(0, 0, destW, destH);
      }

      // 2. AR WebGL
      if (arCanvas) {
        recordCtx.drawImage(arCanvas, 0, 0, destW, destH);
      }

      // 3. Sobrepor a pessoa real em primeiro plano se o modo Cenário Vivo estiver ativo
      if (ui.personCanvas && ui.personCanvas.style.display !== 'none' && ui.personCanvas.width > 0) {
        recordCtx.drawImage(ui.personCanvas, 0, 0, destW, destH);
      }

      // 4. Marca d'água escolar
      drawWatermarkBadge(recordCtx, destW, destH);

      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);

    updateRecordingUi(true, 0);

    // Timer até 15 segundos
    viewerState.recordingTimerId = setInterval(() => {
      viewerState.recordingSeconds++;
      updateRecordingUi(true, viewerState.recordingSeconds);

      if (viewerState.recordingSeconds >= 15) {
        stopArVideoRecording();
      }
    }, 1000);

    if (navigator.vibrate) {
      navigator.vibrate(60);
    }
  } catch (err) {
    console.error('Falha ao iniciar gravação de vídeo WebAR:', err);
    alert('Não foi possível iniciar a gravação de vídeo: ' + err.message);
    viewerState.isRecording = false;
    updateRecordingUi(false, 0);
  }
}

/**
 * Para a gravação de vídeo
 */
function stopArVideoRecording() {
  if (!viewerState.isRecording) return;
  viewerState.isRecording = false;

  if (viewerState.recordingTimerId) {
    clearInterval(viewerState.recordingTimerId);
    viewerState.recordingTimerId = null;
  }

  updateRecordingUi(false, 0);

  if (viewerState.mediaRecorder && viewerState.mediaRecorder.state !== 'inactive') {
    viewerState.mediaRecorder.stop();
  }

  if (navigator.vibrate) {
    navigator.vibrate([30, 40, 30]);
  }
}

function updateRecordingUi(isRecording, seconds) {
  if (!ui.btnRecordVideo || !ui.recordBtnText) return;

  if (isRecording) {
    ui.btnRecordVideo.classList.add('is-recording');
    const formattedSec = String(seconds).padStart(2, '0');
    ui.recordBtnText.textContent = `00:${formattedSec}`;
  } else {
    ui.btnRecordVideo.classList.remove('is-recording');
    ui.recordBtnText.textContent = 'Gravar';
  }
}

function finishVideoRecording(mimeType) {
  const blob = new Blob(viewerState.recordedChunks, { type: mimeType });
  viewerState.currentCapturedBlob = blob;
  viewerState.currentCapturedType = 'video';
  if (viewerState.currentCapturedUrl) {
    URL.revokeObjectURL(viewerState.currentCapturedUrl);
  }
  viewerState.currentCapturedUrl = URL.createObjectURL(blob);

  showCapturedMediaModal('video', viewerState.currentCapturedUrl);
}

// ==========================================================================
// Modal de Mídia Capturada (Foto ou Vídeo) e Ações de Salvar / Compartilhar
// ==========================================================================
function showCapturedMediaModal(type, mediaUrl) {
  if (!ui.modalCapturedMedia) return;

  if (type === 'photo') {
    if (ui.capturedMediaTitle) ui.capturedMediaTitle.textContent = '📸 Sua Foto WebAR';
    if (ui.capturedPhotoImg) {
      ui.capturedPhotoImg.src = mediaUrl;
      ui.capturedPhotoImg.style.display = 'block';
    }
    if (ui.capturedVideoPlayer) {
      ui.capturedVideoPlayer.pause();
      ui.capturedVideoPlayer.style.display = 'none';
    }
  } else {
    if (ui.capturedMediaTitle) ui.capturedMediaTitle.textContent = '🎬 Seu Vídeo WebAR';
    if (ui.capturedPhotoImg) {
      ui.capturedPhotoImg.style.display = 'none';
    }
    if (ui.capturedVideoPlayer) {
      ui.capturedVideoPlayer.src = mediaUrl;
      ui.capturedVideoPlayer.style.display = 'block';
      ui.capturedVideoPlayer.play().catch(() => {});
    }
  }

  ui.modalCapturedMedia.classList.add('active');
}

function closeCapturedMediaModal() {
  if (!ui.modalCapturedMedia) return;
  ui.modalCapturedMedia.classList.remove('active');
  if (ui.capturedVideoPlayer) {
    ui.capturedVideoPlayer.pause();
  }
}

function downloadCapturedMedia() {
  if (!viewerState.currentCapturedUrl) return;
  const info = extractStudentInfo(viewerState.experience || {});
  const safeName = (info.name || 'ubuntu').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const isPhoto = viewerState.currentCapturedType === 'photo';
  const filename = isPhoto ? `foto-ubuntu-${safeName}.jpg` : `video-ubuntu-${safeName}.webm`;

  const a = document.createElement('a');
  a.href = viewerState.currentCapturedUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function shareCapturedMedia() {
  if (!viewerState.currentCapturedBlob) return;

  const info = extractStudentInfo(viewerState.experience || {});
  const isPhoto = viewerState.currentCapturedType === 'photo';
  const ext = isPhoto ? 'jpg' : 'webm';
  const mime = isPhoto ? 'image/jpeg' : 'video/webm';
  const safeName = (info.name || 'ubuntu').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `${isPhoto ? 'foto' : 'video'}-ubuntu-${safeName}.${ext}`;

  const file = new File([viewerState.currentCapturedBlob], filename, { type: mime });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Projeto UBUNTU — EMJPa WebAR',
        text: `Veja essa lembrança em Realidade Aumentada do aluno(a) ${info.name}! ✨`,
        files: [file]
      });
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Erro ao compartilhar nativamente:', err);
      }
    }
  }

  // Fallback: Baixa o arquivo e abre o WhatsApp
  downloadCapturedMedia();
  const textMsg = encodeURIComponent(`Olá! Acabei de registrar a apresentação em Realidade Aumentada do Projeto UBUNTU (${info.name})! Confira na minha galeria! ✨`);
  window.open(`https://api.whatsapp.com/send?text=${textMsg}`, '_blank');
}

// ==========================================================================
// Tratamento de Erros
// ==========================================================================
function showError(msg) {
  if (ui.errorMessage) ui.errorMessage.textContent = msg;
  if (ui.errorOverlay) ui.errorOverlay.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', initViewer);
