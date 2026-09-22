/**
 * EyeJack WebAR Platform - Modo Escolar & Exposição
 * Gerencia importação de alunos via planilha (Excel/CSV), captura de foto da arte ao vivo,
 * gravação de vídeo na hora (MediaRecorder) e geração de plaquinhas A4 customizáveis.
 */

import { compileTargetImage, loadImageFromFile } from './compiler.js';

// Estado global do Modo Escolar
export const schoolState = {
  students: [],
  activeStudentIndex: null,
  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordingTimerInterval: null,
  recordingSeconds: 0,
  currentFacingMode: 'environment', // 'environment' (traseira) ou 'user' (frontal)
  isProcessingBatch: false
};

// Elementos DOM do Modo Escolar
const el = {
  tabSchool: document.getElementById('tab-btn-school'),
  tabStudio: document.getElementById('tab-btn-studio'),
  sectionSchool: document.getElementById('section-school-mode'),
  sectionStudio: document.getElementById('section-studio-mode'),
  
  // Planilha
  dropzoneSpreadsheet: document.getElementById('dropzone-spreadsheet'),
  inputSpreadsheet: document.getElementById('input-spreadsheet'),
  btnDownloadTemplate: document.getElementById('btn-download-template'),
  
  // Tabela / Lista de Alunos
  studentsListContainer: document.getElementById('school-students-list'),
  studentsCountBadge: document.getElementById('school-students-count'),
  btnBatchCompile: document.getElementById('btn-batch-compile'),
  btnPrintBatch: document.getElementById('btn-print-batch'),
  batchProgressContainer: document.getElementById('batch-progress-container'),
  batchProgressBar: document.getElementById('batch-progress-bar'),
  batchProgressText: document.getElementById('batch-progress-text'),
  batchStatusLabel: document.getElementById('batch-status-label'),
  
  // Configurações da Exposição (Passo 4 Customizável)
  inputSchoolName: document.getElementById('school-name-input'),
  inputExpoName: document.getElementById('expo-name-input'),
  inputInstructions: document.getElementById('expo-instructions-input'),
  selectBatchLayout: document.getElementById('batch-layout-select'),
  checkShowThumbs: document.getElementById('batch-show-thumbs'),
  
  // Modal de Captura de Foto ao Vivo
  modalPhoto: document.getElementById('modal-live-photo'),
  videoPhotoPreview: document.getElementById('video-photo-preview'),
  canvasPhotoCapture: document.getElementById('canvas-photo-capture'),
  btnSnapPhoto: document.getElementById('btn-snap-photo'),
  btnRetakePhoto: document.getElementById('btn-retake-photo'),
  btnConfirmPhoto: document.getElementById('btn-confirm-photo'),
  btnSwitchCameraPhoto: document.getElementById('btn-switch-camera-photo'),
  photoStudentNameBadge: document.getElementById('photo-student-name-badge'),
  
  // Modal de Gravação de Vídeo ao Vivo
  modalVideo: document.getElementById('modal-live-video'),
  videoRecordPreview: document.getElementById('video-record-preview'),
  videoRecordedPlayback: document.getElementById('video-recorded-playback'),
  btnStartRecord: document.getElementById('btn-start-record'),
  btnStopRecord: document.getElementById('btn-stop-record'),
  btnRetakeRecord: document.getElementById('btn-retake-record'),
  btnConfirmRecord: document.getElementById('btn-confirm-record'),
  btnSwitchCameraVideo: document.getElementById('btn-switch-camera-video'),
  recordTimerBadge: document.getElementById('record-timer-badge'),
  recordCountdownOverlay: document.getElementById('record-countdown-overlay'),
  videoStudentNameBadge: document.getElementById('video-student-name-badge'),
  
  // Inputs ocultos para upload tradicional por arquivo
  hiddenPhotoInput: document.getElementById('hidden-student-photo-input'),
  hiddenVideoInput: document.getElementById('hidden-student-video-input')
};

// ==========================================================================
// Inicialização do Modo Escolar
// ==========================================================================
export function initSchoolMode() {
  setupSchoolNavigation();
  setupSpreadsheetImport();
  setupLiveCaptureModals();
  loadSavedSchoolSession();
}

