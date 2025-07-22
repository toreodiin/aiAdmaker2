// Global state
let currentProduct = null;
let enrichedPackage = null;
let adElements = null;
let generatedImages = null;

// API endpoints
const API = {
  extractProduct: '/api/extract-product',
  preparePackage: '/api/prepare-package', 
  generateElements: '/api/generate-ad-elements',
  generateImages: '/api/generate-images',
  analyzeLayout: '/api/analyze-layout'
};

// Step 1: Extract Product from HTML
async function extractProduct() {
  const htmlInput = document.getElementById('htmlInput').value;
  if (!htmlInput.trim()) {
    showStatus('extractStatus', 'Please paste HTML content', 'error');
    return;
  }

  showStatus('extractStatus', 'Extracting product information...', 'loading');

  try {
    const response = await fetch(API.extractProduct, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlInput })
    });

    const data = await response.json();

    if (data.success) {
      currentProduct = data.product;
      displayExtractedProduct(data.product);
      showStatus('extractStatus', 'Product extracted successfully!', 'success');
      document.getElementById('step2').style.display = 'block';
    } else {
      showStatus('extractStatus', `Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus('extractStatus', `Error: ${error.message}`, 'error');
  }
}

// Display extracted product
function displayExtractedProduct(product) {
  document.getElementById('productPreview').style.display = 'block';
  document.getElementById('productTitle').textContent = product.title;
  document.getElementById('productDescription').textContent = product.description;
  document.getElementById('productPrice').textContent = product.price || 'N/A';

  // Display images
  const imageGrid = document.getElementById('imageGrid');
  imageGrid.innerHTML = '';

  product.images.forEach((imageUrl, index) => {
    const imageItem = document.createElement('div');
    imageItem.className = 'image-item';
    imageItem.innerHTML = `
      <img src="${imageUrl}" alt="Product image ${index + 1}" />
    `;
    imageItem.onclick = () => toggleImageSelection(imageItem, index);

    if (index < 2) { // Select first two by default
      imageItem.classList.add('selected');
    }

    imageGrid.appendChild(imageItem);
  });
}

// Toggle image selection
function toggleImageSelection(element, index) {
  element.classList.toggle('selected');
}

// Get selected images
function getSelectedImages() {
  const selectedElements = document.querySelectorAll('.image-item.selected img');
  return Array.from(selectedElements).map(img => img.src);
}

// Step 2: Enrich Product Package
async function enrichProduct() {
  const selectedImages = getSelectedImages();
  if (selectedImages.length === 0) {
    showStatus('enrichStatus', 'Please select at least one image', 'error');
    return;
  }

  showStatus('enrichStatus', 'Generating marketing package...', 'loading');

  const productData = {
    ...currentProduct,
    images: selectedImages
  };

  try {
    const response = await fetch(API.preparePackage, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: productData })
    });

    const data = await response.json();

    if (data.success) {
      enrichedPackage = data.package;
      displayEnrichedPackage(data.package);
      showStatus('enrichStatus', 'Marketing package created!', 'success');
      document.getElementById('step3').style.display = 'block';
    } else {
      showStatus('enrichStatus', `Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus('enrichStatus', `Error: ${error.message}`, 'error');
  }
}

// Display enriched package
function displayEnrichedPackage(package) {
  document.getElementById('enrichResults').style.display = 'block';
  document.getElementById('styleResult').textContent = 
    `${package.marketingStyleName}: ${package.marketingStyleDescription}`;
  document.getElementById('usageResult').textContent = package.usageDescription;
}

// Step 3: Generate Ad Elements
async function generateAdElements() {
  showStatus('generateStatus', 'Generating ad elements...', 'loading');

  try {
    // Generate copy elements
    const copyResponse = await fetch(API.generateElements, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productPackage: enrichedPackage })
    });

    const copyData = await copyResponse.json();

    if (!copyData.success) {
      throw new Error(copyData.error);
    }

    adElements = copyData.elements;
    displayAdElements(copyData.elements);

    // Generate images in parallel
    showStatus('generateStatus', 'Generating images... This may take a moment', 'loading');

    const imageResponse = await fetch(API.generateImages, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        product: {
          ...enrichedPackage,
          shortTitle: adElements.shortTitle,
          shortDescription: adElements.shortDescription
        },
        imageUrl: enrichedPackage.images[0]
      })
    });

    const imageData = await imageResponse.json();

    if (!imageData.success) {
      throw new Error(imageData.error);
    }

    generatedImages = imageData.images;
    displayGeneratedImages(imageData.images);

    showStatus('generateStatus', 'All elements generated successfully!', 'success');
    document.getElementById('step4').style.display = 'block';

  } catch (error) {
    showStatus('generateStatus', `Error: ${error.message}`, 'error');
  }
}

