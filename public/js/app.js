/**
 * EyeJack WebAR Platform - Main App Controller
 * Gerencia a listagem, criação interativa com compilador MindAR no browser,
 * modais de QR Code e integração com a API REST.
 */

import { compileTargetImage, loadImageFromFile, renderFeaturePointsVisualization } from './compiler.js';
import { initSchoolMode } from './school-mode.js';

// Estado global da aplicação
const state = {
  experiences: [],
  serverInfo: null,
  currentWizardStep: 1,
  wizardData: {
    imageFile: null,
    imageElement: null,
    imageWidth: 0,
    imageHeight: 0,
    aspectRatio: 1,
    compiledMindBuffer: null,
    featurePointsData: null,
    videoFile: null,
    videoDuration: 0,
    videoWidth: 0,
    videoHeight: 0,
    title: '',
    description: '',
    fitMode: 'match',
    loop: true,
    audioDefault: 'muted',
    chromaKey: 'none',
    model3dFile: null
  }
};

// Elementos DOM
const dom = {
  experiencesList: document.getElementById('experiences-list'),
  emptyState: document.getElementById('empty-state'),
  serverIpBadge: document.getElementById('server-ip-badge'),
  btnNewExperience: document.getElementById('btn-new-experience'),
  
  // Modais
  modalWizard: document.getElementById('modal-wizard'),
  modalQr: document.getElementById('modal-qr'),
  modalCloseButtons: document.querySelectorAll('.modal-close'),
  
  // Wizard Steps
  wizardSteps: document.querySelectorAll('.wizard-step'),
  stepPanels: document.querySelectorAll('.wizard-panel'),
  
  // Step 1: Imagem
  dropzoneImage: document.getElementById('dropzone-image'),
  inputImage: document.getElementById('input-image'),
  previewImageBox: document.getElementById('preview-image-box'),
  previewImageThumb: document.getElementById('preview-image-thumb'),
  previewImageName: document.getElementById('preview-image-name'),
  previewImageMeta: document.getElementById('preview-image-meta'),
  btnStep1Next: document.getElementById('btn-step1-next'),
  
  // Step 2: Compilação MindAR
  btnStartCompile: document.getElementById('btn-start-compile'),
  compileProgressContainer: document.getElementById('compile-progress-container'),
  compileProgressBar: document.getElementById('compile-progress-bar'),
  compileProgressText: document.getElementById('compile-progress-text'),
  compileStatusMsg: document.getElementById('compile-status-msg'),
  canvasFeaturePoints: document.getElementById('canvas-feature-points'),
  featurePointsMeta: document.getElementById('feature-points-meta'),
  btnStep2Next: document.getElementById('btn-step2-next'),
  
  // Step 3: Vídeo
  dropzoneVideo: document.getElementById('dropzone-video'),
  inputVideo: document.getElementById('input-video'),
  previewVideoBox: document.getElementById('preview-video-box'),
  previewVideoPlayer: document.getElementById('preview-video-player'),
  previewVideoName: document.getElementById('preview-video-name'),
  previewVideoMeta: document.getElementById('preview-video-meta'),
  btnStep3Next: document.getElementById('btn-step3-next'),
  
  // Step 4: Configurações & Salvar
  inputTitle: document.getElementById('input-title'),
  inputDescription: document.getElementById('input-description'),
  selectFitMode: document.getElementById('select-fit-mode'),
  checkLoop: document.getElementById('check-loop'),
  selectAudioDefault: document.getElementById('select-audio-default'),
  selectChromaKey: document.getElementById('select-chroma-key'),
  btnSaveExperience: document.getElementById('btn-save-experience'),
  
  // Modal QR Code
  qrTitle: document.getElementById('qr-title'),
  qrImage: document.getElementById('qr-image'),
  qrTargetUrl: document.getElementById('qr-target-url'),
  btnCopyQrUrl: document.getElementById('btn-copy-qr-url'),
  btnDownloadQrPng: document.getElementById('btn-download-qr-png'),
  btnOpenPrintCard: document.getElementById('btn-open-print-card'),
  btnLaunchViewer: document.getElementById('btn-launch-viewer')
};

