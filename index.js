require('dotenv').config();
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const dataLoader = require('./src/data/dataLoader');

// Import all modules
const { extractProductInfo } = require('./src/analyzers/htmlParser');
const { 
  prepareProductPackage, 
  generateShortTitleAndDescription, 
  generateSloganPhrases, 
  matchBestCta 
} = require('./src/generators/productEnrichment');
const { 
  generateHeroImage, 
  generateStagedImage, 
  generateLifestylePrompt,
  generateLifestyleEdit 
} = require('./src/generators/imageGenerator');
const GridAnalyzer = require('./src/analyzers/gridAnalyzer');
const LayoutEngine = require('./src/generators/layoutEngine');
const layoutConfig = require('./src/config/layoutConfig');

const app = express();
const upload = multer({ memory: true });

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize data on startup
async function initialize() {
  try {
    await dataLoader.initialize();
    console.log('Data files loaded successfully');
  } catch (error) {
    console.error('Failed to load data files:', error);
    process.exit(1);
  }
}

// API Routes

// 1. Parse product from HTML
app.post('/api/extract-product', async (req, res) => {
  try {
    const { html } = req.body;
    const productInfo = extractProductInfo(html);
    res.json({ success: true, product: productInfo });
  } catch (error) {
    console.error('Extract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Prepare enriched package
app.post('/api/prepare-package', async (req, res) => {
  try {
    const { product } = req.body;
    const enrichedPackage = await prepareProductPackage(product);
    res.json({ success: true, package: enrichedPackage });
  } catch (error) {
    console.error('Package error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Generate ad elements (copy)
app.post('/api/generate-ad-elements', async (req, res) => {
  try {
    const { productPackage } = req.body;

    // Generate copy elements in parallel
    const [shortContent, slogans, cta] = await Promise.all([
      generateShortTitleAndDescription(productPackage),
      generateSloganPhrases(productPackage),
      matchBestCta(productPackage)
    ]);

    res.json({ 
      success: true, 
      elements: {
        shortTitle: shortContent.shortTitle,
        shortDescription: shortContent.shortDescription,
        slogans: slogans,
        cta,
        style: {
          name: productPackage.marketingStyleName,
          description: productPackage.marketingStyleDescription,
          headerFont: productPackage.headerFont,
          subheadFont: productPackage.subheadFont
        }
      }
    });
  } catch (error) {
    console.error('Generate elements error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Generate images
app.post('/api/generate-images', async (req, res) => {
  try {
    const { product, imageUrl } = req.body;

    const images = {};

    // Hero image
    try {
      images.hero = await generateHeroImage({ ...product, imageUrl });
    } catch (e) {
      console.error('Hero image failed:', e);
      images.hero = null;
    }

    // Staged image  
    try {
      images.staged = await generateStagedImage({ ...product, imageUrl });
    } catch (e) {
      console.error('Staged image failed:', e);
      images.staged = null;
    }

    // Lifestyle image
    try {
      const lifestylePrompt = await generateLifestylePrompt(product);
      images.lifestyle = await generateLifestyleEdit({ 
        prompt: lifestylePrompt, 
        referenceImageUrl: imageUrl 
      });
      images.lifestyle = `data:image/png;base64,${images.lifestyle}`;
    } catch (e) {
      console.error('Lifestyle image failed:', e);
      images.lifestyle = null;
    }

    res.json({ success: true, images });
  } catch (error) {
    console.error('Generate images error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Analyze layout
app.post('/api/analyze-layout', upload.single('image'), async (req, res) => {
  try {
    const imageBuffer = req.file.buffer;
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .ensureAlpha()
      .resize(400, 400)
      .toBuffer({ resolveWithObject: true });

    const analyzer = new GridAnalyzer(data, info.width, info.height, layoutConfig);
    const gridData = analyzer.analyze();

    const layoutEngine = new LayoutEngine(gridData, layoutConfig);
    const layout = layoutEngine.generateLayout();

    res.json({
      success: true,
      layout,
      metadata: {
        gridSize: layoutConfig.grid.size,
        imageSize: { width: info.width, height: info.height }
      }
    });
  } catch (error) {
    console.error('Layout analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});