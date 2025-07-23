require("dotenv").config();
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const dataLoader = require("./src/data/dataLoader");

// Import all modules
const { extractProductInfo } = require("./src/analyzers/htmlParser");
const {
  prepareProductPackage,
  generateOptimizedContent,
  generateSloganPhrases,
  matchBestCta,
} = require("./src/generators/productEnrichment");
const {
  generateHeroImage,
  generateStagedImage,
  generateLifestylePrompt,
  generateEditorialImage,
  generateLifestyleEdit,
  processCompanyLogos,
} = require("./src/generators/imageGenerator");
const GridAnalyzer = require("./src/analyzers/gridAnalyzer");
const LayoutEngine = require("./src/generators/layoutEngine");
const layoutConfig = require("./src/config/layoutConfig");

const app = express();
const upload = multer({ memory: true });

app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize data on startup
async function initialize() {
  try {
    await dataLoader.initialize();
    console.log("Data files loaded successfully");
  } catch (error) {
    console.error("Failed to load data files:", error);
    process.exit(1);
  }
}

// API Routes

// NEW: Fetch HTML from URL
app.post("/api/fetch-url", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    console.log("Fetching URL:", url);

    const fetch = require("node-fetch");

    // Try multiple user agents and headers to avoid blocking
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      timeout: 15000, // 15 second timeout
      redirect: "follow", // Follow redirects
      compress: true, // Handle gzip compression
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    if (!html || html.length < 100) {
      throw new Error("Received empty or very short response");
    }

    console.log("Successfully fetched HTML, length:", html.length);

    res.json({ success: true, html });
  } catch (error) {
    console.error("URL fetch error:", error);

    // Provide more specific error messages
    let errorMessage = error.message;

    if (error.code === "ENOTFOUND") {
      errorMessage = "Domain not found. Please check the URL is correct.";
    } else if (error.code === "ECONNREFUSED") {
      errorMessage = "Connection refused. The server may be down.";
    } else if (error.code === "ECONNRESET") {
      errorMessage = "Connection reset. The server may be blocking requests.";
    } else if (error.message.includes("timeout")) {
      errorMessage = "Request timed out. The server took too long to respond.";
    } else if (error.message.includes("403")) {
      errorMessage =
        "Access forbidden. The website may be blocking automated requests.";
    } else if (error.message.includes("404")) {
      errorMessage = "Page not found. Please check the URL is correct.";
    }

    res.status(500).json({
      success: false,
      error: `Failed to fetch URL: ${errorMessage}`,
    });
  }
});

