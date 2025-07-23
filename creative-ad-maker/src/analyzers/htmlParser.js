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

// Fallback: Remove background using Sharp (works well for logos with solid backgrounds)
async function removeBackgroundSharp(imageUrl) {
  const fetch = require('node-fetch');
  const response = await fetch(imageUrl);
  const buffer = await response.buffer();

  // Sharp-based background removal for logos
  // This works well when the background is a solid color (white/light)
  const processedBuffer = await sharp(buffer)
    .ensureAlpha() // Add alpha channel if not present
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = processedBuffer;
  const { width, height, channels } = info;

  // Simple background removal: make light pixels transparent
  const threshold = 240; // Adjust this value (0-255) - higher = more aggressive removal

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate brightness
    const brightness = (r + g + b) / 3;

    // If pixel is bright (likely background), make it transparent
    if (brightness > threshold) {
      data[i + 3] = 0; // Set alpha to 0 (transparent)
    }

    // Also check for specific colors that are likely backgrounds
    // Pure white
    if (r > 250 && g > 250 && b > 250) {
      data[i + 3] = 0;
    }

    // Light grays
    if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 230) {
      data[i + 3] = 0;
    }
  }

  // Convert back to PNG buffer
  return await sharp(data, { 
    raw: { width, height, channels } 
  })
  .png()
  .toBuffer();
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