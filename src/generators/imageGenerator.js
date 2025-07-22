// src/generators/imageGenerator.js
const fetch = require('node-fetch');
const sharp = require('sharp');
const { OPENAI_KEY, PHOTOROOM_API_KEY } = require('../config/apiKeys');

/**
 * Generate hero image - clean product shot with smart background
 */
async function generateHeroImage(productPackage) {
  const { title, shortTitle, marketingStyleName, images } = productPackage;

  try {
    // Step 1: Determine optimal background color for this product
    const backgroundColor = await determineHeroBackground(title, marketingStyleName);
    console.log('Selected hero background:', backgroundColor);

    // Step 2: Use PhotoRoom API to create clean background version with smart color
    if (images && images[0]) {
      return await createSmartHeroBackground(images[0], backgroundColor);
    }

    // Step 3: Fallback to DALL-E with smart background
    const backgroundDesc = backgroundColor === '#FFFFFF' ? 'pure white studio background' : `${backgroundColor} colored studio background`;
    const heroPrompt = `Professional studio product photography of ${title}, clean ${backgroundDesc}, perfect lighting, commercial quality, product catalog style, centered composition, no shadows`;

    return await generateWithDallE(heroPrompt, images ? images[0] : null);

  } catch (error) {
    console.error('Hero image generation failed:', error);
    return null;
  }
}

/**
 * Generate staged image - product in context/lifestyle setting
 */
async function generateStagedImage(productPackage) {
  const { title, usageDescription, marketingStyleName, images } = productPackage;

  // Ensure we have a reference image
  const referenceImage = images && images[0] ? images[0] : null;

  // Enhanced prompt that specifically mentions using the reference product
  const prompt = `Professional product photography of the ${title} from the reference image in a realistic usage scenario. ${usageDescription}. ${marketingStyleName} photography style with natural lighting, high quality commercial photo showing the actual product in everyday use context. Match the product's appearance, colors, and design from the reference image exactly.`;

  try {
    console.log('Staged image prompt:', prompt);
    console.log('Reference image:', referenceImage ? 'Available' : 'Not available');

    // Include reference image in staged generation
    return await generateWithDallE(prompt, referenceImage);
  } catch (error) {
    console.error('Staged image generation failed:', error);
    return null;
  }
}

/**
 * Generate lifestyle image using your proven Python approach
 */
async function generateLifestylePrompt(productPackage) {
  const { title, usageDescription, marketingStyleName } = productPackage;
  return `Editorial lifestyle photography featuring ${title} in ${usageDescription} with ${marketingStyleName} styling`;
}

/**
 * Generate lifestyle image using reference image approach
 */
async function generateLifestyleEdit(params) {
  const { productPackage, referenceImageUrl } = params;

  try {
    const lifestyleGenerator = require('./lifestyleImageGenerator');
    const base64Result = await lifestyleGenerator.generateLifestyleImage({
      ...productPackage,
      images: [referenceImageUrl]
    });

    return base64Result;
  } catch (error) {
    console.error('Lifestyle image generation failed:', error);
    return null;
  }
}

/**
 * Determine optimal background color for hero image
 */
async function determineHeroBackground(title, marketingStyleName) {
  const prompt = `You are a professional product photographer. For this product and marketing style, what background color would work best for a hero/catalog image?

Product: ${title}
Marketing Style: ${marketingStyleName}

Consider:
- Product colors and contrast needs
- Marketing style aesthetics  
- Professional catalog standards
- Brand perception

Respond with ONLY a color code or "WHITE":
- Use hex codes like #F5F5F5, #E8F4FD, #FFF8E1 for colored backgrounds
- Use "WHITE" for pure white backgrounds
- Consider soft, subtle colors that complement the product

Example responses: "#F8F9FA", "WHITE", "#FFF5F5", "#F0F8F0"`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const colorResponse = data.choices[0].message.content.trim();

    // Parse response
    if (colorResponse.toUpperCase() === 'WHITE') {
      return '#FFFFFF';
    } else if (colorResponse.match(/^#[0-9A-Fa-f]{6}$/)) {
      return colorResponse;
    } else {
      // Fallback to off-white if response is unclear
      return '#F8F9FA';
    }
  } catch (error) {
    console.error('Background color determination failed:', error);
    return '#F8F9FA'; // Default to soft off-white
  }
}

/**
 * Create hero image with smart background using PhotoRoom
 */
