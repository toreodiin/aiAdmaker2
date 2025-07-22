// Debug function to test switching
function testSwitch() {
  const htmlSection = document.getElementById('htmlInputSection');
  const urlSection = document.getElementById('urlInputSection');
  const urlRadio = document.getElementById('importURL');

  console.log('Testing switch...');
  console.log('HTML section:', htmlSection);
  console.log('URL section:', urlSection);
  console.log('URL radio checked:', urlRadio.checked);

  // Force switch to URL
  urlRadio.checked = true;
  htmlSection.style.display = 'none';
  urlSection.style.display = 'block';

  console.log('Forced switch complete');
}// Global state
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

// Step 3: Generate Ad Elements with Progress Bar
async function generateAdElements() {
  showProgressBar();
  updateProgress(10, 'Getting started...');

  try {
    // Generate copy elements
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

    // Process logos if available
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

    // Generate images with progress updates
    updateProgress(60, 'Creating stunning visuals...');

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

    updateProgress(85, 'Almost there... Working my ass off! 💪');

    const imageData = await imageResponse.json();

    if (!imageData.success) {
      throw new Error(imageData.error);
    }

    generatedImages = imageData.images;
    displayGeneratedImages(imageData.images);

    updateProgress(100, 'Boom! All done! 🎉');

    setTimeout(() => {
      hideProgressBar();
      showStatus('generateStatus', 'All elements generated successfully!', 'success');
      document.getElementById('step4').style.display = 'block';
    }, 1000);

  } catch (error) {
    hideProgressBar();
    showStatus('generateStatus', `Error: ${error.message}`, 'error');
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

  // Add some funny messages for different stages
  if (percentage >= 90) {
    funnyStatus.textContent = "Almost there... putting the finishing touches! ✨";
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
  if (images.hero) {
    document.getElementById('heroImage').src = images.hero;
  }
  if (images.staged) {
    document.getElementById('stagedImage').src = images.staged;
  }
  if (images.lifestyle) {
    // Show lifestyle image in Step 3
    const lifestyleContainer = document.getElementById('lifestyleImageContainer');
    if (lifestyleContainer) {
      document.getElementById('lifestyleImage').src = images.lifestyle;
    } else {
      // Create lifestyle image container if it doesn't exist
      createLifestyleImageDisplay(images.lifestyle);
    }
  }

  // Populate Step 4 generated images grid
  populateGeneratedImagesGrid(images);
}

// Create lifestyle image display in Step 3
function createLifestyleImageDisplay(lifestyleImageUrl) {
  const resultsGrid = document.querySelector('#step3 .results-grid');
  const lifestyleCard = document.createElement('div');
  lifestyleCard.className = 'result-card';
  lifestyleCard.id = 'lifestyleImageContainer';
  lifestyleCard.innerHTML = `
    <h4>Lifestyle Image</h4>
    <img id="lifestyleImage" class="generated-image" src="${lifestyleImageUrl}" />
  `;
  resultsGrid.appendChild(lifestyleCard);
}

// Populate generated images for Step 4
function populateGeneratedImagesGrid(images) {
  const grid = document.getElementById('generatedImagesGrid');
  grid.innerHTML = '';

  Object.entries(images).forEach(([type, imageUrl]) => {
    if (imageUrl) {
      const imageItem = document.createElement('div');
      imageItem.className = 'generated-image-item';
      imageItem.innerHTML = `
        <img src="${imageUrl}" alt="${type} image" />
        <div class="label">${type.charAt(0).toUpperCase() + type.slice(1)} Image</div>
      `;
      imageItem.onclick = () => selectGeneratedImage(imageItem, imageUrl);
      grid.appendChild(imageItem);
    }
  });
}

// Handle image source selection
document.addEventListener('DOMContentLoaded', function() {
  const sourceRadios = document.querySelectorAll('input[name="imageSource"]');
  sourceRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      const uploadSection = document.getElementById('uploadSection');
      const generatedSection = document.getElementById('generatedSection');

      if (this.value === 'upload') {
        uploadSection.style.display = 'block';
        generatedSection.style.display = 'none';
      } else {
        uploadSection.style.display = 'none';
        generatedSection.style.display = 'block';
      }
    });
  });

  // Update Figma preview when selections change
  const headerChoice = document.getElementById('headerTextChoice');
  const subheadChoice = document.getElementById('subheadTextChoice');

  if (headerChoice) {
    headerChoice.addEventListener('change', updateFigmaPreview);
  }
  if (subheadChoice) {
    subheadChoice.addEventListener('change', updateFigmaPreview);
  }
});

// Select generated image for layout analysis
function selectGeneratedImage(element, imageUrl) {
  document.querySelectorAll('.generated-image-item').forEach(item => item.classList.remove('selected'));
  element.classList.add('selected');
  element.dataset.imageUrl = imageUrl;
}

// Step 4: Analyze Layout
async function analyzeLayout() {
  const imageSource = document.querySelector('input[name="imageSource"]:checked').value;
  let formData = new FormData();

  if (imageSource === 'upload') {
    const fileInput = document.getElementById('layoutImage');
    const file = fileInput.files[0];

    if (!file) {
      alert('Please select an image for layout analysis');
      return;
    }

    console.log('Uploading file:', file.name, file.size, 'bytes');
    formData.append('image', file);

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

  } else {
    const selectedImage = document.querySelector('.generated-image-item.selected');
    if (!selectedImage) {
      alert('Please select a generated image for layout analysis');
      return;
    }

    const imageUrl = selectedImage.dataset.imageUrl;
    console.log('Using generated image URL:', imageUrl);

    // For URL-based analysis, send as JSON
    formData = null; // We'll use JSON instead

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
  }

  console.log('Starting layout analysis...');
  showStatus('layoutStatus', 'Analyzing layout...', 'loading');

  try {
    let response;

    if (formData) {
      // File upload
      response = await fetch(API.analyzeLayout, {
        method: 'POST',
        body: formData
      });
    } else {
      // URL-based
      const imageUrl = document.querySelector('.generated-image-item.selected').dataset.imageUrl;
      response = await fetch(API.analyzeLayout, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageUrl })
      });
    }

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