function setupSchoolNavigation() {
  if (el.tabSchool && el.tabStudio) {
    el.tabSchool.addEventListener('click', () => switchMainTab('school'));
    el.tabStudio.addEventListener('click', () => switchMainTab('studio'));
  }

  // Se a URL contiver #modo-escolar, abrir direto
  if (window.location.hash === '#modo-escolar') {
    switchMainTab('school');
  }

  // Ações de impressão e compilação em lote
  if (el.btnBatchCompile) {
    el.btnBatchCompile.addEventListener('click', startBatchProcessing);
  }

  if (el.btnPrintBatch) {
    el.btnPrintBatch.addEventListener('click', openBatchPrintPage);
  }
}

function switchMainTab(tab) {
  if (tab === 'school') {
    el.tabSchool.classList.add('active');
    el.tabStudio.classList.remove('active');
    el.sectionSchool.style.display = 'block';
    el.sectionStudio.style.display = 'none';
    window.location.hash = 'modo-escolar';
  } else {
    el.tabStudio.classList.add('active');
    el.tabSchool.classList.remove('active');
    el.sectionStudio.style.display = 'block';
    el.sectionSchool.style.display = 'none';
    history.replaceState(null, null, ' ');
  }
}

// ==========================================================================
// Importação de Planilha (Excel .xlsx / CSV via SheetJS)
// ==========================================================================
function setupSpreadsheetImport() {
  // Download do Modelo de Planilha
  if (el.btnDownloadTemplate) {
    el.btnDownloadTemplate.addEventListener('click', downloadTemplateSpreadsheet);
  }

  // Dropzone de Planilha
  if (el.dropzoneSpreadsheet && el.inputSpreadsheet) {
    el.dropzoneSpreadsheet.addEventListener('click', () => el.inputSpreadsheet.click());

    ['dragenter', 'dragover'].forEach(name => {
      el.dropzoneSpreadsheet.addEventListener(name, (e) => {
        e.preventDefault();
        el.dropzoneSpreadsheet.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      el.dropzoneSpreadsheet.addEventListener(name, (e) => {
        e.preventDefault();
        el.dropzoneSpreadsheet.classList.remove('dragover');
      });
    });

    el.dropzoneSpreadsheet.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        parseSpreadsheetFile(e.dataTransfer.files[0]);
      }
    });

    el.inputSpreadsheet.addEventListener('change', () => {
      if (el.inputSpreadsheet.files && el.inputSpreadsheet.files.length > 0) {
        parseSpreadsheetFile(el.inputSpreadsheet.files[0]);
      }
    });
  }
}

// Gerar e baixar arquivo modelo de planilha Excel (.xlsx)
function downloadTemplateSpreadsheet() {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX ainda carregando. Aguarde 2 segundos e tente novamente.');
    return;
  }

  const sampleData = [
    { 'Nome do Aluno': 'Ana Clara Souza', 'Turma': '2º Ano B', 'Título do Trabalho': 'O Jardim Secreto' },
    { 'Nome do Aluno': 'Bernardo Lima', 'Turma': '2º Ano B', 'Título do Trabalho': 'Foguete Espacial' },
    { 'Nome do Aluno': 'Carlos Eduardo Santos', 'Turma': '2º Ano B', 'Título do Trabalho': 'O Dinossauro Amigo' },
    { 'Nome do Aluno': 'Isabela Martins', 'Turma': '2º Ano B', 'Título do Trabalho': 'Meu Bicho de Estimação' }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');

  XLSX.writeFile(wb, 'modelo_alunos_exposicao.xlsx');
}