async function createSmartHeroBackground(imageUrl, backgroundColor) {
  if (!PHOTOROOM_API_KEY) {
    console.warn('PhotoRoom API key not found, using DALL-E fallback');
    return await generateHeroBackdrop(imageUrl, backgroundColor);
  }

  try {
    // Step 1: Remove background first
    const cleanResponse = await fetch('https://api.photoroom.com/v1/segment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PHOTOROOM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        format: 'png'
      })
    });

    if (!cleanResponse.ok) {
      throw new Error(`PhotoRoom segment failed: ${cleanResponse.status}`);
    }

    const cleanImageBuffer = await cleanResponse.buffer();
    const cleanImageBase64 = cleanImageBuffer.toString('base64');

    // Step 2: Add professional backdrop
    const backdropResponse = await fetch('https://api.photoroom.com/v1/backdrop', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PHOTOROOM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: cleanImageBase64,
        backdrop: {
          type: backgroundColor === '#FFFFFF' ? 'studio_white' : 'studio_colored',
          color: backgroundColor,
          style: 'professional',
          lighting: 'soft'
        },
        format: 'png',
        scale: '0.75', // Scale product to 75% for proper composition
        padding: '0.15' // 15% padding around product
      })
    });

    if (backdropResponse.ok) {
      const buffer = await backdropResponse.buffer();
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    console.warn('PhotoRoom backdrop failed, using fallback');
    return await generateHeroBackdrop(imageUrl, backgroundColor);

  } catch (error) {
    console.error('PhotoRoom hero creation failed:', error);
    return await generateHeroBackdrop(imageUrl, backgroundColor);
  }
}

/**
 * Fallback: Generate hero with DALL-E backdrop
 */
async function generateHeroBackdrop(imageUrl, backgroundColor) {
  const backgroundDesc = backgroundColor === '#FFFFFF' 
    ? 'professional white studio backdrop with soft lighting' 
    : `professional studio backdrop in ${backgroundColor} color with soft directional lighting`;

  const heroPrompt = `Professional studio product photography with ${backgroundDesc}, clean commercial style, centered product placement, no harsh shadows, catalog quality, perfect lighting setup`;

  return await generateWithDallE(heroPrompt, imageUrl);
}

/**
 * Helper: Generate image with DALL-E including reference image
 */
async function generateWithDallE(prompt, referenceImageUrl = null) {
  const requestBody = {
    model: 'dall-e-3',
    prompt: prompt,
    size: '1024x1024',
    quality: 'standard',
    n: 1,
  };

  // If we have a reference image, enhance the prompt
  if (referenceImageUrl) {
    try {
      requestBody.prompt += ` Style and composition similar to the provided reference image. Maintain the same product aesthetics and visual qualities.`;
    } catch (error) {
      console.warn('Could not process reference image for DALL-E:', error.message);
    }
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  if (data.data && data.data[0]) {
    return data.data[0].url;
  }
  throw new Error('DALL-E generation failed');
}

/**
 * Process company logo variants
 */
async function processCompanyLogos(logos) {
  const processedLogos = [];

  for (const logo of logos) {
    try {
      const variants = await processLogoVariants(logo);
      processedLogos.push({
        original: variants.original,
        black: variants.black,
        white: variants.white,
        source: logo
      });
    } catch (error) {
      console.error('Error processing logo:', error);
      // Include original even if processing fails
      processedLogos.push({
        original: logo,
        black: logo,
        white: logo,
        source: logo
      });
    }
  }

  return processedLogos;
}

/**
 * Process logo variants with background removal
 */
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
      padding: '0.05', // Small padding for clean edges
      crop: 'auto'
    })
  });

  if (!response.ok) {
    throw new Error(`PhotoRoom API failed: ${response.status}`);
  }

  return await response.buffer();
}

// Fallback: Remove background using Sharp
async function removeBackgroundSharp(imageUrl) {
  const response = await fetch(imageUrl);
  const buffer = await response.buffer();

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const threshold = 230; // Threshold for background removal

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const brightness = (r + g + b) / 3;

    if (brightness > threshold || (r > 240 && g > 240 && b > 240)) {
      data[i + 3] = 0; // Make transparent
    }
  }

  return await sharp(data, { 
    raw: { width, height, channels } 
  })
  .png()
  .toBuffer();
}

function processSvgColor(svgContent, color) {
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

// Helper function to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

module.exports = {
  generateHeroImage,
  generateStagedImage,
  generateLifestylePrompt,
  generateLifestyleEdit,
  processCompanyLogos
};