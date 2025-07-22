const fetch = require('node-fetch');
const { OPENAI_KEY } = require('../config/apiKeys');
const dataLoader = require('../data/dataLoader');

async function prepareProductPackage(product) {
  const { title, description, price, images } = product;

  // 1️⃣ Generate usage description
  const usagePrompt = `Describe in one sentence how and where the product is typically used. Be specific, short, avoid repeating product name.

Product:
Title: ${title}
Description: ${description}`;

  const usageRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a concise product usage describer.' },
        { role: 'user', content: usagePrompt }
      ]
    })
  });

  const usageData = await usageRes.json();
  const usageDescription = usageData.choices[0].message.content.trim();

  // 2️⃣ Get styles from CSV
  const styles = dataLoader.getStyles();

  // 3️⃣ Ask for best style name
  const stylePrompt = `Given the product below, pick the best matching style NAME from the list.

Product:
Title: ${title}
Usage: ${usageDescription}

Styles:
${styles.map(s => `- ${s.Title}: ${s.description}`).join('\n')}

Respond ONLY with the exact style name.`;

  const styleRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a style matcher. Only output the style name.' },
        { role: 'user', content: stylePrompt }
      ]
    })
  });

  const styleData = await styleRes.json();
  const styleName = styleData.choices[0].message.content.trim();

  // 4️⃣ Lookup style
  const matchedStyle = styles.find(s => s.Title.toLowerCase() === styleName.toLowerCase()) || styles[0];

  return {
    title,
    description,
    price,
    images,
    usageDescription,
    marketingStyleName: matchedStyle.Title,
    marketingStyleDescription: matchedStyle.description,
    headerFont: matchedStyle.header_font,
    subheadFont: matchedStyle.subhead_font
  };
}

async function generateShortTitleAndDescription(product) {
  const { title, description } = product;

  const prompt = `
You are an AI specialized in crafting concise, compelling product titles and short descriptions, ideal for ad creatives. The user will provide product information, and you must respond with a short product title (3 words) and a short descriptive phrase (maximum 7 words). The title must closely reflect the original product name—only shortening or refining it for clarity or formatting, or appending a clear category if not present. Descriptions must highlight the product's appeal in a punchy, succinct way. Avoid repeating product names in the description. Do not reference any examples provided by the user directly. Always maintain a persuasive and polished tone that fits well in promotional graphics or short ads.

Respond ONLY in strict JSON:
{
  "short_title": "...",
  "short_description": "..."
}

Product:
Title: ${title}
Description: ${description}
`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You generate short product titles and descriptions only.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await res.json();
  let raw = data.choices[0].message.content.trim();
  raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  return {
    shortTitle: parsed.short_title,
    shortDescription: parsed.short_description
  };
}

async function generateSloganPhrases(product) {
  const { title, description, marketingStyleName, marketingStyleDescription } = product;

  const prompt = `
This GPT specializes in generating a list of sleek, benefit-driven slogan ideas inspired by Apple-style copywriting. It focuses on delivering product-aligned, emotionally resonant slogans—crafted with clarity, simplicity, and a touch of deeper meaning. Each slogan is tailored to the nature of the product and its intended use, without overusing vague terms like "elevated" or "redefined," especially for non-tech items.

**Direction:** The selected style is *${marketingStyleName}*. Let this inform the vibe subtly — match tone, mood, or word choices if relevant, but dont let it be too dominant. A good slogan allows more to me interpetrated by the viewer. Dont give them 4, give them 2+2

### Guidelines for Slogan Generation:
- One Big Idea Per Slogan: Keep focus tight.
- Product-Relevant Vocabulary: Match the product.
- Avoid Fluff.
- Include Double Meanings.
- Write for Interpretation.
- Result-Oriented: What does it *do* for the customer?

### Format:
Return a strict JSON list:
{
  "slogans": [
    "Slogan 1 text",
    ...
    "Slogan 10 text"
  ]
}

### Product:
Title: ${title}
Description: ${description}
`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a slogan generator. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await res.json();
  let raw = data.choices[0].message.content.trim();
  raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  return parsed.slogans;
}

async function matchBestCta(product) {
  const { title, description, usageDescription } = product;

  // Get CTAs from CSV
  const ctas = dataLoader.getCTAs();

  const prompt = `
Given the product details and usage, pick the most relevant CTA from this list.

Product:
Title: ${title}
Description: ${description}
Usage: ${usageDescription}

CTAs:
${ctas.map(c => `- ${c.cta}: ${c.uses}`).join('\n')}

Respond ONLY with the CTA text.
`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a CTA matcher. Return only the best CTA text.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await res.json();
  const ctaText = data.choices[0].message.content.trim();
  return ctaText;
}

module.exports = {
  prepareProductPackage,
  generateShortTitleAndDescription,
  generateSloganPhrases,
  matchBestCta
};