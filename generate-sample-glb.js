/**
 * Gerador de Modelo 3D .GLB Minimalista Válido (Diamante / Cristal Geométrico Colorido)
 * Formato glTF 2.0 Binary (GLB)
 */
const fs = require('fs');
const path = require('path');

function createSampleGlb() {
  // Geometria de um cristal facetado / estrela tridimensional
  // 6 vértices de um octaedro com pontas pontiagudas
  // Vértices (posições X, Y, Z em floats de 32 bits)
  const positions = new Float32Array([
    // Topo
     0.0,  0.5,  0.0,
    // Base inferior
     0.0, -0.5,  0.0,
    // 4 cantos da cintura
     0.35, 0.0,  0.0,
     0.0,  0.0,  0.35,
    -0.35, 0.0,  0.0,
     0.0,  0.0, -0.35
  ]);

  // Cores por vértice (RGBA floats de 32 bits) - gradiente vibrante Ubuntu/Apagadinho
  const colors = new Float32Array([
    0.95, 0.25, 0.65, 1.0, // Rosa choque (topo)
    0.38, 0.40, 0.95, 1.0, // Índigo (base)
    0.20, 0.75, 0.98, 1.0, // Ciano
    0.98, 0.70, 0.15, 1.0, // Dourado
    0.10, 0.85, 0.55, 1.0, // Esmeralda
    0.95, 0.35, 0.85, 1.0  // Magenta
  ]);

  // Triângulos (8 faces do octaedro - unsigned short de 16 bits)
  const indices = new Uint16Array([
    // 4 faces superiores
    0, 2, 3,
    0, 3, 4,
    0, 4, 5,
    0, 5, 2,
    // 4 faces inferiores
    1, 3, 2,
    1, 4, 3,
    1, 5, 4,
    1, 2, 5
  ]);

  // Construir buffer binário (BIN chunk)
  // Alinhamento em múltiplos de 4 bytes
  const indicesBuffer = Buffer.from(indices.buffer);
  // Padding para índice ficar alinhado a 4 bytes
  const indicesPad = indicesBuffer.length % 4 === 0 ? 0 : 4 - (indicesBuffer.length % 4);
  const indicesPadded = Buffer.concat([indicesBuffer, Buffer.alloc(indicesPad)]);

  const positionsBuffer = Buffer.from(positions.buffer);
  const colorsBuffer = Buffer.from(colors.buffer);

  const binData = Buffer.concat([indicesPadded, positionsBuffer, colorsBuffer]);

  const indicesByteOffset = 0;
  const indicesByteLength = indicesBuffer.length;

  const positionsByteOffset = indicesPadded.length;
  const positionsByteLength = positionsBuffer.length;

  const colorsByteOffset = positionsByteOffset + positionsByteLength;
  const colorsByteLength = colorsBuffer.length;

  // Montar JSON do glTF 2.0
  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "ARpagadinho 3D Generator"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      name: "CristalUbuntu",
      mesh: 0,
      scale: [1, 1, 1],
      rotation: [0, 0, 0, 1]
    }],
    meshes: [{
      name: "CristalMesh",
      primitives: [{
        attributes: {
          POSITION: 1,
          COLOR_0: 2
        },
        indices: 0,
        mode: 4, // TRIANGLES
        material: 0
      }]
    }],
    materials: [{
      name: "CristalMaterial",
      pbrMetallicRoughness: {
        metallicFactor: 0.3,
        roughnessFactor: 0.2
      },
      doubleSided: true
    }],
    accessors: [
      // 0: Indices
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: indices.length,
        type: "SCALAR",
        min: [0],
        max: [5]
      },
      // 1: Positions
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 6,
        type: "VEC3",
        min: [-0.35, -0.5, -0.35],
        max: [0.35, 0.5, 0.35]
      },
      // 2: Colors
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 6,
        type: "VEC4",
        min: [0.1, 0.25, 0.15, 1.0],
        max: [0.98, 0.85, 0.98, 1.0]
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: indicesByteOffset,
        byteLength: indicesByteLength,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positionsByteOffset,
        byteLength: positionsByteLength,
        target: 34962 // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: colorsByteOffset,
        byteLength: colorsByteLength,
        target: 34962 // ARRAY_BUFFER
      }
    ],
    buffers: [{
      byteLength: binData.length
    }]
  };

  const jsonStr = JSON.stringify(gltfJson);
  let jsonBuffer = Buffer.from(jsonStr, 'utf8');
  // glTF especifica que o chunk JSON deve ter tamanho múltiplo de 4 bytes (com espaços 0x20)
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from(' '.repeat(jsonPad), 'utf8')]);
  }

  // Cabeçalho GLB (12 bytes)
  const magic = 0x46546C67; // "glTF"
  const version = 2;
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binData.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(totalLength, 8);

  // Chunk 0: JSON
  const chunk0Header = Buffer.alloc(8);
  chunk0Header.writeUInt32LE(jsonBuffer.length, 0);
  chunk0Header.writeUInt32LE(0x4E4F534A, 4); // "JSON"

  // Chunk 1: BIN
  const chunk1Header = Buffer.alloc(8);
  chunk1Header.writeUInt32LE(binData.length, 0);
  chunk1Header.writeUInt32LE(0x004E4942, 4); // "BIN\0"

  const finalGlb = Buffer.concat([
    header,
    chunk0Header,
    jsonBuffer,
    chunk1Header,
    binData
  ]);

  return finalGlb;
}

// Salvar modelo de teste
const outDir = path.join(__dirname, 'public', 'samples', 'sample-3d');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const glbBuffer = createSampleGlb();
const outPath = path.join(outDir, 'cristal.glb');
fs.writeFileSync(outPath, glbBuffer);
console.log(`✓ Modelo 3D .GLB gerado com sucesso em: ${outPath} (${glbBuffer.length} bytes)`);