// ==========================================================================
// Inicialização
// ==========================================================================
async function init() {
  setupEventListeners();
  await loadServerInfo();
  await loadExperiences();
  initSchoolMode();
}

// Configurar event listeners
function setupEventListeners() {
  // Abertura do Wizard
  if (dom.btnNewExperience) {
    dom.btnNewExperience.addEventListener('click', openWizard);
  }

  // Logout do Estúdio
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Deseja realmente sair da área administrativa?')) {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        window.location.href = '/login.html';
      }
    });
  }

  // Fechar modais
  dom.modalCloseButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(dom.modalWizard);
      closeModal(dom.modalQr);
    });
  });

  // Fechar clicando no fundo escuro
  window.addEventListener('click', (e) => {
    if (e.target === dom.modalWizard) closeModal(dom.modalWizard);
    if (e.target === dom.modalQr) closeModal(dom.modalQr);
  });

  // Wizard Step 1: Upload Imagem
  setupDropzone(dom.dropzoneImage, dom.inputImage, handleImageSelected);

  const btnChangeImage = document.getElementById('btn-change-image');
  const btnRemoveImage = document.getElementById('btn-remove-image');
  if (btnChangeImage) {
    btnChangeImage.addEventListener('click', () => dom.inputImage.click());
  }
  if (btnRemoveImage) {
    btnRemoveImage.addEventListener('click', () => {
      state.wizardData.imageFile = null;
      state.wizardData.imageElement = null;
      dom.inputImage.value = '';
      dom.previewImageBox.style.display = 'none';
      dom.dropzoneImage.style.display = 'block';
      dom.btnStep1Next.disabled = true;
    });
  }

  if (dom.btnStep1Next) {
    dom.btnStep1Next.addEventListener('click', () => goToStep(2));
  }

  // Wizard Step 2: Compilação MindAR
  if (dom.btnStartCompile) {
    dom.btnStartCompile.addEventListener('click', startMindCompilation);
  }

  if (dom.btnStep2Next) {
    dom.btnStep2Next.addEventListener('click', () => goToStep(3));
  }

  // Wizard Step 3: Upload Vídeo
  setupDropzone(dom.dropzoneVideo, dom.inputVideo, handleVideoSelected);

  const btnChangeVideo = document.getElementById('btn-change-video');
  const btnRemoveVideo = document.getElementById('btn-remove-video');
  if (btnChangeVideo) {
    btnChangeVideo.addEventListener('click', () => dom.inputVideo.click());
  }
  if (btnRemoveVideo) {
    btnRemoveVideo.addEventListener('click', () => {
      state.wizardData.videoFile = null;
      dom.previewVideoPlayer.src = '';
      dom.inputVideo.value = '';
      dom.previewVideoBox.style.display = 'none';
      dom.dropzoneVideo.style.display = 'block';
      dom.btnStep3Next.disabled = true;
    });
  }

  if (dom.btnStep3Next) {
    dom.btnStep3Next.addEventListener('click', () => goToStep(4));
  }

  // Wizard Step 4: Objeto 3D opcional
  const inputModel3d = document.getElementById('input-model3d');
  const previewModel3dInfo = document.getElementById('preview-model3d-info');
  const model3dName = document.getElementById('model3d-name');

  if (inputModel3d) {
    inputModel3d.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        state.wizardData.model3dFile = file;
        if (model3dName) model3dName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        if (previewModel3dInfo) previewModel3dInfo.style.display = 'block';
      } else {
        state.wizardData.model3dFile = null;
        if (previewModel3dInfo) previewModel3dInfo.style.display = 'none';
      }
    });
  }

  // Wizard Step 4: Salvar Experiência
  if (dom.btnSaveExperience) {
    dom.btnSaveExperience.addEventListener('click', saveExperience);
  }

  // Navegação direta nos steps do Wizard
  dom.wizardSteps.forEach(stepEl => {
    stepEl.addEventListener('click', () => {
      const targetStep = parseInt(stepEl.dataset.step);
      // Só permite navegar para passos anteriores ou passos já concluídos
      if (targetStep < state.currentWizardStep) {
        goToStep(targetStep);
      }
    });
  });

  // Ações do Modal QR Code
  if (dom.btnCopyQrUrl) {
    dom.btnCopyQrUrl.addEventListener('click', () => {
      const url = dom.qrTargetUrl.textContent;
      navigator.clipboard.writeText(url).then(() => {
        const originalText = dom.btnCopyQrUrl.innerHTML;
        dom.btnCopyQrUrl.innerHTML = '✓ Copiado!';
        setTimeout(() => { dom.btnCopyQrUrl.innerHTML = originalText; }, 2000);
      });
    });
  }
}

