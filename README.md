# ✨ ARpagadinho WebAR Platform

Uma plataforma completa e moderna de **Realidade Aumentada baseada na Web (WebAR)** inspirada no universo do **Quadro Virtual e no mascote Apagadinho**. Permite que escolas, professores, alunos e artistas façam com que desenhos e imagens físicas impressas (como cartões postais, murais escolares, pinturas ou fotos) **ganhem vida** com vídeos e animações sobrepostos em perspectiva 3D diretamente no navegador do smartphone, **sem necessidade de baixar nenhum aplicativo nativo**.

---

## ✨ Funcionalidades Principais

- 🎯 **Rastreamento de Imagem Robusto (MindAR.js)**: Detecção estável e precisa de imagens marcadoras físicas com renderização 3D via **A-Frame**.
- ⚡ **Compilador MindAR Integrado no Navegador**: Os usuários podem fazer upload de qualquer imagem (JPG/PNG) e compilar o arquivo `.mind` diretamente no navegador, utilizando aceleração WebGL e WASM com barra de progresso em tempo real e visualização dos pontos de tracking (*feature points*).
- 🎬 **Sobreposição de Vídeo Alinhada**: Sobrepõe vídeos MP4 em perspectiva 3D perfeitamente dimensionados e calculados a partir da proporção ($W \times H$) da arte física.
- 📱 **Acesso Instantâneo via QR Code**: Cada experiência gera um QR Code único de alta resolução que direciona a câmera do celular diretamente para a URL do WebAR.
- 🔊 **Controle Inteligente de Mídia & Áudio Mobile**: Botão flutuante estilizado *"🔊 Ativar Som"* que contorna de forma transparente as restrições rígidas de reprodução automática com som dos navegadores móveis (Safari no iOS e Chrome no Android).
- 🖨️ **Gerador de Cartão de Teste Imprimível**: Página formatada para impressão ou exibição em tela secundária com a arte marcadora e o QR Code integrados lado a lado.
- 🔒 **Suporte Nativo a HTTPS**: Servidor Express com suporte embutido a certificados SSL para teste local da câmera no smartphone pela rede Wi-Fi.
- 🎨 **Exemplos de Demonstração Pré-configurados**: Inclui demonstrações funcionais completas prontas para testar imediatamente ao iniciar o servidor.

---

## 🛠️ Tecnologias Utilizadas