// Display ad elements
function displayAdElements(elements) {
  document.getElementById('adElements').style.display = 'block';

  // Text elements
  document.getElementById('shortTitle').value = elements.shortTitle;
  document.getElementById('shortDescription').value = elements.shortDescription;
  document.getElementById('ctaText').value = elements.cta;

  // Slogans dropdown
  const sloganSelect = document.getElementById('sloganSelect');
  sloganSelect.innerHTML = '';
  elements.slogans.forEach((slogan, index) => {
    const option = document.createElement('option');
    option.value = slogan;
    option.textContent = slogan;
    if (index === 0) option.selected = true;
    sloganSelect.appendChild(option);
  });
}

// Display generated images
function displayGeneratedImages(images) {
  if (images.hero) {
    document.getElementById('heroImage').src = images.hero;
  }
  if (images.staged) {
    document.getElementById('stagedImage').src = images.staged;
  }
  if (images.lifestyle) {
    // Add lifestyle image display if needed
  }
}

// Step 4: Analyze Layout
async function analyzeLayout() {
  const fileInput = document.getElementById('layoutImage');
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select an image for layout analysis');
    return;
  }

  // Display original image
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('originalCanvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 400, 400);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Send for analysis
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(API.analyzeLayout, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      displayLayoutAnalysis(data);
    } else {
      alert(`Layout analysis failed: ${data.error}`);
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// Display layout analysis
function displayLayoutAnalysis(data) {
  const canvas = document.getElementById('analysisCanvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  // Copy original with transparency
  ctx.globalAlpha = 0.3;
  ctx.drawImage(document.getElementById('originalCanvas'), 0, 0);
  ctx.globalAlpha = 1.0;

  // Draw layout elements
  const cellSize = 400 / data.metadata.gridSize;

  Object.entries(data.layout).forEach(([type, element]) => {
    if (element) {
      drawLayoutElement(ctx, element, type, cellSize);
    }
  });

  // Display results
  displayLayoutResults(data.layout);
}

// Draw layout element on canvas
function drawLayoutElement(ctx, element, type, cellSize) {
  const colors = {
    header: '#FF0000',
    subhead: '#0000FF',
    logo: '#800080',
    cta: '#008000'
  };

  const x = element.col * cellSize;
  const y = element.row * cellSize;
  const width = element.width * cellSize;
  const height = element.height * cellSize;

  ctx.strokeStyle = colors[type] || '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  // Draw label
  ctx.fillStyle = colors[type] || '#000000';
  ctx.font = 'bold 14px Arial';
  ctx.fillText(
    `${type.toUpperCase()} ${element.ratio || `${element.width}x${element.height}`}`,
    x, 
    y - 5
  );
}

// Display layout results
function displayLayoutResults(layout) {
  const resultsDiv = document.getElementById('layoutResults');
  let html = '<h4>Layout Analysis Results</h4>';

  Object.entries(layout).forEach(([type, element]) => {
    if (element) {
      html += `
        <div class="result-card">
          <strong>${type.toUpperCase()}</strong><br>
          Position: Row ${element.row}, Col ${element.col}<br>
          Size: ${element.width}x${element.height} ${element.ratio ? `(${element.ratio})` : ''}<br>
          ${element.score ? `Score: ${element.score.toFixed(3)}` : ''}
          ${element.placement ? `<br>Placement: ${element.placement}` : ''}
        </div>
      `;
    }
  });

  resultsDiv.innerHTML = html;
}

// Utility functions
function showStatus(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.className = type;
  element.textContent = message;
  element.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 3000);
  }
}

// Add some CSS for status messages
const style = document.createElement('style');
style.textContent = `
  .loading { color: #007bff; }
  .error { color: #dc3545; }
  .success { color: #28a745; }
  .loading::before { content: '⏳ '; }
  .error::before { content: '❌ '; }
  .success::before { content: '✅ '; }
`;
document.head.appendChild(style);