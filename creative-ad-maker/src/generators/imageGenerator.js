// src/generators/imageGenerator.js - FIXED STREAMING VERSION
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
 * Generate staged image - product in context using OpenAI with reference image and streaming
 */
async function generateStagedImage(productPackage, onPartialImage = null) {
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

    // Send reference image to OpenAI using the new model with streaming
    return await generateWithOpenAI(prompt, referenceImageUrl, onPartialImage);
  } catch (error) {
    console.error('Staged image generation failed:', error);
    return null;
  }
}

/**
 * Generate lifestyle image using reference image approach
 */
async function generateLifestyleEdit(params) {
  const { productPackage, referenceImageUrl, onPartialImage } = params;

  try {
    const base64Result = await generateLifestyleImage({
      ...productPackage,
      images: [referenceImageUrl]
    }, onPartialImage);

    return base64Result;
  } catch (error) {
    console.error('Lifestyle image generation failed:', error);
    return null;
  }
}

/**
 * Generate lifestyle image using reference image and prompt variations with streaming support
 */
async function generateLifestyleImage(productPackage, onPartialImage = null) {
  const { images, marketingStyleName } = productPackage;

  if (!images || !images[0]) {
    throw new Error('No reference image provided');
  }

  // Convert image URL to base64
  const referenceImageB64 = await urlToBase64(images[0]);
  if (!referenceImageB64) {
    throw new Error('Failed to process reference image');
  }

  // Generate prompt with scene variation
  const scene = LIFESTYLE_SCENES[Math.floor(Math.random() * LIFESTYLE_SCENES.length)];
  const framing = LIFESTYLE_FRAMINGS[Math.floor(Math.random() * LIFESTYLE_FRAMINGS.length)];

  // Add flash photography variant occasionally
  let basePromptVariant = LIFESTYLE_BASE_PROMPT;
  if (Math.random() < 0.3) {
    basePromptVariant = LIFESTYLE_BASE_PROMPT.replace("analog film", "analog flash photography");
  }

  // Incorporate marketing style
  const styleAdjustment = getLifestyleStyleAdjustment(marketingStyleName);
  const finalPrompt = basePromptVariant + scene + framing + styleAdjustment;

  // Try generation with retry logic and streaming support
  return await generateLifestyleWithRetry(finalPrompt, referenceImageB64, 2, onPartialImage);
}

/**
 * Generate editorial lifestyle image WITHOUT the product - just the lifestyle moment
 */
async function generateEditorialImage(productPackage, onPartialImage = null) {
  const { usageDescription, marketingStyleName } = productPackage;

  // Generate prompt with scene variation
  const scene = EDITORIAL_SCENES[Math.floor(Math.random() * EDITORIAL_SCENES.length)];
  const mood = EDITORIAL_MOODS[Math.floor(Math.random() * EDITORIAL_MOODS.length)];

  // Incorporate marketing style
  const styleAdjustment = getEditorialStyleAdjustment(marketingStyleName);
  const finalPrompt = `${EDITORIAL_BASE_PROMPT} Editorial scene related to: ${usageDescription}.${scene}${mood}${styleAdjustment}`;

  console.log('Editorial prompt:', finalPrompt);

  // Try generation with streaming
  return await generateEditorialWithStreaming(finalPrompt, onPartialImage);
}

/**
 * Generate editorial image with streaming partial images
 */