- **Front-end / WebAR**:
  - [MindAR.js (v1.2.5)](https://github.com/hiukim/mind-ar-js) - Biblioteca open source de visão computacional e rastreamento de imagens.
  - [A-Frame (v1.5.0)](https://aframe.io/) - Framework WebXR/3D declarativo para web.
  - HTML5, CSS3 moderno (estética Dark/Neon com Glassmorphism inspirada no EyeJack Studio) e ES Modules.
- **Back-end & API**:
  - [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
  - [Multer](https://github.com/expressjs/multer) - Upload de artes, vídeos e arquivos `.mind`.
  - [QRCode](https://github.com/soldair/node-qrcode) - Geração dinâmica de QR Codes.
  - [Selfsigned](https://github.com/jfromaniello/selfsigned) - Emissão automática de certificados SSL locais.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- Node.js instalado (v18 ou superior).

### 1. Instalação das Dependências
Na pasta do projeto, execute:
```bash
npm install
```

### 2. Iniciar o Servidor

#### Modo Padrão (HTTP - Porta 3000):
```bash
npm start
```
Acesse no computador: **`http://localhost:3000`**

#### Modo Seguro (HTTPS - Recomendado para testar no Smartphone):
```bash
npm run dev:https
```
O servidor iniciará tanto em HTTP (porta 3000) quanto em HTTPS (porta 3443).
O terminal exibirá o endereço IP local para acesso pelo smartphone, por exemplo:
`https://192.168.1.X:3443`

---

## 🧪 Como Testar a Experiência WebAR

Você pode testar a plataforma de duas formas muito simples:

### Opção A: Teste com Smartphone (Experiência Real)
1. Certifique-se de que o computador e o smartphone estão na **mesma rede Wi-Fi**.
2. Inicie o servidor com `npm run dev:https` (ou utilize um túnel público como o `localtunnel`: `npx localtunnel --port 3000`).
3. No computador, abra `http://localhost:3000`.
4. Na galeria, clique em **"QR Code"** ou **"Cartão"** em uma das experiências de demonstração (ex: *Cartão Postal Futurista* ou *Guaxinim Ilustrado*).
5. No smartphone, abra a câmera padrão ou leitor de QR Code e aponte para o código na tela do computador.
6. Toque no link para abrir o navegador (Safari ou Chrome móvel) e **permita o acesso à câmera**.
7. Aponte a câmera do celular para a imagem da arte na tela do computador (ou cartão impresso) e **veja a arte ganhar vida!**
8. Toque no botão **"🔊 Ativar Som"** para desfrutar do áudio sincronizado.

### Opção B: Teste no Computador (Webcam Desktop)
1. No navegador do computador, abra:
   `http://localhost:3000/view.html?id=demo-card-tech`
2. Permita o acesso à webcam.
3. Se você tiver o cartão impresso ou a imagem aberta na tela do celular, posicione-a na frente da webcam para ver a sobreposição 3D em tempo real.

---

## 🎨 Criando uma Nova Experiência no Estúdio

1. No painel principal (`/`), clique no botão **"⚡ Criar Experiência"**.
2. **Passo 1 (Arte Marcadora)**: Faça upload da ilustração física (JPG ou PNG). O estúdio lerá as dimensões exatas e a proporção ($W \times H$).
3. **Passo 2 (Compilação MindAR)**: Clique em *"⚡ Iniciar Compilação MindAR"*. O compilador processará os pontos de rastreamento no navegador e exibirá um preview com os pontos detectados (verde/ciano).
4. **Passo 3 (Vídeo Sobreposto)**: Faça upload do vídeo de animação (MP4). Visualize a prévia e a duração.
5. **Passo 4 (Ajustes)**: Defina o título, opções de proporção (Ajuste Exato 1:1, Conter ou Cobrir), repetição contínua (Loop) e modo de áudio inicial.
6. Clique em **"🚀 Concluir & Criar Experiência WebAR"**.
7. O sistema salvará os arquivos, persistirá a experiência e exibirá imediatamente o **QR Code** e o link direto para testes!

---

## 📐 Dicas para Criação de Marcadores de Alta Fidelidade

O MindAR utiliza reconhecimento de características geométricas e contraste local para manter o rastreamento estável. Para obter a melhor experiência:
- ✅ **Prefira artes com bom contraste e detalhes ricos**: Texturas, ilustrações hachuradas, gravuras, fotos com detalhes nítidos e linhas bem definidas funcionam de forma excepcional.
- ❌ **Evite áreas vazias muito grandes**: Superfícies totalmente brancas ou lisas sem textura têm menos pontos de ancoragem.
- ❌ **Evite padrões repetitivos uniformes**: Grades simples ou xadrez idêntico podem confundir a orientação do algoritmo.

---

## 📂 Estrutura de Arquivos da Plataforma

```
eyejack-webar-platform/
├── package.json              # Dependências e scripts de execução
├── server.js                 # Servidor Express, upload Multer e APIs REST
├── generate-certs.js         # Gerador de certificados SSL autoassinados
├── test-e2e.js               # Teste automatizado de ponta a ponta da API
├── data/
│   └── experiences.json      # Banco de dados persistente em JSON
├── uploads/                  # Diretório das experiências criadas pelo usuário
│   └── [exp_id]/             # target.jpg, video.mp4, targets.mind
├── public/
│   ├── index.html            # Dashboard do Estúdio de Criação WebAR
│   ├── view.html             # Visualizador WebAR em tela cheia (MindAR + A-Frame)
│   ├── print.html            # Cartão de teste imprimível (Arte + QR Code)
│   ├── css/
│   │   └── styles.css        # Estilos com design Dark/Neon inspirado no EyeJack
│   ├── js/
│   │   ├── app.js            # Controlador do dashboard e assistente de criação
│   │   ├── compiler.js       # Compilador MindAR executado no navegador
│   │   └── viewer.js         # Controlador do WebAR e eventos de rastreamento
│   └── samples/              # Exemplos de demonstração pré-compilados
│       ├── sample-1/         # Demonstração 1 (Cartão Postal Futurista)
│       └── sample-2/         # Demonstração 2 (Guaxinim Ilustrado)
└── README.md                 # Esta documentação
```

---

## 📡 Endpoints da API REST

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/info` | Retorna status do servidor, porta e IP na rede local |
| `GET` | `/api/experiences` | Lista todas as experiências cadastradas |
| `GET` | `/api/experiences/:id` | Retorna metadados e URLs de uma experiência |
| `POST` | `/api/experiences` | Cria nova experiência com upload de arquivos (`multipart/form-data`) |
| `DELETE` | `/api/experiences/:id` | Exclui experiência e remove arquivos do disco |
| `GET` | `/api/qrcode/:id` | Gera QR Code (`?format=png` para download ou JSON com data URL) |
| `GET` | `/view/:id` | Redireciona de forma amigável para `/view.html?id=:id` |

---

## 📜 Licença

Distribuído sob a licença **MIT**. Totalmente baseado em bibliotecas gratuitas e tecnologias de código aberto (MindAR.js, A-Frame, Express).
