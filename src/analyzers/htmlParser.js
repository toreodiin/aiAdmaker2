const sharp = require('sharp');

function extractProductInfo(html) {
  if (!html) {
    return { title: '', description: '', price: '', images: [], logos: [] };
  }

  const getMeta = (property) => {
    const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([\\s\\S]*?)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1].trim() : '';
  };

  const title = getMeta('og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? '');

  const descBlockMatch = html.match(/<div[^>]+class=["']product-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  let description = descBlockMatch 
    ? descBlockMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : (getMeta('og:description') || '');

  description = description
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const price = getMeta('og:price:amount') || '';

  // ✅ SMART: Grab only <img> inside product gallery containers
  const galleryImgs = [];
  const galleryRegex = /<[^>]*(product-gallery|product__media|product__images)[^>]*>([\s\S]*?)<\/[^>]*>/gi;
  let galleryMatch;
  while ((galleryMatch = galleryRegex.exec(html)) !== null) {
    const galleryContent = galleryMatch[2];
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(galleryContent)) !== null) {
      galleryImgs.push(imgMatch[1]);
    }

    const aHrefRegex = /<a[^>]+href=["']([^"']+\.(jpg|png|webp))["']/gi;
    while ((imgMatch = aHrefRegex.exec(galleryContent)) !== null) {
      galleryImgs.push(imgMatch[1]);
    }
  }

  // Fallback: if no galleries matched, fallback to og:image
  if (galleryImgs.length === 0) {
    const ogRegex = /<meta[^>]+property=["']og:image(:secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let match;
    while ((match = ogRegex.exec(html)) !== null) {
      galleryImgs.push(match[2]);
    }
  }

  // ✅ NEW: Extract logos from header and navigation areas
  const logos = extractLogos(html);

  // Clean and normalize product images
  const cleaned = galleryImgs.map(url => {
    let cleanUrl = url.trim();
    cleanUrl = cleanUrl.replace(/^\/\//, 'https://');
    cleanUrl = cleanUrl.split('?')[0];
    return cleanUrl;
  });

  const unique = [...new Set(cleaned)];

  console.log('Raw gallery images:', galleryImgs);
  console.log('Unique cleaned:', unique);
  console.log('Extracted logos:', logos);

  return {
    title,
    description,
    price,
    images: unique,
    logos: logos
  };
}

function extractLogos(html) {
  const logoUrls = [];

  // Common logo patterns in headers, navigation, and branding areas
  const logoPatterns = [
    // Header containers
    /<header[^>]*>([\s\S]*?)<\/header>/gi,
    /<[^>]*(header|navbar|nav-bar|navigation|brand|branding)[^>]*>([\s\S]*?)<\/[^>]*>/gi,
    // Logo-specific classes and IDs
    /<[^>]*(logo|brand|site-logo|header-logo)[^>]*>([\s\S]*?)<\/[^>]*>/gi,
    // Common Shopify logo patterns
    /<[^>]*class=["'][^"']*logo[^"']*["'][^>]*>([\s\S]*?)<\/[^>]*>/gi
  ];

  for (const pattern of logoPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const content = match[1];

      // Extract images from logo containers
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(content)) !== null) {
        const src = imgMatch[1];
        const alt = imgMatch[2] || '';

        // Filter for likely logo files
        if (isLikelyLogo(src, alt)) {
          logoUrls.push(src);
        }
      }

      // Extract SVGs
      const svgRegex = /<svg[^>]*>([\s\S]*?)<\/svg>/gi;
      let svgMatch;
      while ((svgMatch = svgRegex.exec(content)) !== null) {
        // For inline SVGs, we'll store the full SVG markup
        logoUrls.push({
          type: 'svg',
          content: svgMatch[0]
        });
      }
    }
  }

  // Clean and normalize logo URLs
  const cleanedLogos = logoUrls.map(logo => {
    if (typeof logo === 'object' && logo.type === 'svg') {
      return logo;
    }

    let cleanUrl = logo.trim();
    cleanUrl = cleanUrl.replace(/^\/\//, 'https://');
    // Don't remove query params for logos as they might be important for sizing
    return cleanUrl;
  });

  return [...new Set(cleanedLogos.map(l => typeof l === 'object' ? JSON.stringify(l) : l))]
    .map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return l;
      }
    });
}

