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

  return {
    // Original product data
    title,
    description,
    price,
    images,

    // AI-generated enhancements
    usageDescription,

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

// FIXED: Use your exact working Wix prompt
async function generateOptimizedContent(title, description) {
  const prompt = `You are an AI specialized in crafting concise, compelling product titles and short descriptions, ideal for ad creatives. The user will provide product information, and you must respond with a short product title (3 words) and a short descriptive phrase (maximum 7 words). The title must closely reflect the original product name—only shortening or refining it for clarity or formatting, or appending a clear category if not present. Descriptions must highlight the product's appeal in a punchy, succinct way. Avoid repeating product names in the description. Do not reference any examples provided by the user directly. Always maintain a persuasive and polished tone that fits well in promotional graphics or short ads.

Respond ONLY in strict JSON:
{
  "short_title": "...",
  "short_description": "..."
}

Product:
Title: ${title}
Description: ${description}`;

  console.log('=== USING WIX PROMPT ===');
  console.log('Input Title:', title);
  console.log('Input Description:', description);
  console.log('========================');

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
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    throw new Error('OpenAI API returned no choices');
  }

  let content = data.choices[0].message.content.trim();

  console.log('=== RAW OPENAI RESPONSE ===');
  console.log(content);
  console.log('===========================');

  // Clean up response (remove markdown formatting if present)
  content = content.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(content);

    console.log('=== PARSED RESULT ===');
    console.log('Short Title:', parsed.short_title);
    console.log('Short Description:', parsed.short_description);
    console.log('=====================');

    return {
      shortTitle: parsed.short_title,
      shortDescription: parsed.short_description
    };
  } catch (parseError) {
    console.error('JSON Parse Error:', parseError);
    console.error('Content that failed to parse:', content);

    // Fallback: try to extract manually
    const titleMatch = content.match(/"short_title":\s*"([^"]+)"/);
    const descMatch = content.match(/"short_description":\s*"([^"]+)"/);

    if (titleMatch && descMatch) {
      return {
        shortTitle: titleMatch[1],
        shortDescription: descMatch[1]
      };
    }

    throw new Error('Failed to parse optimized content: ' + content);
  }
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
${ctas.map(c => `- ${c.cta}: ${c.uses}`).join('\n')}

Respond with ONLY the exact CTA text, no quotes, no punctuation, no extra words.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You select the best CTA from provided options. Return only the CTA text with no quotes or extra formatting.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  let ctaText = data.choices[0].message.content.trim();

  // Clean up any quotes, extra whitespace, or formatting
  ctaText = ctaText
    .replace(/^["']|["']$/g, '') // Remove quotes from start/end
    .replace(/^`|`$/g, '')       // Remove backticks
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();                     // Final trim

  console.log('Selected CTA (cleaned):', `"${ctaText}"`);
  return ctaText;
}

module.exports = {
  prepareProductPackage,
  generateOptimizedContent, // This now uses your exact Wix prompt
  generateSloganPhrases,
  matchBestCta
};