// Configurar áreas de arrastar e soltar (Drag & Drop)
function setupDropzone(dropzone, input, onFileSelected) {
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFileSelected(files[0]);
    }
  });

  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onFileSelected(input.files[0]);
    }
  });
}

// ==========================================================================
// Carregar Informações do Servidor e Experiências
// ==========================================================================
async function loadServerInfo() {
  try {
    const res = await fetch('/api/info');
    if (res.ok) {
      const data = await res.json();
      state.serverInfo = data;
      if (dom.serverIpBadge) {
        dom.serverIpBadge.innerHTML = `
          <span class="pulse-dot"></span>
          <span>Rede Local: <strong>${data.localIp}</strong></span>
        `;
      }
      updateStorageBanner(data.storageStatus || { enabled: data.cloudinaryEnabled });
    }
  } catch (err) {
    console.warn('Servidor info não disponível:', err);
  }
}

function updateStorageBanner(status) {
  const banner = document.getElementById('cloud-storage-banner');
  const icon = document.getElementById('storage-status-icon');
  const title = document.getElementById('storage-status-title');
  const desc = document.getElementById('storage-status-desc');
  const modal = document.getElementById('modal-cloud-help');
  const btnOpenModal = document.getElementById('btn-open-cloud-modal');
  const btnCloseModal = document.getElementById('modal-cloud-help-close');

  if (!banner) return;

  if (btnOpenModal && modal) {
    btnOpenModal.onclick = () => modal.classList.add('active');
  }
  if (btnCloseModal && modal) {
    btnCloseModal.onclick = () => modal.classList.remove('active');
  }

  if (status && status.enabled) {
    banner.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    banner.style.background = 'rgba(16, 185, 129, 0.08)';
    if (icon) icon.textContent = '☁️';
    if (title) {
      title.innerHTML = `Armazenamento Permanente Conectado <span style="color: #34d399; font-size: 0.8rem; font-weight: normal; margin-left: 0.35rem;">● Nuvem Ativa (${status.cloudName || 'Cloudinary'})</span>`;
    }
    if (desc) {
      desc.textContent = 'Todos os vídeos, fotos e cartões gravados estão salvos de forma definitiva na nuvem e nunca serão perdidos.';
    }
    if (btnOpenModal) btnOpenModal.textContent = 'ℹ️ Detalhes da Nuvem';
  } else {
    banner.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    banner.style.background = 'rgba(239, 68, 68, 0.08)';
    if (icon) icon.textContent = '⚠️';
    if (title) {
      title.innerHTML = `<span style="color: #f87171;">Atenção: Armazenamento em Nuvem Desconectado (Modo Temporário)</span>`;
    }
    if (desc) {
      desc.innerHTML = `O Cloudinary não foi ativado no Render. <strong style="color: #fca5a5;">Qualquer vídeo gravado será apagado caso o site reinicie!</strong>`;
    }
    if (btnOpenModal) {
      btnOpenModal.innerHTML = '⚙️ Como Ativar Nuvem no Render';
      btnOpenModal.className = 'btn btn-primary btn-sm';
      btnOpenModal.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    }
  }
}