function isLikelyLogo(src, alt) {
  const logoIndicators = [
    'logo', 'brand', 'header', 'nav', 'site-title',
    'company', 'business', 'identity', 'mark'
  ];

  const srcLower = src.toLowerCase();
  const altLower = alt.toLowerCase();

  // Check file path and alt text for logo indicators
  const hasLogoIndicator = logoIndicators.some(indicator => 
    srcLower.includes(indicator) || altLower.includes(indicator)
  );

  // Check file extension (logos are often PNG, SVG, or WEBP)
  const hasLogoExtension = /\.(png|svg|webp|gif)(\?|$)/i.test(src);

  // Exclude obvious non-logo patterns
  const isNotLogo = /\b(product|gallery|thumb|banner|hero|background|bg)\b/i.test(srcLower);

  return (hasLogoIndicator || hasLogoExtension) && !isNotLogo;
}

// Process logo variants (black, white, original) with background removal
async function processLogoVariants(logoUrl) {
  if (typeof logoUrl === 'object' && logoUrl.type === 'svg') {
    return {
      original: logoUrl,
      black: processSvgColor(logoUrl.content, '#000000'),
      white: processSvgColor(logoUrl.content, '#FFFFFF')
    };
  }

  try {
    // Step 1: Remove background first using PhotoRoom or Sharp
    let cleanLogoBuffer;

    try {
      // Try PhotoRoom API first for best background removal
      cleanLogoBuffer = await removeBackgroundPhotoRoom(logoUrl);
    } catch (error) {
      console.log('PhotoRoom failed, using Sharp background removal:', error.message);
      // Fallback to Sharp-based background removal
      cleanLogoBuffer = await removeBackgroundSharp(logoUrl);
    }

    // Step 2: Create variants from the clean logo
    const original = `data:image/png;base64,${cleanLogoBuffer.toString('base64')}`;

    // Create black variant (make non-transparent pixels black)
    const blackBuffer = await sharp(cleanLogoBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 0 } }) // Keep transparency
      .modulate({ brightness: 0.1, saturation: 0 }) // Make dark
      .linear(10.0, 0) // Increase contrast dramatically
      .png()
      .toBuffer();
    const black = `data:image/png;base64,${blackBuffer.toString('base64')}`;

    // Create white variant (make non-transparent pixels white, keep alpha)
    const whiteBuffer = await sharp(cleanLogoBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 0 } }) // Keep transparency
      .negate() // Invert colors
      .modulate({ brightness: 2.0, saturation: 0 }) // Brighten and desaturate
      .png()
      .toBuffer();
    const white = `data:image/png;base64,${whiteBuffer.toString('base64')}`;

    return { original, black, white };

  } catch (error) {
    console.error('Error processing logo variants:', error);
    return { original: logoUrl, black: logoUrl, white: logoUrl };
  }
}

// Remove background using PhotoRoom API
async function removeBackgroundPhotoRoom(imageUrl) {
  const { PHOTOROOM_API_KEY } = require('../config/apiKeys');

  if (!PHOTOROOM_API_KEY) {
    throw new Error('PhotoRoom API key not available');
  }

  const response = await fetch('https://api.photoroom.com/v1/segment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PHOTOROOM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      format: 'png',
      // Remove background completely (no bg_color)
      padding: '0.05', // Small padding for clean edges
      crop: 'auto'
    })
  });

  if (!response.ok) {
    throw new Error(`PhotoRoom API failed: ${response.status}`);
  }

  return await response.buffer();
}

