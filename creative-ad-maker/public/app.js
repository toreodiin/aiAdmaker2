// Global state
let currentProduct = null;
let enrichedPackage = null;
let adElements = null;
let generatedImages = null;
let processedLogos = null;
let selectedLogo = null;
let selectedLogoVariant = 'original';
let layoutAnalysis = null;

// API endpoints
const API = {
  extractProduct: '/api/extract-product',
  preparePackage: '/api/prepare-package', 
  generateElements: '/api/generate-ad-elements',
  generateImages: '/api/generate-images',
  analyzeLayout: '/api/analyze-layout',
  sendToFigma: '/api/send-to-figma',
  fetchUrl: '/api/fetch-url'
};

// Initialize event listeners when DOM loads
document.addEventListener('DOMContentLoaded', function() {
  const headerChoice = document.getElementById('headerTextChoice');
  const subheadChoice = document.getElementById('subheadTextChoice');

  if (headerChoice) {
    headerChoice.addEventListener('change', updateFigmaPreview);
  }
  if (subheadChoice) {
    subheadChoice.addEventListener('change', updateFigmaPreview);
  }
});

// Step 1: Extract Product from URL
async function extractProduct() {
  const urlInput = document.getElementById('urlInput').value;
  if (!urlInput.trim()) {
    showStatus('extractStatus', 'Please enter a product page URL', 'error');
    return;
  }

  showStatus('extractStatus', 'Fetching webpage content...', 'loading');

  try {
    // First fetch the HTML from the URL
    const fetchResponse = await fetch(API.fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput })
    });

    const fetchData = await fetchResponse.json();

    if (!fetchData.success) {
      showStatus('extractStatus', `Failed to fetch URL: ${fetchData.error}`, 'error');
      return;
    }

    showStatus('extractStatus', 'Webpage fetched! Now extracting product information...', 'loading');

    // Now extract product info from the HTML
    const response = await fetch(API.extractProduct, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fetchData.html })
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

  // Display logos if found
  if (product.logos && product.logos.length > 0) {
    displayLogos(product.logos);
  }
}

// Display extracted logos
function displayLogos(logos) {
  const logoSection = document.getElementById('logoSection');
  const logoGrid = document.getElementById('logoGrid');

  logoSection.style.display = 'block';
  logoGrid.innerHTML = '';

  logos.forEach((logo, index) => {
    const logoItem = document.createElement('div');
    logoItem.className = 'logo-item';

    if (typeof logo === 'object' && logo.type === 'svg') {
      logoItem.innerHTML = `
        <div style="height: 60px; display: flex; align-items: center; justify-content: center;">
          ${logo.content}
        </div>
        <p style="font-size: 12px; margin: 5px 0;">SVG Logo</p>
      `;
    } else {
      logoItem.innerHTML = `
        <img src="${logo}" style="max-width: 100px; max-height: 60px; object-fit: contain;" />
        <p style="font-size: 12px; margin: 5px 0;">Logo ${index + 1}</p>
      `;
    }

    logoItem.onclick = () => toggleLogoSelection(logoItem, index);
    logoGrid.appendChild(logoItem);
  });
}

// Toggle image selection
function toggleImageSelection(element, index) {
  element.classList.toggle('selected');
}

