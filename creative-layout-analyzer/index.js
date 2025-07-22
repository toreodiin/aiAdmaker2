const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

const GridAnalyzer = require('./src/gridAnalyzer');
const LayoutEngine = require('./src/layoutEngine');
const config = require('./src/layoutConfig');

const app = express();
const upload = multer({ memory: true });

// Add debugging
console.log('Current directory:', __dirname);
console.log('Public path:', path.join(__dirname, 'public'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add a root route handler
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a test route
app.get('/test', (req, res) => {
  res.send('Server is working!');
});

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    // Convert image to raw pixel data
    const imageBuffer = req.file.buffer;
    const metadata = await sharp(imageBuffer).metadata();
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .ensureAlpha()
      .resize(400, 400) // Standard size
      .toBuffer({ resolveWithObject: true });
    // Run analysis
    const analyzer = new GridAnalyzer(data, info.width, info.height, config);
    const gridData = analyzer.analyze();
    const layoutEngine = new LayoutEngine(gridData, config);
    const layout = layoutEngine.generateLayout();
    res.json({
      success: true,
      layout,
      metadata: {
        originalSize: { width: metadata.width, height: metadata.height },
        analyzedSize: { width: info.width, height: info.height },
        gridSize: config.grid.size
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Try accessing: http://localhost:${PORT}/test`);
  console.log(`Main app at: http://localhost:${PORT}/`);
});