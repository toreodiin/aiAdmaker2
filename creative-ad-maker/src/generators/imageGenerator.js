// src/generators/imageGenerator.js
const fetch = require('node-fetch');
const { OPENAI_KEY, PHOTOROOM_API_KEY } = require('../config/apiKeys');

/**
 * Generate hero image - clean product shot on white background
 */
async function generateHeroImage(productPackage) {
  const { title, shortTitle, marketingStyleName, images } = productPackage;

  try {
    // Use PhotoRoom API to create clean white background version
    if (images && images[0]) {
      return await createCleanBackground(images[0]);
    }

    // Fallback to DALL-E if no source image
    return await generateWithDallE(`Clean, professional product shot of ${title} on pure white background, ${marketingStyleName} style, studio lighting, high quality`);

  } catch (error) {
    console.error('Hero image generation failed:', error);
    return null;
  }
}

/**
 * Generate staged image - product in context/lifestyle setting
 */
async function generateStagedImage(productPackage) {
  const { title, usageDescription, marketingStyleName } = productPackage;

  const prompt = `${title} ${usageDescription}, ${marketingStyleName} photography style, professional product photography, lifestyle context, natural lighting, high quality commercial photo`;

  try {
    return await generateWithDallE(prompt);
  } catch (error) {
    console.error('Staged image generation failed:', error);
    return null;
  }
}

/**
 * Generate lifestyle image using your proven Python approach
 */
async function generateLifestylePrompt(productPackage) {
  // This now just returns a simple prompt since the real logic is in generateLifestyleEdit
  const { title, usageDescription, marketingStyleName } = productPackage;
  return `Editorial lifestyle photography featuring ${title} in ${usageDescription} with ${marketingStyleName} styling`;
}

/**
 * Generate lifestyle image using reference image approach (like your Python script)
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
 * Helper: Generate image with DALL-E
 */
async function generateWithDallE(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })
  });

  const data = await response.json();
  if (data.data && data.data[0]) {
    return data.data[0].url;
  }
  throw new Error('DALL-E generation failed');
}

/**
 * Helper: Create clean background with PhotoRoom
 */
async function createCleanBackground(imageUrl) {
  if (!PHOTOROOM_API_KEY) {
    console.warn('PhotoRoom API key not found, skipping clean background generation');
    return null;
  }

  try {
    const response = await fetch('https://api.photoroom.com/v1/segment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PHOTOROOM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        format: 'png',
        bg_color: 'ffffff'
      })
    });

    if (response.ok) {
      const buffer = await response.buffer();
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    console.warn('PhotoRoom API failed, falling back to original image');
    return imageUrl;

  } catch (error) {
    console.error('PhotoRoom processing failed:', error);
    return imageUrl; // Fallback to original
  }
}

module.exports = {
  generateHeroImage,
  generateStagedImage,
  generateLifestylePrompt,
  generateLifestyleEdit
};