async function generateEditorialWithStreaming(prompt, onPartialImage = null) {
  console.log('=== EDITORIAL GENERATION START ===');
  console.log('Prompt:', prompt);
  console.log('Streaming enabled:', !!onPartialImage);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [{ 
          role: "user", 
          content: [{ type: "input_text", text: prompt }]
        }],
        tools: [{
          type: "image_generation",
          quality: "high",
          size: "1024x1024",
          partial_images: onPartialImage ? 2 : 0
        }],
        stream: onPartialImage ? true : false
      })
    });

    console.log('Editorial API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Editorial API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    if (onPartialImage) {
      // Handle streaming response
      console.log('Handling streaming response...');
      const finalResult = await handleStreamingResponse(response, onPartialImage);
      return finalResult ? `data:image/png;base64,${finalResult}` : null;
    } else {
      // Handle non-streaming response
      console.log('Handling non-streaming response...');
      const data = await response.json();
      console.log('Editorial response structure:', {
        hasOutput: !!data.output,
        outputLength: data.output?.length || 0,
        outputTypes: data.output?.map(o => o.type) || []
      });

      const imageOutputs = data.output?.filter(output => output.type === "image_generation_call");
      if (imageOutputs && imageOutputs.length > 0) {
        const result = imageOutputs[0].result;
        if (!result) {
          throw new Error('Editorial image output found but result is empty');
        }
        console.log('Editorial generation successful, result length:', result.length);
        return `data:image/png;base64,${result}`;
      }
      console.error('No editorial image outputs found');
      return null;
    }
  } catch (error) {
    console.error('=== EDITORIAL GENERATION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Generate image with OpenAI using the new Responses API with reference image and streaming
 */
async function generateWithOpenAI(prompt, referenceImageUrl, onPartialImage = null) {
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

    // Use the new OpenAI Responses API with streaming support
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
            input_fidelity: 'high',
            partial_images: onPartialImage ? 2 : 0
          }
        ],
        stream: onPartialImage ? true : false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    if (onPartialImage) {
      // Handle streaming response
      const finalResult = await handleStreamingResponse(response, onPartialImage);
      return finalResult ? `data:image/png;base64,${finalResult}` : null;
    } else {
      // Handle non-streaming response
      const data = await response.json();

      // Extract image from response
      const imageOutputs = data.output?.filter(output => output.type === 'image_generation_call');
      if (imageOutputs && imageOutputs.length > 0) {
        console.log('OpenAI generation successful');
        // Return base64 data directly
        return `data:image/png;base64,${imageOutputs[0].result}`;
      }

      throw new Error('No image returned from OpenAI');
    }
  } catch (error) {
    console.error('OpenAI generation error:', error);
    throw error;
  }
}

/**
 * Generate lifestyle image with retry and prompt rewriting with streaming support
 */
