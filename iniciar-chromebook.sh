#!/bin/bash
echo "=================================================="
echo "   Iniciando ARpagadinho no Chromebook / Linux"
echo "=================================================="

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "Node.js nao encontrado. Instalando Node.js e npm..."
    sudo apt update && sudo apt install -y nodejs npm
fi

# Instala dependências caso necessário
if [ ! -d "node_modules" ]; then
    echo "Instalando modulos do projeto (isso so ocorre na 1a vez)..."
    npm install
fi

echo ""
echo "Servidor ARpagadinho ativado com sucesso!"
echo "Abra o navegador do Chromebook e acesse:"
echo "👉 http://localhost:3000"
echo ""
echo "Para fechar o servidor, pressione Ctrl + C"
echo "=================================================="
node server.js
