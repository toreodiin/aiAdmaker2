// src/generators/imageGenerator.js
const fetch = require('node-fetch');
const sharp = require('sharp');
const { OPENAI_KEY, PHOTOROOM_API_KEY } = require('../config/apiKeys');

/**
 * Generate hero image - clean product shot using PhotoRoom ONLY
 */
async function generateHeroImage(productPackage) {
  const { title, shortTitle, marketingStyleName, images } = productPackage;

  if (!images || !images[0]) {
    console.error('No product image available for hero generation');
    return null;
  }

  const originalImageUrl = images[0];
  console.log('Creating hero image from:', originalImageUrl);

  if (!PHOTOROOM_API_KEY) {
    console.error('PhotoRoom API key not found - cannot generate hero image');
    return null;
  }

  try {
    // Step 1: Determine optimal background color for this product
    const backgroundColor = await determineHeroBackground(title, marketingStyleName);
    console.log('Selected hero background:', backgroundColor);

    // Step 2: Use PhotoRoom API to remove background AND add new background
    return await createSmartHeroBackground(originalImageUrl, backgroundColor);

  } catch (error) {
    console.error('Hero image generation failed:', error);
    return null;
  }
}

/**
 * Generate staged image - product in context using OpenAI with reference image
 */
async function generateStagedImage(productPackage) {
  const { title, usageDescription, marketingStyleName, images } = productPackage;

  if (!images || !images[0]) {
    console.error('No reference image available for staged generation');
    return null;
  }

  const referenceImageUrl = images[0];
  console.log('Creating staged image with reference:', referenceImageUrl);

  // Enhanced prompt that specifically mentions using the reference product
  const prompt = `Professional product photography of the ${title} from the reference image in a realistic usage scenario. ${usageDescription}. ${marketingStyleName} photography style with natural lighting, high quality commercial photo showing the actual product in everyday use context. Match the product's appearance, colors, and design from the reference image exactly.`;

  try {
    console.log('Staged image prompt:', prompt);

    // Send reference image to OpenAI using the new model
    return await generateWithOpenAI(prompt, referenceImageUrl);
  } catch (error) {
    console.error('Staged image generation failed:', error);
    return null;
  }
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
 * Generate editorial lifestyle image WITHOUT the product - just the lifestyle moment
 */
async function generateEditorialImage(productPackage) {
  const { title, usageDescription, marketingStyleName } = productPackage;

  try {
    console.log('Generating editorial lifestyle image without product...');

    // Create editorial prompt focusing on the lifestyle moment, not the product
    const editorialPrompt = `Editorial lifestyle photography capturing the essence of ${usageDescription}. ${getEditorialStyleAdjustment(marketingStyleName)} High-end magazine quality photo showing the lifestyle moment and atmosphere associated with this usage scenario. No products visible, just the pure lifestyle editorial moment. Professional photography with cinematic mood and beautiful lighting.`;

    console.log('Editorial prompt:', editorialPrompt);

    // Use OpenAI to generate lifestyle editorial without reference image
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: editorialPrompt
              }
            ]
          }
        ],
        tools: [
          {
            type: 'image_generation',
            quality: 'high',
            size: '1024x1024'
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract image from response
    const imageOutputs = data.output?.filter(output => output.type === 'image_generation_call');
    if (imageOutputs && imageOutputs.length > 0) {
      console.log('Editorial image generation successful');
      return `data:image/png;base64,${imageOutputs[0].result}`;
    }

    throw new Error('No editorial image returned from OpenAI');
  } catch (error) {
    console.error('Editorial image generation failed:', error);
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
 * Create hero image with PhotoRoom using the working v2 API
 */
async function createSmartHeroBackground(imageUrl, backgroundColor) {
  try {
    console.log('Using PhotoRoom v2 API to create hero image...');

    const backgroundPrompt = backgroundColor === '#FFFFFF' 
      ? 'Studio photo on pure white background, high-key lighting. Focused on product only'
      : `Studio photo on ${backgroundColor} colored background, high-key lighting. Focused on product only`;

    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('imageUrl', imageUrl);
    formData.append('background.prompt', backgroundPrompt);
    formData.append('padding', '0.2');
    formData.append('paddingTop', '0.1');
    formData.append('paddingBottom', '0.1');
    formData.append('ignorePaddingAndSnapOnCroppedSides', 'false');
    formData.append('targetArea.scaling', 'fit');
    formData.append('targetArea.horizontalAlignment', 'center');
    formData.append('targetArea.verticalAlignment', 'center');
    formData.append('referenceBox', 'subjectBox');
    formData.append('outputSize', '1080x1920');

    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: {
        'x-api-key': PHOTOROOM_API_KEY,
        'pr-ai-background-model-version': 'background-studio-beta-2025-03-17',
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PhotoRoom hero failed: ${response.status} ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    console.log('Hero image created successfully with PhotoRoom v2');
    return `data:image/jpeg;base64,${base64}`;

  } catch (error) {
    console.error('PhotoRoom hero creation failed:', error);
    return null;
  }
}

/**
 * Generate image with OpenAI using the new Responses API with reference image
 */
async function generateWithOpenAI(prompt, referenceImageUrl) {
  if (!referenceImageUrl) {
    throw new Error('Reference image is required for OpenAI generation');
  }

  try {
    console.log('Converting reference image to base64...');
    // Convert reference image to base64
    const imageResponse = await fetch(referenceImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch reference image: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.buffer();
    const imageBase64 = imageBuffer.toString('base64');

    console.log('Calling OpenAI Responses API with reference image...');

    // Use the new OpenAI Responses API
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt
              },
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${imageBase64}`
              }
            ]
          }
        ],
        tools: [
          {
            type: 'image_generation',
            quality: 'high',
            size: '1024x1024',
            input_fidelity: 'high'
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract image from response
    const imageOutputs = data.output?.filter(output => output.type === 'image_generation_call');
    if (imageOutputs && imageOutputs.length > 0) {
      console.log('OpenAI generation successful');
      // Return base64 data directly
      return `data:image/png;base64,${imageOutputs[0].result}`;
    }

    throw new Error('No image returned from OpenAI');
  } catch (error) {
    console.error('OpenAI generation error:', error);
    throw error;
  }
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

// Remove background using PhotoRoom v2 API
async function removeBackgroundPhotoRoom(imageUrl) {
  if (!PHOTOROOM_API_KEY) {
    throw new Error('PhotoRoom API key not available');
  }

  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('imageUrl', imageUrl);
  formData.append('referenceBox', 'originalImage');

  const response = await fetch('https://image-api.photoroom.com/v2/edit', {
    method: 'POST',
    headers: {
      'x-api-key': PHOTOROOM_API_KEY,
      'pr-hd-background-removal': 'auto',
      'pr-ai-background-model-version': 'background-studio-beta-2025-03-17',
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`PhotoRoom background removal failed: ${response.status}`);
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

module.exports = {
  generateHeroImage,
  generateStagedImage,
  generateLifestylePrompt: () => {}, // Keep for compatibility
  generateLifestyleEdit,
  generateEditorialImage,
  processCompanyLogos
};