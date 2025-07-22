// src/generators/productEnrichment.js
const fetch = require('node-fetch');
const { OPENAI_KEY } = require('../config/apiKeys');
const dataLoader = require('../data/dataLoader');

async function prepareProductPackage(product) {
  const { title, description, price, images } = product;

  // Step 1: Generate usage description
  const usageDescription = await generateUsageDescription(title, description);

  // Step 2: Match marketing style from LUT
  const styleData = await matchMarketingStyle(title, usageDescription);

  // Step 3: Generate optimized title and description
  const optimizedContent = await generateOptimizedContent(title, description);

  return {
    // Original product data
    title,
    description,
    price,
    images,

    // AI-generated enhancements
    usageDescription,
    shortTitle: optimizedContent.shortTitle,
    shortDescription: optimizedContent.shortDescription,

    // Style data from LUT
    marketingStyleName: styleData.name,
    marketingStyleDescription: styleData.description,
    headerFont: styleData.headerFont,
    subheadFont: styleData.subheadFont
  };
}

async function generateUsageDescription(title, description) {
  const prompt = `Describe in one concise sentence how and where this product is typically used. Be specific about the usage context, avoid repeating the product name.

Product: ${title}
Description: ${description}

Response format: Single sentence describing typical usage.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You describe product usage contexts concisely.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function matchMarketingStyle(title, usageDescription) {
  const styles = dataLoader.getStyles();

  const prompt = `Given this product, select the most appropriate marketing style from the list below.

Product: ${title}
Usage Context: ${usageDescription}

Available Styles:
${styles.map(s => `- ${s.Title}: ${s.description}`).join('\n')}

Respond with ONLY the exact style name from the list.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You match products to marketing styles. Return only the style name.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  const styleName = data.choices[0].message.content.trim();

  // Find matching style from LUT
  const matchedStyle = styles.find(s => 
    s.Title.toLowerCase() === styleName.toLowerCase()
  ) || styles[0]; // Fallback to first style

  return {
    name: matchedStyle.Title,
    description: matchedStyle.description,
    headerFont: matchedStyle.header_font,
    subheadFont: matchedStyle.subhead_font
  };
}

async function generateOptimizedContent(title, description) {
  const prompt = `Create optimized ad copy for this product. Generate a short title (max 3 words) and short description (max 7 words) suitable for ad creatives.

Original Title: ${title}
Original Description: ${description}

Requirements:
- Short title should be a condensed version of the original title
- Short description should highlight key benefit/appeal
- Avoid repeating the title in the description
- Keep language punchy and ad-friendly

Respond in JSON format:
{
  "shortTitle": "...",
  "shortDescription": "..."
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You optimize product copy for advertisements.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json|```/g, '').trim();

  return JSON.parse(content);
}

async function generateSloganPhrases(productPackage) {
  const { title, description, marketingStyleName, marketingStyleDescription } = productPackage;

  const prompt = `Generate 6 compelling slogans for this product. Use the marketing style as inspiration for tone and approach.

Product: ${title}
Description: ${description}
Marketing Style: ${marketingStyleName} - ${marketingStyleDescription}

Guidelines:
- Keep slogans short and memorable (2-5 words ideal)
- Focus on benefits and emotional appeal
- Avoid clichés and generic phrases  
- Match the marketing style's tone
- Make them work well in visual ads

Return as JSON array:
{
  "slogans": ["Slogan 1", "Slogan 2", ...]
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You create compelling product slogans for advertisements.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json|```/g, '').trim();

  const parsed = JSON.parse(content);
  return parsed.slogans;
}

async function matchBestCta(productPackage) {
  const { title, description, usageDescription } = productPackage;
  const ctas = dataLoader.getCTAs();

  const prompt = `Select the most effective CTA for this product from the provided list.

Product: ${title}
Description: ${description}
Usage: ${usageDescription}

Available CTAs:
${ctas.map(c => `- "${c.cta}": ${c.uses}`).join('\n')}

Respond with ONLY the exact CTA text.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You select the best CTA from provided options.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

module.exports = {
  prepareProductPackage,
  generateShortTitleAndDescription: generateOptimizedContent,
  generateSloganPhrases,
  matchBestCta
};