// Toggle logo selection
function toggleLogoSelection(element, index) {
  // Remove selection from other logos
  document.querySelectorAll('.logo-item').forEach(item => item.classList.remove('selected'));
  element.classList.add('selected');
  selectedLogo = currentProduct.logos[index];
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
    images: selectedImages,
    selectedLogo: selectedLogo
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

// Step 3: Generate Ad Elements with SSE Streaming Support
async function generateAdElements() {
  showProgressBar();
  updateProgress(10, 'Getting started...');

  try {
    // Generate copy elements first (fast)
    updateProgress(25, 'Writing killer copy...');
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
    updateProgress(40, 'Copy is fire! 🔥');

    // Process logos if available (fast)
    if (selectedLogo) {
      updateProgress(50, 'Making logos look amazing...');
      const logoResponse = await fetch('/api/process-logos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logos: [selectedLogo] })
      });

      if (logoResponse.ok) {
        const logoData = await logoResponse.json();
        processedLogos = logoData.processedLogos;
        displayProcessedLogos(logoData.processedLogos);
      }
    }

    // Start streaming image generation
    updateProgress(60, 'Starting 4 parallel AI image generations...');

    // Initialize clean image containers
    initializeImageContainers();

    // Initialize generated images object
    generatedImages = {};

    // Build the SSE URL with query parameters
    const productData = {
      ...enrichedPackage,
      shortTitle: adElements.shortTitle,
      shortDescription: adElements.shortDescription
    };
    const sseUrl = `/api/generate-images-stream?product=${encodeURIComponent(JSON.stringify(productData))}&imageUrl=${encodeURIComponent(enrichedPackage.images[0])}`;

    console.log('🚀 Starting SSE image generation stream...');

    // Start SSE connection for streaming
    const eventSource = new EventSource(sseUrl);
    let imagesCompleted = 0;
    const totalImages = 4;

    // Handle SSE events
    eventSource.addEventListener('partial', (event) => {
      const data = JSON.parse(event.data);
      console.log(`[SSE] Partial received:`, data);
      handlePartialImage(data.type, data.image, data.index);
    });

    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
      console.log(`[SSE] Complete received:`, data);
      handleCompleteImage(data.type, data.image);
      imagesCompleted++;

      // Update progress based on completed images
      const baseProgress = 60;
      const progressPerImage = 30 / totalImages;
      updateProgress(baseProgress + (imagesCompleted * progressPerImage), `${imagesCompleted}/${totalImages} images completed!`);
    });

    eventSource.addEventListener('done', (event) => {
      const data = JSON.parse(event.data);
      console.log(`[SSE] Done event received:`, data);
      eventSource.close();

      updateProgress(100, 'All done!');

      setTimeout(() => {
        hideProgressBar();
        showStatus('generateStatus', `Successfully generated ${data.successCount}/4 images!`, 'success');
        document.getElementById('step4').style.display = 'block';
        populateGeneratedImagesGrid(generatedImages);
      }, 1000);
    });

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      hideProgressBar();
      showStatus('generateStatus', 'Connection error during image generation', 'error');
    };

  } catch (error) {
    hideProgressBar();
    showStatus('generateStatus', `Error: ${error.message}`, 'error');
  }
}

// Initialize clean image containers
function initializeImageContainers() {
  const imageTypes = ['hero', 'staged', 'lifestyle', 'editorial'];

  imageTypes.forEach(type => {
    const imgElement = document.getElementById(`${type}Image`);
    
    if (imgElement) {
      // Reset image completely
      imgElement.src = '';
      imgElement.style.display = 'none';
      imgElement.classList.remove('visible', 'partial');
      imgElement.style.filter = '';
      imgElement.style.opacity = '';
    }
  });
}

// Handle partial image update
function handlePartialImage(imageType, imageData, index) {
  if (!imageData || !imageData.startsWith('data:image')) {
    return;
  }

  const imgElement = document.getElementById(`${imageType}Image`);
  if (imgElement) {
    imgElement.src = imageData;
    imgElement.style.display = 'block';
    imgElement.style.filter = 'blur(1px)';
    imgElement.style.opacity = '0.8';
    imgElement.classList.add('partial');
    imgElement.classList.remove('visible');
  }

  // Track for generated images global
  if (!generatedImages) generatedImages = {};
  generatedImages[imageType] = imageData;
}

// Handle complete image
function handleCompleteImage(imageType, imageData) {
  const imgElement = document.getElementById(`${imageType}Image`);
  
  if (imageData && imageData.startsWith('data:image')) {
    // We have a final image - show it clearly
    if (imgElement) {
      imgElement.src = imageData;
      imgElement.style.display = 'block';
      imgElement.style.filter = '';
      imgElement.style.opacity = '1';
      imgElement.classList.remove('partial');
      imgElement.classList.add('visible');
    }

    // Update generated images global
    if (!generatedImages) generatedImages = {};
    generatedImages[imageType] = imageData;
  } else {
    // No final image provided - keep the last partial as final
    if (imgElement && imgElement.src && imgElement.src.startsWith('data:image')) {
      imgElement.style.filter = '';
      imgElement.style.opacity = '1';
      imgElement.classList.remove('partial');
      imgElement.classList.add('visible');
      
      // Use the current partial as the final image
      if (!generatedImages) generatedImages = {};
      generatedImages[imageType] = imgElement.src;
    }
  }
}

// Progress bar functions
function showProgressBar() {
  document.getElementById('progressContainer').style.display = 'block';
  document.getElementById('funnyStatus').style.display = 'block';
  showStatus('generateStatus', '', 'loading');
}

function hideProgressBar() {
  document.getElementById('progressContainer').style.display = 'none';
  document.getElementById('funnyStatus').style.display = 'none';
}

