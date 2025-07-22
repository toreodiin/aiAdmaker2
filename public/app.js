// public/app.js
const fileInput = document.getElementById('fileInput');
const uploadBox = document.querySelector('.upload-box');
const results = document.getElementById('results');
const originalCanvas = document.getElementById('originalCanvas');
const analysisCanvas = document.getElementById('analysisCanvas');
const layoutInfo = document.getElementById('layoutInfo');

// Element colors
const ELEMENT_COLORS = {
  header: '#FF0000',
  subhead: '#0000FF',
  logo: '#800080',
  cta: '#008000'
};

fileInput.addEventListener('change', handleFileUpload);

// Drag and drop
uploadBox.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadBox.style.borderColor = '#007bff';
});

uploadBox.addEventListener('dragleave', () => {
  uploadBox.style.borderColor = '#ccc';
});

uploadBox.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadBox.style.borderColor = '#ccc';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    processImage(file);
  }
});

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    processImage(file);
  }
}

async function processImage(file) {
  // Display original image
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalCanvas.width = 400;
      originalCanvas.height = 400;
      const ctx = originalCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 400, 400);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Send to server for analysis
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch('/analyze', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data.success) {
      displayResults(data);
    } else {
      alert('Analysis failed: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function displayResults(data) {
  results.style.display = 'block';

  // Draw analysis on canvas
  analysisCanvas.width = 400;
  analysisCanvas.height = 400;
  const ctx = analysisCanvas.getContext('2d');

  // Copy original image with transparency
  ctx.globalAlpha = 0.3;
  ctx.drawImage(originalCanvas, 0, 0);
  ctx.globalAlpha = 1.0;

  // Draw layout elements
  const gridSize = data.metadata.gridSize;
  const cellWidth = 400 / gridSize;
  const cellHeight = 400 / gridSize;

  Object.entries(data.layout).forEach(([type, element]) => {
    if (element) {
      drawElement(ctx, element, type, cellWidth, cellHeight);
    }
  });

  // Display layout info
  displayLayoutInfo(data.layout);
}

function drawElement(ctx, element, type, cellWidth, cellHeight) {
  const x = element.col * cellWidth;
  const y = element.row * cellHeight;
  const width = element.width * cellWidth;
  const height = element.height * cellHeight;

  ctx.strokeStyle = ELEMENT_COLORS[type];
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  // Draw label
  ctx.fillStyle = ELEMENT_COLORS[type];
  ctx.font = 'bold 14px Arial';
  ctx.fillText(
    `${type.toUpperCase()} ${element.ratio || `${element.width}x${element.height}`}`,
    x, 
    y - 5
  );
}

function displayLayoutInfo(layout) {
  let html = '';

  Object.entries(layout).forEach(([type, element]) => {
    if (element) {
      html += `
        <div class="element-info">
          <strong>${type.toUpperCase()}</strong><br>
          Position: Row ${element.row}, Col ${element.col}<br>
          Size: ${element.width}x${element.height} ${element.ratio ? `(${element.ratio})` : ''}<br>
          Score: ${element.score.toFixed(3)}
        </div>
      `;
    }
  });

  layoutInfo.innerHTML = html;
}