// Leitura da Planilha do Usuário
function parseSpreadsheetFile(file) {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX não encontrada. Verifique sua conexão com a internet.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonRows || jsonRows.length === 0) {
        alert('A planilha selecionada está vazia.');
        return;
      }

      // Normalizar linhas
      const newStudents = jsonRows.map((row, index) => {
        // Encontrar chaves de nome, turma e título independentemente de maiúsculas/minúsculas
        const keys = Object.keys(row);
        const nameKey = keys.find(k => /nome|aluno|estudante/i.test(k)) || keys[0];
        const classKey = keys.find(k => /turma|ano|s[eé]rie|classe/i.test(k)) || keys[1];
        const titleKey = keys.find(k => /t[ií]tulo|obra|arte|trabalho|tema/i.test(k)) || keys[2];

        return {
          id: `student_${Date.now()}_${index}`,
          name: row[nameKey] ? String(row[nameKey]).trim() : `Aluno ${index + 1}`,
          studentClass: row[classKey] ? String(row[classKey]).trim() : 'Turma Única',
          title: row[titleKey] ? String(row[titleKey]).trim() : 'Arte em Realidade Aumentada',
          photoFile: null,
          photoImg: null,
          photoUrl: null,
          videoFile: null,
          videoUrl: null,
          status: 'pending', // 'pending', 'ready_to_compile', 'compiled'
          experienceId: null,
          qrDataUrl: null
        };
      });

      schoolState.students = newStudents;
      renderStudentsList();
      saveSchoolSession();

      alert(`✓ ${newStudents.length} alunos importados com sucesso da planilha!`);
    } catch (err) {
      console.error('Erro ao ler planilha:', err);
      alert('Erro ao processar planilha: ' + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

// ==========================================================================
// Renderização da Tabela / Cartões de Alunos
// ==========================================================================
function renderStudentsList() {
  if (!el.studentsListContainer) return;

  const count = schoolState.students.length;
  if (el.studentsCountBadge) {
    el.studentsCountBadge.textContent = `${count} aluno(s)`;
  }

  if (count === 0) {
    el.studentsListContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        Nenhum aluno carregado. Suba uma planilha ou clique em "Baixar Modelo" para começar!
      </div>
    `;
    if (el.btnBatchCompile) el.btnBatchCompile.disabled = true;
    if (el.btnPrintBatch) el.btnPrintBatch.disabled = true;
    return;
  }

  let readyCount = 0;
  let compiledCount = 0;

  el.studentsListContainer.innerHTML = schoolState.students.map((st, idx) => {
    const hasPhoto = !!(st.photoImg || st.photoUrl);
    const hasVideo = !!(st.videoFile || st.videoUrl);

    if (st.status === 'compiled') compiledCount++;
    else if (hasPhoto && hasVideo) {
      st.status = 'ready_to_compile';
      readyCount++;
    }

    let statusHtml = '';
    if (st.status === 'compiled') {
      statusHtml = '<span class="school-badge badge-success">✓ AR Pronto</span>';
    } else if (hasPhoto && hasVideo) {
      statusHtml = '<span class="school-badge badge-warning">Pronto p/ Gerar</span>';
    } else {
      statusHtml = '<span class="school-badge badge-pending">Pendente</span>';
    }

    return `
      <div class="school-student-row" data-index="${idx}">
        <div class="student-info-col">
          <div class="student-name">${escapeHtml(st.name)}</div>
          <div class="student-meta">${escapeHtml(st.studentClass)} • <em>"${escapeHtml(st.title)}"</em></div>
          <div style="margin-top: 4px;">${statusHtml}</div>
        </div>

        <!-- Coluna Foto do Desenho -->
        <div class="student-media-col">
          <span class="media-col-label">1. Desenho / Arte:</span>
          ${hasPhoto ? `
            <div class="media-preview-mini">
              <img src="${st.photoUrl || st.photoImg.src}" alt="Desenho">
              <div class="media-preview-actions">
                <button type="button" class="btn-mini-action" onclick="window.schoolActions.triggerPhotoUpload(${idx})" title="Trocar arquivo de imagem">📁 Trocar</button>
                <button type="button" class="btn-mini-action" onclick="window.schoolActions.openPhotoModal(${idx})" title="Fotografar novamente">📷 Foto</button>
                <button type="button" class="btn-mini-action btn-mini-danger" onclick="window.schoolActions.clearPhoto(${idx})" title="Apagar desenho deste aluno">🗑️ Apagar</button>
              </div>
            </div>
          ` : `
            <div class="btn-group-media">
              <button class="btn btn-sm btn-primary" onclick="window.schoolActions.openPhotoModal(${idx})">
                📷 Fotografar na Hora
              </button>
              <button class="btn btn-sm btn-secondary" onclick="window.schoolActions.triggerPhotoUpload(${idx})">
                📁 Arquivo
              </button>
            </div>
          `}
        </div>

        <!-- Coluna Vídeo da Criança -->
        <div class="student-media-col">
          <span class="media-col-label">2. Vídeo da Criança:</span>
          ${hasVideo ? `
            <div class="media-preview-mini">
              <video src="${st.videoUrl}" controls playsinline></video>
              <div class="media-preview-actions">
                <button type="button" class="btn-mini-action" onclick="window.schoolActions.triggerVideoUpload(${idx})" title="Trocar arquivo de vídeo">📁 Trocar</button>
                <button type="button" class="btn-mini-action" onclick="window.schoolActions.openVideoModal(${idx})" title="Gravar novamente pela câmera">🔴 Gravar</button>
                <button type="button" class="btn-mini-action btn-mini-danger" onclick="window.schoolActions.clearVideo(${idx})" title="Apagar vídeo deste aluno">🗑️ Apagar</button>
              </div>
            </div>
          ` : `
            <div class="btn-group-media">
              <button class="btn btn-sm btn-danger-record" onclick="window.schoolActions.openVideoModal(${idx})">
                🔴 Gravar na Hora
              </button>
              <button class="btn btn-sm btn-secondary" onclick="window.schoolActions.triggerVideoUpload(${idx})">
                📁 Arquivo
              </button>
            </div>
          `}
        </div>

        <!-- Ações do Aluno -->
        <div class="student-action-col">
          ${st.status === 'compiled' ? `
            <a href="/view.html?id=${st.experienceId}" target="_blank" class="btn btn-sm btn-primary" title="Testar WebAR">
              📱 Ver AR
            </a>
          ` : ''}
          <button class="btn-remove-student" onclick="window.schoolActions.removeStudent(${idx})" title="Remover Aluno">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Atualizar botões de ação globais
  if (el.btnBatchCompile) {
    el.btnBatchCompile.disabled = readyCount === 0 && compiledCount === 0;
  }
  if (el.btnPrintBatch) {
    el.btnPrintBatch.disabled = compiledCount === 0;
  }
}

// Expor ações da janela para os botões inline do HTML
window.schoolActions = {
  openPhotoModal: (idx) => openLivePhotoModal(idx),
  openVideoModal: (idx) => openLiveVideoModal(idx),
  triggerPhotoUpload: (idx) => {
    schoolState.activeStudentIndex = idx;
    if (el.hiddenPhotoInput) {
      el.hiddenPhotoInput.value = '';
      el.hiddenPhotoInput.click();
    }
  },
  triggerVideoUpload: (idx) => {
    schoolState.activeStudentIndex = idx;
    if (el.hiddenVideoInput) {
      el.hiddenVideoInput.value = '';
      el.hiddenVideoInput.click();
    }
  },
  clearPhoto: (idx) => {
    const student = schoolState.students[idx];
    if (student && confirm(`Deseja remover o desenho de "${student.name}"?`)) {
      student.photoFile = null;
      student.photoImg = null;
      student.photoUrl = null;
      student.status = 'pending';
      renderStudentsList();
      saveSchoolSession();
    }
  },
  clearVideo: (idx) => {
    const student = schoolState.students[idx];
    if (student && confirm(`Deseja remover o vídeo de "${student.name}"?`)) {
      student.videoFile = null;
      student.videoUrl = null;
      if (student.status === 'compiled') {
        student.status = (student.photoFile || student.photoUrl) ? 'ready' : 'pending';
      }
      renderStudentsList();
      saveSchoolSession();
    }
  },
  removeStudent: (idx) => {
    if (confirm(`Remover "${schoolState.students[idx].name}" da lista?`)) {
      schoolState.students.splice(idx, 1);
      renderStudentsList();
      saveSchoolSession();
    }
  }
};

// ==========================================================================
// Captura de Foto ao Vivo da Arte (Webcam / Smartphone)
// ==========================================================================
function setupLiveCaptureModals() {
  // Configurar input oculto para upload tradicional de foto
  if (el.hiddenPhotoInput) {
    el.hiddenPhotoInput.addEventListener('change', async () => {
      if (el.hiddenPhotoInput.files && el.hiddenPhotoInput.files[0]) {
        const file = el.hiddenPhotoInput.files[0];
        const student = schoolState.students[schoolState.activeStudentIndex];
        if (student) {
          student.photoFile = file;
          student.photoImg = await loadImageFromFile(file);
          student.photoUrl = student.photoImg.src;
          if (student.videoFile || student.videoUrl) {
            student.status = 'ready';
          }
          renderStudentsList();
          saveSchoolSession();
        }
        el.hiddenPhotoInput.value = '';
      }
    });
  }

  // Configurar input oculto para upload tradicional de vídeo
  if (el.hiddenVideoInput) {
    el.hiddenVideoInput.addEventListener('change', () => {
      if (el.hiddenVideoInput.files && el.hiddenVideoInput.files[0]) {
        const file = el.hiddenVideoInput.files[0];
        
        // Validação de Tamanho Máximo de Vídeo (35 MB)
        const MAX_VIDEO_SIZE_MB = 35;
        if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          alert(`⚠️ Vídeo muito pesado (${(file.size / (1024 * 1024)).toFixed(1)} MB)!\n\n` +
                `Para garantir que o WebAR abra instantaneamente no celular dos pais sem travar a rede da escola, ` +
                `o tamanho máximo permitido é de ${MAX_VIDEO_SIZE_MB} MB.\n\n` +
                `💡 Dicas simples para reduzir:\n` +
                `1. Grave o vídeo pelo botão "🔴 Gravar na Hora" do Estúdio (ele já grava comprimido em ~8 MB).\n` +
                `2. Envie o vídeo para você mesmo no WhatsApp (o WhatsApp comprime automaticamente mantendo ótima qualidade).\n` +
                `3. Ou ajuste a câmera do seu celular para gravar em HD (720p) ou Full HD (1080p).`);
          el.hiddenVideoInput.value = '';
          return;
        }

        const student = schoolState.students[schoolState.activeStudentIndex];
        if (student) {
          student.videoFile = file;
          student.videoUrl = URL.createObjectURL(file);
          if (student.photoFile || student.photoUrl) {
            student.status = 'ready';
          }
          renderStudentsList();
          saveSchoolSession();
        }
        el.hiddenVideoInput.value = '';
      }
    });
  }

  // Modal Foto: Botão Capturar
  if (el.btnSnapPhoto) {
    el.btnSnapPhoto.addEventListener('click', snapPhotoFrame);
  }
  if (el.btnRetakePhoto) {
    el.btnRetakePhoto.addEventListener('click', retakePhotoFrame);
  }
  if (el.btnConfirmPhoto) {
    el.btnConfirmPhoto.addEventListener('click', confirmPhotoFrame);
  }
  if (el.btnSwitchCameraPhoto) {
    el.btnSwitchCameraPhoto.addEventListener('click', () => switchCamera('photo'));
  }

  // Modal Vídeo: Botões Gravação
  if (el.btnStartRecord) {
    el.btnStartRecord.addEventListener('click', startRecordingCountdown);
  }
  if (el.btnStopRecord) {
    el.btnStopRecord.addEventListener('click', stopRecordingVideo);
  }
  if (el.btnRetakeRecord) {
    el.btnRetakeRecord.addEventListener('click', retakeRecordingVideo);
  }
  if (el.btnConfirmRecord) {
    el.btnConfirmRecord.addEventListener('click', confirmRecordingVideo);
  }
  if (el.btnSwitchCameraVideo) {
    el.btnSwitchCameraVideo.addEventListener('click', () => switchCamera('video'));
  }
}

async function openLivePhotoModal(index) {
  schoolState.activeStudentIndex = index;
  const student = schoolState.students[index];
  if (el.photoStudentNameBadge) {
    el.photoStudentNameBadge.textContent = student ? student.name : '';
  }

  retakePhotoFrame();
  el.modalPhoto.classList.add('active');
  await startCameraStream(el.videoPhotoPreview, false);
}

async function snapPhotoFrame() {
  const video = el.videoPhotoPreview;
  const canvas = el.canvasPhotoCapture;
  if (!video || !canvas) return;

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  video.style.display = 'none';
  canvas.style.display = 'block';

  el.btnSnapPhoto.style.display = 'none';
  el.btnRetakePhoto.style.display = 'inline-flex';
  el.btnConfirmPhoto.style.display = 'inline-flex';
}

function retakePhotoFrame() {
  if (el.videoPhotoPreview) el.videoPhotoPreview.style.display = 'block';
  if (el.canvasPhotoCapture) el.canvasPhotoCapture.style.display = 'none';

  if (el.btnSnapPhoto) el.btnSnapPhoto.style.display = 'inline-flex';
  if (el.btnRetakePhoto) el.btnRetakePhoto.style.display = 'none';
  if (el.btnConfirmPhoto) el.btnConfirmPhoto.style.display = 'none';
}

async function confirmPhotoFrame() {
  const canvas = el.canvasPhotoCapture;
  const student = schoolState.students[schoolState.activeStudentIndex];
  if (!canvas || !student) return;

  canvas.toBlob(async (blob) => {
    const file = new File([blob], `desenho_${student.name.replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });
    student.photoFile = file;
    student.photoImg = await loadImageFromFile(file);
    student.photoUrl = student.photoImg.src;

    stopCameraStream();
    el.modalPhoto.classList.remove('active');
    renderStudentsList();
    saveSchoolSession();
  }, 'image/jpeg', 0.92);
}

// ==========================================================================
// Gravação de Vídeo ao Vivo (MediaRecorder)
// ==========================================================================
async function openLiveVideoModal(index) {
  schoolState.activeStudentIndex = index;
  const student = schoolState.students[index];
  if (el.videoStudentNameBadge) {
    el.videoStudentNameBadge.textContent = student ? student.name : '';
  }

  retakeRecordingVideo();
  el.modalVideo.classList.add('active');
  await startCameraStream(el.videoRecordPreview, true);
}

function startRecordingCountdown() {
  if (!el.recordCountdownOverlay) return;

  el.btnStartRecord.disabled = true;
  el.recordCountdownOverlay.style.display = 'flex';
  let count = 3;
  el.recordCountdownOverlay.textContent = count;

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      el.recordCountdownOverlay.textContent = count;
    } else {
      clearInterval(timer);
      el.recordCountdownOverlay.style.display = 'none';
      startMediaRecorder();
    }
  }, 900);
}

function startMediaRecorder() {
  schoolState.recordedChunks = [];
  const stream = schoolState.mediaStream;
  if (!stream) return;

  const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 1200000 // 1.2 Mbps: garante ~8 MB por minuto com excelente qualidade
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      schoolState.recordedChunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    clearInterval(schoolState.recordingTimerInterval);
    const blob = new Blob(schoolState.recordedChunks, { type: mimeType });
    const videoUrl = URL.createObjectURL(blob);

    el.videoRecordPreview.style.display = 'none';
    el.videoRecordedPlayback.src = videoUrl;
    el.videoRecordedPlayback.style.display = 'block';
    el.videoRecordedPlayback.play();

    el.btnStopRecord.style.display = 'none';
    el.btnRetakeRecord.style.display = 'inline-flex';
    el.btnConfirmRecord.style.display = 'inline-flex';
    el.recordTimerBadge.style.display = 'none';

    schoolState.lastRecordedBlob = blob;
    schoolState.lastRecordedMime = mimeType;
  };

  recorder.start(250);
  schoolState.mediaRecorder = recorder;

  // Atualizar UI para estado de gravando
  el.btnStartRecord.style.display = 'none';
  el.btnStopRecord.style.display = 'inline-flex';
  el.recordTimerBadge.style.display = 'flex';

  schoolState.recordingSeconds = 0;
  updateTimerDisplay();
  schoolState.recordingTimerInterval = setInterval(() => {
    schoolState.recordingSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const m = String(Math.floor(schoolState.recordingSeconds / 60)).padStart(2, '0');
  const s = String(schoolState.recordingSeconds % 60).padStart(2, '0');
  if (el.recordTimerBadge) {
    el.recordTimerBadge.innerHTML = `<span class="pulse-dot-red"></span> 🔴 Gravando: ${m}:${s}`;
  }
}

function stopRecordingVideo() {
  if (schoolState.mediaRecorder && schoolState.mediaRecorder.state !== 'inactive') {
    schoolState.mediaRecorder.stop();
  }
}

function retakeRecordingVideo() {
  if (el.videoRecordPreview) el.videoRecordPreview.style.display = 'block';
  if (el.videoRecordedPlayback) {
    el.videoRecordedPlayback.style.display = 'none';
    el.videoRecordedPlayback.pause();
    el.videoRecordedPlayback.src = '';
  }

  if (el.btnStartRecord) {
    el.btnStartRecord.style.display = 'inline-flex';
    el.btnStartRecord.disabled = false;
  }
  if (el.btnStopRecord) el.btnStopRecord.style.display = 'none';
  if (el.btnRetakeRecord) el.btnRetakeRecord.style.display = 'none';
  if (el.btnConfirmRecord) el.btnConfirmRecord.style.display = 'none';
  if (el.recordTimerBadge) el.recordTimerBadge.style.display = 'none';
}

function confirmRecordingVideo() {
  const student = schoolState.students[schoolState.activeStudentIndex];
  if (!student || !schoolState.lastRecordedBlob) return;

  const ext = schoolState.lastRecordedMime.includes('mp4') ? 'mp4' : 'webm';
  const file = new File(
    [schoolState.lastRecordedBlob],
    `video_${student.name.replace(/\s+/g, '_')}.${ext}`,
    { type: schoolState.lastRecordedMime }
  );

  student.videoFile = file;
  student.videoUrl = URL.createObjectURL(file);

  stopCameraStream();
  el.modalVideo.classList.remove('active');
  renderStudentsList();
  saveSchoolSession();
}

// Iniciar stream de câmera nativo
async function startCameraStream(videoEl, needAudio = false) {
  stopCameraStream();

  const constraints = {
    video: {
      facingMode: schoolState.currentFacingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: needAudio
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    schoolState.mediaStream = stream;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play();
    }
  } catch (err) {
    console.error('Falha ao abrir câmera:', err);
    alert('Não foi possível acessar a câmera ou microfone: ' + err.message);
  }
}

function stopCameraStream() {
  if (schoolState.mediaStream) {
    schoolState.mediaStream.getTracks().forEach(track => track.stop());
    schoolState.mediaStream = null;
  }
}

async function switchCamera(type) {
  schoolState.currentFacingMode = schoolState.currentFacingMode === 'environment' ? 'user' : 'environment';
  if (type === 'photo') {
    await startCameraStream(el.videoPhotoPreview, false);
  } else {
    await startCameraStream(el.videoRecordPreview, true);
  }
}

// ==========================================================================
// Compilação em Lote (Batch MindAR Processing)
// ==========================================================================
async function startBatchProcessing() {
  const pendingStudents = schoolState.students.filter(
    s => s.status !== 'compiled' && (s.photoImg || s.photoFile) && (s.videoFile || s.videoUrl)
  );

  if (pendingStudents.length === 0) {
    alert('Nenhum aluno com foto e vídeo prontos para compilar.');
    return;
  }

  schoolState.isProcessingBatch = true;
  el.btnBatchCompile.disabled = true;
  el.batchProgressContainer.style.display = 'block';

  let successCount = 0;

  for (let i = 0; i < pendingStudents.length; i++) {
    const student = pendingStudents[i];
    const overallProgress = (i / pendingStudents.length) * 100;
    el.batchProgressBar.style.width = `${overallProgress}%`;
    el.batchProgressText.textContent = `${overallProgress.toFixed(0)}%`;
    el.batchStatusLabel.textContent = `Compilando aluno ${i + 1} de ${pendingStudents.length}: ${student.name}...`;

    try {
      // 1. Garantir que a imagem está carregada no elemento Image
      if (!student.photoImg && student.photoFile) {
        student.photoImg = await loadImageFromFile(student.photoFile);
      }

      // 2. Compilar marcador no navegador
      const compileResult = await compileTargetImage(student.photoImg, (subProgress) => {
        el.batchStatusLabel.textContent = `[${i + 1}/${pendingStudents.length}] Compilando ${student.name}: ${subProgress.toFixed(0)}%`;
      });

      // 3. Enviar ao backend Express
      const formData = new FormData();
      formData.append('title', `${student.name} - ${student.studentClass}`);
      formData.append('studentName', student.name);
      formData.append('studentClass', student.studentClass);
      formData.append('description', student.title || 'Arte da Exposição Escolar');
      formData.append('targetWidth', compileResult.width);
      formData.append('targetHeight', compileResult.height);
      formData.append('fitMode', 'match');
      formData.append('loop', 'true');
      formData.append('audioDefault', 'muted');

      formData.append('targetImage', student.photoFile);
      formData.append('overlayVideo', student.videoFile);

      const mindBlob = new Blob([compileResult.buffer], { type: 'application/octet-stream' });
      formData.append('targetMind', mindBlob, 'targets.mind');

      const res = await fetch('/api/experiences', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Erro na resposta do servidor');

      const expData = await res.json();
      student.experienceId = expData.id;
      student.status = 'compiled';
      student.isPermanent = expData.isPermanent;
      if (expData.warning) {
        window.__lastStorageWarning = expData.warning;
      }

      // 4. Obter QR Code
      const qrRes = await fetch(`/api/qrcode/${expData.id}?base=${encodeURIComponent(window.location.origin)}`);
      const qrData = await qrRes.json();
      student.qrDataUrl = qrData.qrDataUrl;
      student.targetUrl = qrData.targetUrl;

      successCount++;
    } catch (err) {
      console.error(`Erro ao compilar ${student.name}:`, err);
    }
  }

  el.batchProgressBar.style.width = '100%';
  el.batchProgressText.textContent = '100%';
  el.batchStatusLabel.textContent = `✓ Concluído! ${successCount} alunos compilados com sucesso.`;

  schoolState.isProcessingBatch = false;
  el.btnBatchCompile.disabled = false;
  renderStudentsList();
  saveSchoolSession();

  // Se houver aviso de armazenamento temporário, alertar o professor com destaque
  if (window.__lastStorageWarning) {
    alert(`⚠️ Atenção importante sobre o armazenamento:\n\n${window.__lastStorageWarning}\n\nRecomendação: Para que os vídeos não sumam se o site reiniciar, ative as variáveis do Cloudinary no Render ou clique em "Fazer Backup (JSON)" no topo.`);
  }

  // Abrir preparação para impressão
  savePrintDataForBatch();
  if (confirm('Todos os alunos foram compilados! Deseja abrir a página de impressão das plaquinhas agora?')) {
    openBatchPrintPage();
  }
}

// Salvar dados no localStorage para serem lidos por print-batch.html
function savePrintDataForBatch() {
  const schoolName = el.inputSchoolName ? el.inputSchoolName.value.trim() : 'Escola Municipal';
  const expoName = el.inputExpoName ? el.inputExpoName.value.trim() : 'Mostra Cultural: Pequenos Artistas';
  const instructions = el.inputInstructions ? el.inputInstructions.value.trim() : '1. Aponte a câmera para o QR Code. 2. Permita a câmera. 3. Mire a câmera no desenho!';
  const showThumb = el.checkShowThumbs ? el.checkShowThumbs.checked : true;

  const items = schoolState.students
    .filter(s => s.status === 'compiled' && s.qrDataUrl)
    .map(s => ({
      studentName: s.name,
      studentClass: s.studentClass,
      title: s.title,
      artImageUrl: s.photoUrl || (s.photoImg ? s.photoImg.src : ''),
      qrDataUrl: s.qrDataUrl,
      targetUrl: s.targetUrl
    }));

  const printPayload = {
    schoolName,
    expoName,
    instructions,
    showThumb,
    items
  };

  localStorage.setItem('eyejack_school_print_data', JSON.stringify(printPayload));
}

function openBatchPrintPage() {
  savePrintDataForBatch();
  window.open('/print-batch.html', '_blank');
}

// ==========================================================================
// Persistência da Sessão Escolar
// ==========================================================================
function saveSchoolSession() {
  const simpleList = schoolState.students.map(s => ({
    id: s.id,
    name: s.name,
    studentClass: s.studentClass,
    title: s.title,
    status: s.status,
    experienceId: s.experienceId,
    qrDataUrl: s.qrDataUrl,
    targetUrl: s.targetUrl,
    photoUrl: s.photoUrl
  }));
  localStorage.setItem('eyejack_school_students', JSON.stringify(simpleList));
}

function loadSavedSchoolSession() {
  const saved = localStorage.getItem('eyejack_school_students');
  if (saved) {
    try {
      const list = JSON.parse(saved);
      if (Array.isArray(list) && list.length > 0) {
        schoolState.students = list;
        renderStudentsList();
      }
    } catch (e) {
      console.warn('Erro ao carregar sessão escolar salva:', e);
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