async function generateLifestyleWithRetry(prompt, referenceImageB64, maxAttempts = 2, onPartialImage = null) {
  let currentPrompt = prompt;
  let lastResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await callOpenAILifestyleGeneration(currentPrompt, referenceImageB64, onPartialImage);
      if (result) {
        console.log(`✅ Lifestyle generation succeeded on attempt ${attempt + 1}`);
        return result;
      } else if (onPartialImage) {
        // For streaming, if we got partial images but no final, that's still a success
        console.log(`⚠️ Attempt ${attempt + 1}: No final image but partial images were streamed`);
        lastResult = 'partial_success';
      }
    } catch (error) {
      console.error(`Generation attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxAttempts - 1) {
        console.log('⚠️ Generation failed — rewriting prompt...');
        currentPrompt = await rewritePromptForModeration(currentPrompt);
        console.log('🔄 Rewritten prompt:', currentPrompt);
      }
    }
  }

  // If we were streaming and got partial images, don't throw an error
  if (onPartialImage && lastResult === 'partial_success') {
    console.log('✅ Accepting partial images as successful generation');
    return null; // Frontend will use the last partial image
  }

  throw new Error('Failed to generate lifestyle image after all attempts');
}

/**
 * Call OpenAI image generation API with streaming support for lifestyle
 */
async function callOpenAILifestyleGeneration(prompt, referenceImageB64, onPartialImage = null) {
  console.log('=== LIFESTYLE OPENAI CALL START ===');
  console.log('Prompt length:', prompt.length);
  console.log('Reference image B64 length:', referenceImageB64.length);
  console.log('Streaming enabled:', !!onPartialImage);

  const inputContent = [
    { type: "input_text", text: prompt },
    { 
      type: "input_image", 
      image_url: `data:image/jpeg;base64,${referenceImageB64}` 
    }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [{ role: "user", content: inputContent }],
        tools: [{
          type: "image_generation",
          moderation: "low",
          size: "1024x1024",
          partial_images: onPartialImage ? 2 : 0
        }],
        stream: onPartialImage ? true : false
      })
    });

    console.log('Lifestyle API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lifestyle API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    if (onPartialImage) {
      // Handle streaming response with partial images
      console.log('Handling streaming lifestyle response...');
      const finalResult = await handleStreamingResponse(response, onPartialImage);
      return finalResult ? `data:image/png;base64,${finalResult}` : null;
    } else {
      // Handle non-streaming response
      const data = await response.json();
      console.log('Lifestyle response structure:', {
        hasOutput: !!data.output,
        outputLength: data.output?.length || 0,
        outputTypes: data.output?.map(o => o.type) || []
      });

      // Extract image data from response
      const imageOutputs = data.output?.filter(output => output.type === "image_generation_call");
      if (imageOutputs && imageOutputs.length > 0) {
        const result = imageOutputs[0].result;
        if (!result) {
          throw new Error('Lifestyle image output found but result is empty');
        }
        console.log('Lifestyle generation successful, result length:', result.length);
        return `data:image/png;base64,${result}`;
      }

      console.error('No lifestyle image outputs found');
      return null;
    }
  } catch (error) {
    console.error('=== LIFESTYLE OPENAI CALL ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Handle streaming response for partial images - PROPERLY FIXED FOR NODE.JS
 */
async function handleStreamingResponse(response, onPartialImage) {
  let finalImageResult = null;
  let lastPartialImage = null;

  try {
    const contentType = response.headers.get('content-type');
    console.log('Response content-type:', contentType);

    // If it's JSON, handle as non-streaming
    if (contentType && contentType.includes('application/json')) {
      console.log('Handling as non-streaming JSON response');
      const jsonData = await response.json();

      if (jsonData.output && Array.isArray(jsonData.output)) {
        const imageOutputs = jsonData.output.filter(output => output.type === "image_generation_call");
        if (imageOutputs.length > 0 && imageOutputs[0].result) {
          return imageOutputs[0].result;
        }
      }

      throw new Error('No image outputs found in JSON response');
    }

    // For SSE/streaming responses
    if (contentType && contentType.includes('text/event-stream')) {
      console.log('Handling SSE stream - parsing events');

      const text = await response.text();
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('event:')) {
          const eventType = line.slice(6).trim();

          // Check if next line has data
          if (i + 1 < lines.length && lines[i + 1].startsWith('data:')) {
            const dataLine = lines[i + 1];
            const dataContent = dataLine.slice(5).trim();

            if (dataContent && dataContent !== '[DONE]') {
              try {
                const eventData = JSON.parse(dataContent);

                // Handle partial image events
                if (eventType === 'response.image_generation_call.partial_image') {
                  const partialImageB64 = eventData.partial_image_b64;
                  const partialIndex = eventData.partial_image_index;

                  console.log(`📸 Received partial image ${partialIndex}`);

                  if (partialImageB64) {
                    lastPartialImage = partialImageB64; // Keep track of last partial
                    if (onPartialImage) {
                      onPartialImage(`data:image/png;base64,${partialImageB64}`, partialIndex);
                    }
                  }
                }
                // Handle completed image event
                else if (eventType === 'response.image_generation_call.completed') {
                  console.log('✅ Image generation completed');
                  if (eventData.result) {
                    finalImageResult = eventData.result;
                  }
                }
                // Handle final response.done event
                else if (eventType === 'response.done' && eventData.response) {
                  if (eventData.response.output) {
                    const imageOutputs = eventData.response.output.filter(
                      output => output.type === 'image_generation_call'
                    );
                    if (imageOutputs.length > 0 && imageOutputs[0].result) {
                      console.log('✅ Found final image in response.done');
                      finalImageResult = imageOutputs[0].result;
                    }
                  }
                }
              } catch (parseError) {
                console.warn('Failed to parse event data:', parseError.message);
              }
            }
            i++; // Skip the data line since we already processed it
          }
        }
      }

      // If no final image was found but we have partial images, use the last partial
      if (!finalImageResult && lastPartialImage) {
        console.log('⚠️ No final image found, using last partial image as final');
        finalImageResult = lastPartialImage;
      }

      return finalImageResult;
    }

    throw new Error(`Unsupported content type: ${contentType}`);

  } catch (error) {
    console.error('Streaming handler error:', error);
    throw error;
  }
}

/**
 * Rewrite prompt to pass moderation
 */
async function rewritePromptForModeration(originalPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a prompt optimizer for image generation. Rewrite prompts to pass OpenAI moderation while keeping the core creative intent. Keep all text and logo requirements intact.'
        },
        {
          role: 'user', 
          content: `Original prompt:\n${originalPrompt}\n\nRewrite to be safer for image generation moderation:`
        }
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Convert image URL to base64
 */
async function urlToBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.buffer();
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error converting image to base64:', error);
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

// ===== CONSTANTS =====

const LIFESTYLE_BASE_PROMPT = `Showcase the product in a high-end editorial ad-lifestyle analog photo, with a beautiful good looking model of the fitting gender to promote the product, shot on analog film, realistic lighting, cinematic mood. Ensure correct size and placement of text, logos and other details. Retain all visible text exactly as it appears in the reference image.`;

const LIFESTYLE_SCENES = [
  " Posed casually in a cozy apartment with natural daylight.",
  " Walking on an urban street with soft city light.",
  " Relaxed on a stylish sofa in a warm living room.", 
  " Leaning by a large window with sheer curtains and soft sun.",
  " Rooftop vibe with an urban skyline background.",
  " Standing on a balcony at sunset with warm tones.",
  " Indoors near indoor plants for a fresh lifestyle touch.",
  " Sitting on a bed with natural daylight for a candid vibe.",
  " Relaxed near an open door with ambient indoor light.",
  " Posed next to minimal furniture for a clean editorial look."
];

const LIFESTYLE_FRAMINGS = [
  " Close-up shot focusing on fabric and texture details.",
  " Medium crop showing half-body with casual styling.",
  " Full-body frame capturing entire outfit and surroundings.",
  " Slightly wide shot including room details for lifestyle feel.",
  " Over-the-shoulder angle for candid editorial mood."
];

const EDITORIAL_BASE_PROMPT = `High-end editorial lifestyle photography capturing the essence and atmosphere of this lifestyle moment. Professional magazine-quality photo with cinematic mood and beautiful lighting. No products visible, just the pure lifestyle editorial moment.`;

const EDITORIAL_SCENES = [
  " In a serene morning routine setting with soft natural light.",
  " During a peaceful evening wind-down ritual with warm ambient lighting.",
  " In a minimalist bathroom with clean lines and natural textures.",
  " At a vanity table with elegant styling and soft lighting.",
  " In a cozy bedroom setting with comfortable textiles and warm tones.",
  " During a self-care moment with candles and organic elements.", 
  " In a spa-like environment with zen aesthetics and natural materials.",
  " At a modern sink area with contemporary design elements.",
  " In a luxurious hotel bathroom with premium finishes.",
  " During a wellness ritual with plants and natural light."
];

const EDITORIAL_MOODS = [
  " Tranquil and meditative atmosphere.",
  " Sophisticated and refined mood.",
  " Warm and inviting feeling.",
  " Clean and contemporary vibe.",
  " Organic and natural essence.",
  " Luxurious and premium ambiance.",
  " Minimalist and calming tone.",
  " Editorial magazine aesthetic.",
  " Lifestyle brand photography mood.",
  " High-end commercial feeling."
];

/**
 * Adjust lifestyle prompt based on marketing style
 */
function getLifestyleStyleAdjustment(styleName) {
  const styleAdjustments = {
    'Premium': ' Luxury aesthetic with refined elegance and sophisticated mood.',
    'Raw': ' Authentic, unfiltered atmosphere with natural imperfections.',
    'Retro': ' Vintage-inspired styling with nostalgic color tones.',
    'Editorial': ' Clean, magazine-quality composition with professional styling.',
    'Vibrant': ' Dynamic energy with bold colors and lively atmosphere.',
    'Organic': ' Natural, earth-toned environment with organic textures.',
    'Tech': ' Modern, sleek setting with contemporary clean lines.',
    'Bold': ' Strong, confident styling with dramatic lighting and composition.',
    'Minimalist': ' Clean, uncluttered space with simple, elegant styling.',
    'Playful': ' Fun, lighthearted mood with casual, approachable styling.'
  };

  return styleAdjustments[styleName] || ' Professional commercial photography styling.';
}

/**
 * Adjust editorial prompt based on marketing style
 */
function getEditorialStyleAdjustment(styleName) {
  const styleAdjustments = {
    'Premium': ' Luxury editorial aesthetic with refined elegance and sophisticated atmosphere.',
    'Raw': ' Authentic, unfiltered editorial mood with natural imperfections.',
    'Retro': ' Vintage-inspired editorial styling with nostalgic color tones.',
    'Editorial': ' Clean, magazine-quality composition with professional styling.',
    'Vibrant': ' Dynamic editorial energy with bold colors and lively atmosphere.',
    'Organic': ' Natural, earth-toned editorial environment with organic textures.',
    'Tech': ' Modern, sleek editorial setting with contemporary clean lines.',
    'Bold': ' Strong, confident editorial styling with dramatic lighting.',
    'Minimalist': ' Clean, uncluttered editorial space with simple styling.',
    'Playful': ' Fun, lighthearted editorial mood with casual styling.'
  };

  return styleAdjustments[styleName] || ' Professional editorial lifestyle photography.';
}

// Legacy function for compatibility
function generateLifestylePrompt() {
  // Keep for compatibility but this is now handled internally
  return '';
}

module.exports = {
  generateHeroImage,
  generateStagedImage,
  generateLifestylePrompt, // Keep for compatibility
  generateLifestyleEdit,
  generateLifestyleImage,
  generateEditorialImage,
  processCompanyLogos
};