async function loadExperiences() {
  try {
    const res = await fetch('/api/experiences');
    if (!res.ok) throw new Error('Falha ao obter experiências');

    state.experiences = await res.json();
    renderExperiencesGrid();
  } catch (err) {
    console.error('Erro ao listar experiências:', err);
    if (dom.experiencesList) {
      dom.experiencesList.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 2rem;">
          Erro ao conectar com o servidor. Verifique se o servidor está rodando.
        </div>
      `;
    }
  }
}

function renderExperiencesGrid() {
  if (!dom.experiencesList) return;

  if (state.experiences.length === 0) {
    dom.experiencesList.innerHTML = '';
    if (dom.emptyState) dom.emptyState.style.display = 'block';
    return;
  }

  if (dom.emptyState) dom.emptyState.style.display = 'none';

  dom.experiencesList.innerHTML = state.experiences.map(exp => {
    const badgeClass = exp.isDemo ? 'badge-demo' : 'badge-custom';
    const badgeText = exp.isDemo ? 'Demonstração' : 'AR Ativo';
    const dateFormatted = new Date(exp.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    return `
      <div class="exp-card" data-id="${exp.id}">
        <div class="exp-media">
          <img src="${exp.targetImageUrl}" alt="${escapeHtml(exp.title)}" loading="lazy">
          <span class="exp-badge ${badgeClass}">${badgeText}</span>
          ${exp.model3dUrl ? `<span class="exp-badge" style="top: auto; bottom: 8px; left: 8px; background: rgba(56, 189, 248, 0.95); color: #020617; font-weight: 800;">🧊 Vídeo + 3D</span>` : ''}
        </div>
        <div class="exp-body">
          <h3 class="exp-title">${escapeHtml(exp.title)}</h3>
          <p class="exp-desc">${escapeHtml(exp.description || 'Sem descrição cadastrada.')}</p>
          <div class="exp-meta">
            <span>📅 ${dateFormatted}</span>
            <span>📐 Proporção: ${exp.aspectRatio ? exp.aspectRatio.toFixed(2) : '1.00'}</span>
          </div>
          <div class="exp-actions">
            <a href="/view.html?id=${exp.id}" target="_blank" class="btn btn-primary btn-sm btn-full">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Abrir WebAR
            </a>
            <button class="btn btn-secondary btn-sm btn-action-qr" data-id="${exp.id}">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
              QR Code
            </button>
            <a href="/print.html?id=${exp.id}" target="_blank" class="btn btn-secondary btn-sm">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              Cartão
            </a>
            ${!exp.isDemo ? `
              <button class="btn btn-danger btn-sm btn-full btn-action-delete" data-id="${exp.id}">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Excluir
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Atribuir handlers aos botões de ação nos cartões
  document.querySelectorAll('.btn-action-qr').forEach(btn => {
    btn.addEventListener('click', () => openQrModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-action-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteExperience(btn.dataset.id));
  });
}

// ==========================================================================
// Wizard Step 1: Upload de Imagem Alvo
// ==========================================================================
async function handleImageSelected(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Por favor, selecione um arquivo de imagem válido (JPG ou PNG).');
    return;
  }

  try {
    const img = await loadImageFromFile(file);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const ratio = height / width;

    state.wizardData.imageFile = file;
    state.wizardData.imageElement = img;
    state.wizardData.imageWidth = width;
    state.wizardData.imageHeight = height;
    state.wizardData.aspectRatio = ratio;

    // Atualizar visualização
    dom.previewImageThumb.src = img.src;
    dom.previewImageName.textContent = file.name;
    dom.previewImageMeta.textContent = `${width} × ${height}px • Proporção: ${ratio.toFixed(2)} • ${(file.size / 1024).toFixed(0)} KB`;
    dom.previewImageBox.style.display = 'flex';
    dom.btnStep1Next.disabled = false;

    // Sugerir título padrão se estiver vazio
    if (!dom.inputTitle.value) {
      dom.inputTitle.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
  } catch (err) {
    alert('Erro ao carregar imagem: ' + err.message);
  }
}

// ==========================================================================
// Wizard Step 2: Compilação MindAR
// ==========================================================================
async function startMindCompilation() {
  if (!state.wizardData.imageElement) {
    alert('Nenhuma imagem selecionada.');
    return;
  }

  dom.btnStartCompile.disabled = true;
  dom.btnStartCompile.textContent = 'Compilando Marcador...';
  dom.compileProgressContainer.style.display = 'block';
  dom.compileProgressBar.style.width = '0%';
  dom.compileProgressText.textContent = '0%';
  dom.compileStatusMsg.textContent = 'Extraindo pontos de interesse e gerando malha de tracking...';

  try {
    const result = await compileTargetImage(state.wizardData.imageElement, (percent) => {
      dom.compileProgressBar.style.width = `${percent.toFixed(1)}%`;
      dom.compileProgressText.textContent = `${percent.toFixed(0)}%`;
    });

    state.wizardData.compiledMindBuffer = result.buffer;
    state.wizardData.featurePointsData = result.dataList;

    // Renderizar pontos de interesse no canvas
    const count = renderFeaturePointsVisualization(
      dom.canvasFeaturePoints,
      state.wizardData.imageElement,
      result.dataList
    );

    dom.canvasFeaturePoints.style.display = 'block';
    dom.featurePointsMeta.textContent = `✓ Marcador compilado com sucesso! ~${count} pontos de tracking detectados.`;
    dom.featurePointsMeta.style.color = 'var(--accent-emerald)';

    dom.compileStatusMsg.textContent = 'Compilação concluída!';
    dom.btnStartCompile.textContent = '✓ Compilação Concluída';
    dom.btnStep2Next.disabled = false;
  } catch (err) {
    console.error('Erro na compilação:', err);
    dom.compileStatusMsg.textContent = 'Erro ao compilar: ' + err.message;
    dom.compileStatusMsg.style.color = '#ef4444';
    dom.btnStartCompile.disabled = false;
    dom.btnStartCompile.textContent = 'Tentar Novamente';
  }
}

// ==========================================================================
// Wizard Step 3: Upload do Vídeo Sobreposto
// ==========================================================================
function handleVideoSelected(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('Por favor, selecione um arquivo de vídeo válido (MP4 ou WebM).');
    return;
  }

  const MAX_VIDEO_SIZE_MB = 35;
  if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
    alert(`⚠️ Vídeo muito pesado (${(file.size / (1024 * 1024)).toFixed(1)} MB)!\n\n` +
          `Para garantir que o WebAR abra instantaneamente no celular dos pais sem travar a rede da escola, ` +
          `o tamanho máximo permitido é de ${MAX_VIDEO_SIZE_MB} MB.\n\n` +
          `💡 Dicas simples para reduzir:\n` +
          `1. Grave o vídeo pelo botão "🔴 Gravar na Hora" do Estúdio (ele já comprime automaticamente para ~8 MB).\n` +
          `2. Envie o vídeo para você mesmo no WhatsApp (o WhatsApp comprime vídeos pesados mantendo ótima qualidade).\n` +
          `3. Ou ajuste a câmera do seu celular para gravar em HD (720p) ou Full HD (1080p).`);
    if (dom.inputVideo) dom.inputVideo.value = '';
    return;
  }

  const videoUrl = URL.createObjectURL(file);
  state.wizardData.videoFile = file;

  dom.previewVideoPlayer.src = videoUrl;
  dom.previewVideoPlayer.onloadedmetadata = () => {
    state.wizardData.videoWidth = dom.previewVideoPlayer.videoWidth;
    state.wizardData.videoHeight = dom.previewVideoPlayer.videoHeight;
    state.wizardData.videoDuration = dom.previewVideoPlayer.duration;

    dom.previewVideoName.textContent = file.name;
    dom.previewVideoMeta.textContent = `${dom.previewVideoPlayer.videoWidth} × ${dom.previewVideoPlayer.videoHeight}px • ${dom.previewVideoPlayer.duration.toFixed(1)}s • ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    dom.previewVideoBox.style.display = 'flex';
    dom.btnStep3Next.disabled = false;
  };
}

// ==========================================================================
// Wizard Step 4: Salvar Experiência Completa
// ==========================================================================
async function saveExperience() {
  const { imageFile, compiledMindBuffer, videoFile, imageWidth, imageHeight } = state.wizardData;

  if (!imageFile || !compiledMindBuffer || !videoFile) {
    alert('Dados incompletos. Certifique-se de carregar a imagem, compilar o marcador e carregar o vídeo.');
    return;
  }

  const title = dom.inputTitle.value.trim() || 'Experiência AR Sem Título';
  const description = dom.inputDescription.value.trim();
  const fitMode = dom.selectFitMode.value;
  const loop = dom.checkLoop.checked;
  const audioDefault = dom.selectAudioDefault.value;
  const chromaKey = dom.selectChromaKey ? dom.selectChromaKey.value : 'none';

  dom.btnSaveExperience.disabled = true;
  dom.btnSaveExperience.innerHTML = `
    <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="4" stroke-dasharray="32" stroke-linecap="round"></circle></svg>
    Salvando e gerando experiência...
  `;

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('targetWidth', imageWidth);
    formData.append('targetHeight', imageHeight);
    formData.append('fitMode', fitMode);
    formData.append('loop', loop);
    formData.append('audioDefault', audioDefault);
    formData.append('chromaKey', chromaKey);

    // Anexar os arquivos
    formData.append('targetImage', imageFile);
    formData.append('overlayVideo', videoFile);

    // Buffer compilado .mind transformado em Blob
    const mindBlob = new Blob([compiledMindBuffer], { type: 'application/octet-stream' });
    formData.append('targetMind', mindBlob, 'targets.mind');

    // Modelo 3D opcional (.glb)
    if (state.wizardData.model3dFile) {
      formData.append('model3d', state.wizardData.model3dFile);
    }

    const res = await fetch('/api/experiences', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Falha ao salvar experiência no servidor.');
    }

    const createdExp = await res.json();
    console.log('Experiência criada com sucesso:', createdExp);

    // Fechar Wizard e recarregar lista
    closeModal(dom.modalWizard);
    resetWizard();
    await loadExperiences();

    // Abrir imediatamente o modal de QR Code para que o criador possa testar!
    openQrModal(createdExp.id);
  } catch (err) {
    console.error('Erro ao salvar:', err);
    alert('Erro ao salvar experiência: ' + err.message);
  } finally {
    dom.btnSaveExperience.disabled = false;
    dom.btnSaveExperience.textContent = '🚀 Concluir & Criar Experiência WebAR';
  }
}

// ==========================================================================
// Navegação do Wizard
// ==========================================================================
function goToStep(stepNumber) {
  state.currentWizardStep = stepNumber;

  // Atualizar indicadores de passo
  dom.wizardSteps.forEach(stepEl => {
    const s = parseInt(stepEl.dataset.step);
    stepEl.classList.remove('active', 'done');
    if (s === stepNumber) stepEl.classList.add('active');
    else if (s < stepNumber) stepEl.classList.add('done');
  });

  // Atualizar painéis
  dom.stepPanels.forEach(panel => {
    panel.style.display = parseInt(panel.dataset.panel) === stepNumber ? 'block' : 'none';
  });
}

function openWizard() {
  resetWizard();
  goToStep(1);
  openModal(dom.modalWizard);
}

function resetWizard() {
  state.currentWizardStep = 1;
  state.wizardData = {
    imageFile: null,
    imageElement: null,
    imageWidth: 0,
    imageHeight: 0,
    aspectRatio: 1,
    compiledMindBuffer: null,
    featurePointsData: null,
    videoFile: null,
    videoDuration: 0,
    videoWidth: 0,
    videoHeight: 0,
    title: '',
    description: '',
    fitMode: 'match',
    loop: true,
    audioDefault: 'muted',
    model3dFile: null
  };

  // Reset inputs e previews
  const inputModel3d = document.getElementById('input-model3d');
  if (inputModel3d) inputModel3d.value = '';
  const previewModel3dInfo = document.getElementById('preview-model3d-info');
  if (previewModel3dInfo) previewModel3dInfo.style.display = 'none';

  if (dom.inputImage) dom.inputImage.value = '';
  if (dom.inputVideo) dom.inputVideo.value = '';
  if (dom.inputTitle) dom.inputTitle.value = '';
  if (dom.inputDescription) dom.inputDescription.value = '';
  if (dom.previewImageBox) dom.previewImageBox.style.display = 'none';
  if (dom.previewVideoBox) dom.previewVideoBox.style.display = 'none';
  if (dom.canvasFeaturePoints) dom.canvasFeaturePoints.style.display = 'none';
  if (dom.compileProgressContainer) dom.compileProgressContainer.style.display = 'none';

  if (dom.btnStep1Next) dom.btnStep1Next.disabled = true;
  if (dom.btnStep2Next) dom.btnStep2Next.disabled = true;
  if (dom.btnStep3Next) dom.btnStep3Next.disabled = true;
  if (dom.btnStartCompile) {
    dom.btnStartCompile.disabled = false;
    dom.btnStartCompile.textContent = '⚡ Iniciar Compilação MindAR';
  }
}

// ==========================================================================
// Exclusão de Experiência
// ==========================================================================
async function deleteExperience(id) {
  const exp = state.experiences.find(e => e.id === id);
  const title = exp ? exp.title : 'esta experiência';

  if (!confirm(`Deseja realmente excluir permanentemente "${title}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/experiences/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Erro ao excluir experiência');

    await loadExperiences();
  } catch (err) {
    alert('Não foi possível excluir: ' + err.message);
  }
}

// ==========================================
// Modal QR Code
// ==========================================
let currentQrExperienceId = null;
let currentQrProtocol = 'https';

async function fetchAndRenderQr(id, protocol = 'https') {
  currentQrExperienceId = id;
  currentQrProtocol = protocol;

  const btnHttps = document.getElementById('btn-qr-proto-https');
  const btnHttp = document.getElementById('btn-qr-proto-http');

  if (btnHttps && btnHttp) {
    if (protocol === 'https') {
      btnHttps.className = 'btn btn-sm btn-primary';
      btnHttp.className = 'btn btn-sm btn-secondary';
    } else {
      btnHttps.className = 'btn btn-sm btn-secondary';
      btnHttp.className = 'btn btn-sm btn-primary';
    }
  }

  try {
    dom.qrTargetUrl.textContent = 'Carregando link...';
    const res = await fetch(`/api/qrcode/${encodeURIComponent(id)}?protocol=${protocol}&base=${encodeURIComponent(window.location.origin)}`);
    if (!res.ok) throw new Error('Erro ao gerar QR Code');

    const data = await res.json();
    dom.qrImage.src = data.qrDataUrl;
    dom.qrTargetUrl.textContent = data.targetUrl;

    // Links de ação
    dom.btnDownloadQrPng.href = `/api/qrcode/${encodeURIComponent(id)}?format=png&protocol=${protocol}&base=${encodeURIComponent(window.location.origin)}`;
    dom.btnDownloadQrPng.download = `qrcode-${id}.png`;

    dom.btnOpenPrintCard.href = `/print.html?id=${encodeURIComponent(id)}`;
    dom.btnLaunchViewer.href = `/view.html?id=${encodeURIComponent(id)}`;
  } catch (err) {
    console.error('Erro ao carregar QR Code:', err);
    dom.qrTargetUrl.textContent = 'Erro ao gerar QR Code: ' + err.message;
  }
}

async function openQrModal(id) {
  const exp = state.experiences.find(e => e.id === id);
  if (!exp) return;

  dom.qrTitle.textContent = exp.title;
  dom.qrImage.src = '';
  openModal(dom.modalQr);

  // Configurar listeners dos botões de protocolo uma vez
  const btnHttps = document.getElementById('btn-qr-proto-https');
  const btnHttp = document.getElementById('btn-qr-proto-http');

  if (btnHttps) {
    btnHttps.onclick = () => fetchAndRenderQr(id, 'https');
  }
  if (btnHttp) {
    btnHttp.onclick = () => fetchAndRenderQr(id, 'http');
  }

  await fetchAndRenderQr(id, 'https');
}

// ==========================================================================
// Utilitários de Modal e DOM
// ==========================================================================
function openModal(modalEl) {
  if (modalEl) modalEl.classList.add('active');
}

function closeModal(modalEl) {
  if (modalEl) modalEl.classList.remove('active');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Executar inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