// 1. Parse product from HTML (Enhanced with logo extraction)
app.post("/api/extract-product", async (req, res) => {
  try {
    const { html } = req.body;
    const productInfo = extractProductInfo(html);
    res.json({ success: true, product: productInfo });
  } catch (error) {
    console.error("Extract error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Prepare enriched package (Enhanced to handle logos)
app.post("/api/prepare-package", async (req, res) => {
  try {
    const { product } = req.body;

    // DEBUG: Log incoming product data
    console.log("=== PRODUCT INPUT DEBUG ===");
    console.log("Original Title:", product.title);
    console.log("Original Description:", product.description);
    console.log("Price:", product.price);
    console.log("Images Count:", product.images ? product.images.length : 0);
    console.log("Logos Count:", product.logos ? product.logos.length : 0);
    console.log("============================");

    const enrichedPackage = await prepareProductPackage(product);

    // DEBUG: Log enriched output
    console.log("=== ENRICHED PACKAGE DEBUG ===");
    console.log("Enriched Title:", enrichedPackage.title);
    console.log("Enriched Description:", enrichedPackage.description);
    console.log("Usage Description:", enrichedPackage.usageDescription);
    console.log("Marketing Style:", enrichedPackage.marketingStyleName);
    console.log("===============================");

    res.json({ success: true, package: enrichedPackage });
  } catch (error) {
    console.error("Package error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Generate ad elements (copy)
app.post("/api/generate-ad-elements", async (req, res) => {
  try {
    const { productPackage } = req.body;

    // DEBUG: Log the incoming product package
    console.log("=== PRODUCT PACKAGE DEBUG ===");
    console.log("Title:", productPackage.title);
    console.log("Description:", productPackage.description);
    console.log("Usage:", productPackage.usageDescription);
    console.log("Style:", productPackage.marketingStyleName);
    console.log("===============================");

    // Validate we have minimum required data
    if (!productPackage.title || productPackage.title.trim() === "") {
      throw new Error("Product title is missing or empty");
    }

    if (
      !productPackage.description ||
      productPackage.description.trim() === ""
    ) {
      throw new Error("Product description is missing or empty");
    }

    // Generate copy elements in parallel
    const [shortContent, slogans, cta] = await Promise.all([
      generateOptimizedContent(
        productPackage.title,
        productPackage.description,
      ), // Use direct title/description
      generateSloganPhrases(productPackage),
      matchBestCta(productPackage),
    ]);

    // DEBUG: Log generated content
    console.log("=== GENERATED CONTENT DEBUG ===");
    console.log("Short Title:", shortContent.shortTitle);
    console.log("Short Description:", shortContent.shortDescription);
    console.log("Slogans:", slogans);
    console.log("CTA:", cta);
    console.log("================================");

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
          subheadFont: productPackage.subheadFont,
        },
      },
    });
  } catch (error) {
    console.error("Generate elements error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Process logo variants
app.post("/api/process-logos", async (req, res) => {
  try {
    const { logos } = req.body;

    if (!logos || logos.length === 0) {
      return res.json({ success: true, processedLogos: [] });
    }

    const processedLogos = await processCompanyLogos(logos);
    res.json({ success: true, processedLogos });
  } catch (error) {
    console.error("Logo processing error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Generate images (Enhanced with PARALLEL generation)
app.post('/api/generate-images', async (req, res) => {
  try {
    const { product, imageUrl } = req.body;

    console.log('Starting PARALLEL image generation for:', product.title);

    // Generate ALL images in parallel using Promise.allSettled
    const imagePromises = [
      // Hero image (clean product shot) with PhotoRoom
      generateHeroImage({ ...product, images: [imageUrl] })
        .then(result => ({ type: 'hero', result }))
        .catch(error => ({ type: 'hero', result: null, error: error.message })),

      // Staged image (product in context) with reference  
      generateStagedImage({ ...product, images: [imageUrl] })
        .then(result => ({ type: 'staged', result }))
        .catch(error => ({ type: 'staged', result: null, error: error.message })),

      // Lifestyle image using reference approach (with product)
      generateLifestyleEdit({ 
        productPackage: product,
        referenceImageUrl: imageUrl 
      })
        .then(result => {
          // Handle base64 conversion if needed
          if (result && !result.startsWith('data:')) {
            result = `data:image/png;base64,${result}`;
          }
          return { type: 'lifestyle', result };
        })
        .catch(error => ({ type: 'lifestyle', result: null, error: error.message })),

      // Editorial image (lifestyle moment without product)
      generateEditorialImage(product)
        .then(result => ({ type: 'editorial', result }))
        .catch(error => ({ type: 'editorial', result: null, error: error.message }))
    ];

    console.log('Waiting for all 4 image generations to complete...');

    // Wait for ALL promises to complete (successful or failed)
    const results = await Promise.allSettled(imagePromises);

    // Process results
    const images = {};
    let successCount = 0;

    results.forEach((promiseResult, index) => {
      if (promiseResult.status === 'fulfilled') {
        const { type, result, error } = promiseResult.value;
        images[type] = result;

        if (result) {
          successCount++;
          console.log(`${type} image generated: Success`);
        } else {
          console.error(`${type} image failed:`, error);
        }
      } else {
        console.error(`Promise ${index} rejected:`, promiseResult.reason);
      }
    });

    console.log(`PARALLEL image generation complete: ${successCount}/4 images successful`);

    res.json({ success: true, images });
  } catch (error) {
    console.error('Generate images error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Analyze layout (Enhanced to handle both file upload and URL)
app.post("/api/analyze-layout", upload.single("image"), async (req, res) => {
  const startTime = Date.now();
  let imageBuffer;

  try {
    console.log("=== LAYOUT ANALYSIS DEBUG START ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request headers:", JSON.stringify(req.headers, null, 2));
    console.log("File upload present:", req.file ? "YES" : "NO");
    console.log("Image URL in body:", req.body.imageUrl ? "YES" : "NO");

    if (req.file) {
      console.log("File details:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }

    if (req.body.imageUrl) {
      const imageUrl = req.body.imageUrl;
      console.log("Image URL details:", {
        length: imageUrl.length,
        type: imageUrl.startsWith("data:") ? "DATA_URL" : imageUrl.startsWith("http") ? "HTTP_URL" : "UNKNOWN",
        preview: imageUrl.substring(0, 50) + "...",
        hasComma: imageUrl.includes(","),
        dataTypeMatch: imageUrl.match(/^data:image\/([^;]+);base64,/)
      });
    }

    if (req.file) {
      // File upload
      console.log("Processing uploaded file:", req.file.originalname);
      imageBuffer = req.file.buffer;
    } else if (req.body.imageUrl) {
      // Image URL - handle both HTTP URLs and base64 data URLs
      const imageUrl = req.body.imageUrl;
      console.log("Processing image URL, type:", imageUrl.substring(0, 30));

      if (imageUrl.startsWith("data:image/")) {
        // Handle base64 data URL
        console.log("Processing base64 data URL");
        try {
          const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (!base64Match) {
            throw new Error("Invalid data URL format - expected data:image/[type];base64,[data]");
          }

          const base64Data = base64Match[1];
          if (!base64Data || base64Data.length === 0) {
            throw new Error("Invalid data URL format - missing base64 data");
          }

          console.log("Base64 data preview:", base64Data.substring(0, 50) + "...");
          console.log("Base64 data length:", base64Data.length);

          imageBuffer = Buffer.from(base64Data, "base64");
          console.log("Base64 image decoded successfully, buffer size:", imageBuffer.length);
        } catch (base64Error) {
          console.error(`Base64 decode error details:`, {
            message: base64Error.message,
            stack: base64Error.stack,
            urlLength: imageUrl.length,
            urlPreview: imageUrl.substring(0, 100)
          });
          throw new Error(`Failed to decode base64 image: ${base64Error.message}`);
        }
      } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        // Handle regular HTTP URL
        console.log("Processing HTTP URL:", imageUrl);
        try {
          const fetch = require('node-fetch');
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          imageBuffer = await response.buffer();
          console.log("HTTP image fetched successfully, size:", imageBuffer.length);
        } catch (fetchError) {
          console.error("HTTP fetch error details:", {
            message: fetchError.message,
            stack: fetchError.stack,
            url: imageUrl
          });
          throw new Error(`Failed to fetch image: ${fetchError.message}`);
        }
      } else {
        console.error("Unsupported URL format details:", {
          url: imageUrl.substring(0, 100),
          startsWithData: imageUrl.startsWith("data:"),
          startsWithHttp: imageUrl.startsWith("http"),
          length: imageUrl.length
        });
        throw new Error(`Unsupported URL format: ${imageUrl.substring(0, 50)}...`);
      }
    } else {
      console.error("No image source provided in request");
      return res.status(400).json({
        success: false,
        error: "No image provided. Please upload a file or provide an image URL.",
      });
    }

    console.log("Processing image with Sharp...");
    console.log("Image buffer size before Sharp:", imageBuffer.length);

    let processedImage;

    try {
      processedImage = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .resize(400, 400, {
          fit: "cover",
          position: "center",
        })
        .toBuffer({ resolveWithObject: true });

      console.log("Sharp processing successful:", {
        width: processedImage.info.width,
        height: processedImage.info.height,
        channels: processedImage.info.channels,
        size: processedImage.info.size
      });
    } catch (sharpError) {
      console.error("Sharp processing error details:", {
        message: sharpError.message,
        stack: sharpError.stack,
        bufferSize: imageBuffer.length
      });
      throw new Error(`Image processing failed: ${sharpError.message}`);
    }

    const { data, info } = processedImage;

    console.log("Initializing grid analyzer...");
    console.log("Grid analyzer input:", {
      dataLength: data.length,
      width: info.width,
      height: info.height,
      expectedDataLength: info.width * info.height * info.channels
    });

    const analyzer = new GridAnalyzer(data, info.width, info.height, layoutConfig);
    const gridData = analyzer.analyze();
    console.log("Grid analysis complete, grid size:", gridData.length);

    console.log("Running layout engine...");
    const layoutEngine = new LayoutEngine(gridData, layoutConfig);
    const layout = layoutEngine.generateLayout();

    const foundElements = Object.keys(layout).filter((key) => layout[key]);
    console.log("Layout analysis completed successfully");
    console.log("Found elements:", foundElements);
    console.log("Processing time:", Date.now() - startTime, "ms");
    console.log("=== LAYOUT ANALYSIS DEBUG END ===");

    res.json({
      success: true,
      layout,
      metadata: {
        gridSize: layoutConfig.grid.size,
        imageSize: { width: info.width, height: info.height },
        processingTime: Date.now() - startTime,
        foundElements: foundElements
      },
    });
  } catch (error) {
    console.error("=== LAYOUT ANALYSIS ERROR ===");
    console.error("Error occurred at:", Date.now() - startTime, "ms");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Request details:", {
      hasFile: !!req.file,
      hasImageUrl: !!req.body.imageUrl,
      bodyKeys: Object.keys(req.body),
      bufferSize: imageBuffer ? imageBuffer.length : "N/A"
    });
    console.error("=== END ERROR LOG ===");

    res.status(500).json({
      success: false,
      error: `Layout analysis failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime
    });
  }
});

// 7. Send to Figma (NEW)
app.post("/api/send-to-figma", async (req, res) => {
  try {
    const { layout, content, images, style } = req.body;

    // Here we would integrate with Figma API
    // For now, we'll simulate the response
    const figmaPayload = {
      name: `AI Ad - ${content.header.text}`,
      layout: layout,
      elements: {
        header: {
          text: content.header.text,
          font: content.header.font,
          position: layout.header,
        },
        subhead: {
          text: content.subhead.text,
          font: content.subhead.font,
          position: layout.subhead,
        },
        logo: content.logo
          ? {
              data: content.logo.data,
              position: layout.logo,
            }
          : null,
        cta: {
          text: content.cta.text,
          position: layout.cta,
        },
      },
      images: images,
      style: style,
    };

    // TODO: Implement actual Figma API integration
    const figmaResponse = await sendToFigmaAPI(figmaPayload);

    res.json({
      success: true,
      figmaFileId: figmaResponse.fileId || "demo-file-id",
      figmaUrl: figmaResponse.url || "https://figma.com/file/demo",
      payload: figmaPayload, // For debugging
    });
  } catch (error) {
    console.error("Figma send error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mock Figma API integration (replace with real implementation)
async function sendToFigmaAPI(payload) {
  const { FIGMA_ACCESS_TOKEN } = require("./src/config/apiKeys");

  if (!FIGMA_ACCESS_TOKEN) {
    console.log("Figma token not configured, using mock response");
    console.log("Figma Payload:", JSON.stringify(payload, null, 2));

    return {
      fileId: `ai-ad-mock-${Date.now()}`,
      url: `https://figma.com/file/ai-ad-mock-${Date.now()}`,
      success: true,
      mock: true,
    };
  }

  try {
    const FigmaAPI = require("./src/integrations/figmaAPI");
    const figmaClient = new FigmaAPI(FIGMA_ACCESS_TOKEN);

    const result = await figmaClient.createAdFrame(payload);
    return result;
  } catch (error) {
    console.error("Figma API integration failed:", error);

    // Fallback to mock response
    return {
      fileId: `ai-ad-error-${Date.now()}`,
      url: `https://figma.com/file/ai-ad-error-${Date.now()}`,
      success: true,
      error: error.message,
      mock: true,
    };
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server
const PORT = process.env.PORT || 3000;

initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("New features added:");
    console.log("✅ Enhanced header/subhead size rules");
    console.log("✅ Logo extraction and processing");
    console.log("✅ Reference images in generation");
    console.log("✅ Generated images in Step 4");
    console.log("✅ Figma API preparation");
  });
});