function updateProgress(percentage, message) {
  const progressBar = document.getElementById('progressBar');
  const funnyStatus = document.getElementById('funnyStatus');

  progressBar.style.width = percentage + '%';
  progressBar.textContent = percentage + '%';
  funnyStatus.textContent = message;
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

// Display processed logos
function displayProcessedLogos(logos) {
  if (!logos || logos.length === 0) return;

  const logoSection = document.getElementById('companyLogos');
  const logoGrid = document.getElementById('processedLogos');

  logoSection.style.display = 'block';
  logoGrid.innerHTML = '';

  logos.forEach((logoSet, index) => {
    const logoCard = document.createElement('div');
    logoCard.className = 'result-card';
    logoCard.innerHTML = `
      <h4>Logo Variants</h4>
      <div class="logo-variants">
        <div class="logo-variant ${selectedLogoVariant === 'original' ? 'selected' : ''}" 
             onclick="selectLogoVariant('original', this)">
          ${typeof logoSet.original === 'object' ? logoSet.original.content : `<img src="${logoSet.original}" style="width:100%; height:100%; object-fit:contain;" />`}
        </div>
        <div class="logo-variant ${selectedLogoVariant === 'black' ? 'selected' : ''}" 
             onclick="selectLogoVariant('black', this)">
          ${typeof logoSet.black === 'object' ? logoSet.black.content : `<img src="${logoSet.black}" style="width:100%; height:100%; object-fit:contain;" />`}
        </div>
        <div class="logo-variant ${selectedLogoVariant === 'white' ? 'selected' : ''}" 
             onclick="selectLogoVariant('white', this)" 
             style="background: #333;">
          ${typeof logoSet.white === 'object' ? logoSet.white.content : `<img src="${logoSet.white}" style="width:100%; height:100%; object-fit:contain;" />`}
        </div>
      </div>
      <p style="font-size: 12px; text-align: center;">Original | Black | White</p>
    `;
    logoGrid.appendChild(logoCard);
  });
}

// Select logo variant
function selectLogoVariant(variant, element) {
  selectedLogoVariant = variant;
  document.querySelectorAll('.logo-variant').forEach(item => item.classList.remove('selected'));
  element.classList.add('selected');
}

// Display generated images
function displayGeneratedImages(images) {
  console.log('=== DISPLAYING GENERATED IMAGES ===');
  console.log('Received images object:', images);

  const imageTypes = {
    hero: 'Hero',
    staged: 'Staged',
    lifestyle: 'Lifestyle',
    editorial: 'Editorial'
  };

  Object.entries(imageTypes).forEach(([type, label]) => {
    const imgElement = document.getElementById(`${type}Image`);
    if (imgElement && images[type]) {
      imgElement.src = images[type];
      imgElement.classList.add('visible');
    }
  });

  // Populate Step 4 generated images grid
  populateGeneratedImagesGrid(images);
}

// Populate generated images for Step 4
function populateGeneratedImagesGrid(images) {
  const grid = document.getElementById('generatedImagesGrid');
  grid.innerHTML = '';

  const imageTypes = {
    hero: 'Hero',
    staged: 'Staged', 
    lifestyle: 'Lifestyle',
    editorial: 'Editorial'
  };

  Object.entries(imageTypes).forEach(([type, label]) => {
    const imageUrl = images[type];
    if (imageUrl) {
      const imageItem = document.createElement('div');
      imageItem.className = 'generated-image-item';
      imageItem.innerHTML = `
        <img src="${imageUrl}" alt="${type} image" />
        <div class="label">${label} Image</div>
      `;
      imageItem.onclick = () => selectGeneratedImage(imageItem, imageUrl);
      grid.appendChild(imageItem);
    }
  });
}

// Select generated image for layout analysis
function selectGeneratedImage(element, imageUrl) {
  document.querySelectorAll('.generated-image-item').forEach(item => item.classList.remove('selected'));
  element.classList.add('selected');
  element.dataset.imageUrl = imageUrl;
}

// Step 4: Analyze Layout
async function analyzeLayout() {
  const selectedImage = document.querySelector('.generated-image-item.selected');
  if (!selectedImage) {
    alert('Please select a generated image for layout analysis');
    return;
  }

  const imageUrl = selectedImage.dataset.imageUrl;
  console.log('Using generated image URL:', imageUrl);

  // Display original image from URL
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.getElementById('originalCanvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 400, 400);
  };
  img.src = imageUrl;

  console.log('Starting layout analysis...');
  showStatus('layoutStatus', 'Analyzing layout...', 'loading');

  try {
    const response = await fetch(API.analyzeLayout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: imageUrl })
    });

    const data = await response.json();
    console.log('Layout analysis response:', data);

    if (data.success) {
      layoutAnalysis = data;
      displayLayoutAnalysis(data);
      document.getElementById('step5').style.display = 'block';
      updateFigmaPreview();
      showStatus('layoutStatus', 'Layout analysis completed!', 'success');
    } else {
      console.error('Layout analysis failed:', data.error);
      showStatus('layoutStatus', `Error: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Layout analysis error:', error);
    showStatus('layoutStatus', `Error: ${error.message}`, 'error');
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

// Update Figma preview
function updateFigmaPreview() {
  if (!adElements || !layoutAnalysis) return;

  const headerChoice = document.getElementById('headerTextChoice').value;
  const subheadChoice = document.getElementById('subheadTextChoice').value;

  const headerText = headerChoice === 'shortTitle' ? adElements.shortTitle : document.getElementById('sloganSelect').value;
  const subheadText = subheadChoice === 'slogan' ? document.getElementById('sloganSelect').value : adElements.shortDescription;

  const preview = document.getElementById('figmaPreview');
  preview.innerHTML = `
    <p><strong>Header:</strong> "${headerText}" (${headerChoice === 'shortTitle' ? 'Short Title' : 'Slogan'})</p>
    <p><strong>Subhead:</strong> "${subheadText}" (${subheadChoice === 'slogan' ? 'Slogan' : 'Short Description'})</p>
    <p><strong>CTA:</strong> "${adElements.cta}"</p>
    ${processedLogos ? `<p><strong>Logo:</strong> ${selectedLogoVariant} variant</p>` : ''}
    <p><strong>Layout:</strong> ${Object.keys(layoutAnalysis.layout).filter(key => layoutAnalysis.layout[key]).join(', ')} positioned</p>
  `;
}

// Send to Figma
async function sendToFigma() {
  if (!layoutAnalysis || !adElements) {
    showStatus('figmaStatus', 'Please complete layout analysis first', 'error');
    return;
  }

  showStatus('figmaStatus', 'Preparing Figma payload...', 'loading');

  const headerChoice = document.getElementById('headerTextChoice').value;
  const subheadChoice = document.getElementById('subheadTextChoice').value;

  const headerText = headerChoice === 'shortTitle' ? adElements.shortTitle : document.getElementById('sloganSelect').value;
  const subheadText = subheadChoice === 'slogan' ? document.getElementById('sloganSelect').value : adElements.shortDescription;

  const figmaPayload = {
    layout: layoutAnalysis.layout,
    content: {
      header: {
        text: headerText,
        source: headerChoice,
        font: enrichedPackage.headerFont
      },
      subhead: {
        text: subheadText,
        source: subheadChoice,
        font: enrichedPackage.subheadFont
      },
      cta: {
        text: adElements.cta
      },
      logo: processedLogos && processedLogos.length > 0 ? {
        variant: selectedLogoVariant,
        data: processedLogos[0][selectedLogoVariant]
      } : null
    },
    images: generatedImages,
    style: {
      name: enrichedPackage.marketingStyleName,
      description: enrichedPackage.marketingStyleDescription
    }
  };

  try {
    const response = await fetch(API.sendToFigma, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(figmaPayload)
    });

    const data = await response.json();

    if (data.success) {
      showStatus('figmaStatus', `Successfully sent to Figma! File ID: ${data.figmaFileId}`, 'success');

      if (data.figmaUrl) {
        const link = document.createElement('a');
        link.href = data.figmaUrl;
        link.textContent = 'Open in Figma';
        link.target = '_blank';
        link.style.marginLeft = '10px';
        link.style.color = 'white';
        document.getElementById('figmaStatus').appendChild(link);
      }
    } else {
      showStatus('figmaStatus', `Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus('figmaStatus', `Error: ${error.message}`, 'error');
  }
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

// Add CSS for status messages and image transitions
const style = document.createElement('style');
style.textContent = `
  .loading { color: #007bff; }
  .error { color: #dc3545; }
  .success { color: #28a745; }

  .generated-image {
    width: 100%;
    height: 300px;
    object-fit: contain;
    border-radius: 8px;
    margin-top: 10px;
    transition: all 0.3s ease-in-out;
  }

  .generated-image.visible {
    opacity: 1;
    filter: none;
  }

  .generated-image.partial {
    filter: blur(1px);
    opacity: 0.8;
  }
`;
document.head.appendChild(style);