// Fallback: Advanced background removal using Sharp
async function removeBackgroundSharp(imageUrl) {
  const fetch = require('node-fetch');
  const response = await fetch(imageUrl);
  const buffer = await response.buffer();

  // Step 1: Try automatic background removal with multiple techniques
  try {
    // Technique 1: Edge detection and flood fill removal
    const processedBuffer = await sharp(buffer)
      .ensureAlpha()
      .trim() // Remove uniform-colored borders first
      .png()
      .toBuffer();

    // Step 2: Advanced pixel-by-pixel processing
    const { data, info } = await sharp(processedBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const threshold = 220; // More aggressive threshold

    // Create a mask for transparent pixels
    const mask = new Uint8Array(width * height);

    // First pass: Mark obvious background pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const brightness = (r + g + b) / 3;
        const colorVariation = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

        // Mark as background if:
        // 1. Very bright AND low color variation (white/light gray)
        // 2. Corner pixels that are uniform
        // 3. Edge pixels that match corner colors
        const isBackground = (brightness > threshold && colorVariation < 15) ||
                           isCornerPixel(x, y, width, height, data, channels) ||
                           isEdgeAndUniform(x, y, width, height, data, channels, brightness);

        mask[y * width + x] = isBackground ? 0 : 255;
      }
    }

    // Second pass: Flood fill from edges to catch connected background
    floodFillBackground(mask, width, height);

    // Apply mask to original image
    for (let i = 0; i < width * height; i++) {
      if (mask[i] === 0) {
        data[i * channels + 3] = 0; // Set alpha to transparent
      }
    }

    return await sharp(data, { 
      raw: { width, height, channels } 
    })
    .png()
    .toBuffer();

  } catch (error) {
    console.error('Advanced background removal failed, using simple method:', error);

    // Fallback: Simple brightness-based removal
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      if (brightness > 240 || (r > 240 && g > 240 && b > 240)) {
        data[i + 3] = 0;
      }
    }

    return await sharp(data, { 
      raw: { width, height, channels } 
    })
    .png()
    .toBuffer();
  }
}

// Helper: Check if pixel is in corner and uniform
function isCornerPixel(x, y, width, height, data, channels) {
  const cornerSize = Math.min(width, height) * 0.1; // 10% of image size

  if ((x < cornerSize && y < cornerSize) || // Top-left
      (x > width - cornerSize && y < cornerSize) || // Top-right
      (x < cornerSize && y > height - cornerSize) || // Bottom-left
      (x > width - cornerSize && y > height - cornerSize)) { // Bottom-right

    const idx = (y * width + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const brightness = (r + g + b) / 3;

    return brightness > 200; // Corners should be light for background
  }
  return false;
}

// Helper: Check if edge pixel is uniform with other edges
function isEdgeAndUniform(x, y, width, height, data, channels, brightness) {
  const edgeThickness = 3;

  const isEdge = x < edgeThickness || x > width - edgeThickness || 
                 y < edgeThickness || y > height - edgeThickness;

  return isEdge && brightness > 210;
}

// Helper: Flood fill algorithm to remove connected background
function floodFillBackground(mask, width, height) {
  const stack = [];

  // Start from all edge pixels marked as background
  for (let x = 0; x < width; x++) {
    if (mask[x] === 0) stack.push({ x, y: 0 }); // Top edge
    if (mask[(height - 1) * width + x] === 0) stack.push({ x, y: height - 1 }); // Bottom edge
  }

  for (let y = 0; y < height; y++) {
    if (mask[y * width] === 0) stack.push({ x: 0, y }); // Left edge
    if (mask[y * width + width - 1] === 0) stack.push({ x: width - 1, y }); // Right edge
  }

  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (stack.length > 0) {
    const { x, y } = stack.pop();

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (mask[idx] === 255) { // If not yet marked as background
          // Check if this pixel should also be background (similar to current)
          mask[idx] = 0;
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }
}

function processSvgColor(svgContent, color) {
  // Simple SVG color replacement - replace fill and stroke attributes
  let processedSvg = svgContent
    .replace(/fill="[^"]*"/g, `fill="${color}"`)
    .replace(/stroke="[^"]*"/g, `stroke="${color}"`)
    .replace(/style="[^"]*fill:\s*[^;]*[^"]*"/g, `style="fill:${color}"`)
    .replace(/style="[^"]*stroke:\s*[^;]*[^"]*"/g, `style="stroke:${color}"`);

  return {
    type: 'svg',
    content: processedSvg
  };
}

module.exports = { 
  extractProductInfo,
  processLogoVariants
};