// src/generators/lifestyleImageGenerator.js
const fetch = require('node-fetch');
const { OPENAI_KEY } = require('../config/apiKeys');

const BASE_PROMPT = `Showcase the product in a high-end editorial ad-lifestyle analog photo, with a hot good looking model, shot on analog film, realistic lighting, cinematic mood. Ensure correct size and placement of text, logos and other details. Retain all visible text exactly as it appears in the reference image.`;

const SCENES = [
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

const FRAMINGS = [
    " Close-up shot focusing on fabric and texture details.",
    " Medium crop showing half-body with casual styling.",
    " Full-body frame capturing entire outfit and surroundings.",
    " Slightly wide shot including room details for lifestyle feel.",
    " Over-the-shoulder angle for candid editorial mood."
];

/**
 * Generate lifestyle image using reference image and prompt variations
 */
async function generateLifestyleImage(productPackage) {
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
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const framing = FRAMINGS[Math.floor(Math.random() * FRAMINGS.length)];

    // Add flash photography variant occasionally
    let basePromptVariant = BASE_PROMPT;
    if (Math.random() < 0.3) {
        basePromptVariant = BASE_PROMPT.replace("analog film", "analog flash photography");
    }

    // Incorporate marketing style
    const styleAdjustment = getStyleAdjustment(marketingStyleName);
    const finalPrompt = basePromptVariant + scene + framing + styleAdjustment;

    // Try generation with retry logic
    return await generateWithRetry(finalPrompt, referenceImageB64);
}

/**
 * Generate image with retry and prompt rewriting
 */
async function generateWithRetry(prompt, referenceImageB64, maxAttempts = 2) {
    let currentPrompt = prompt;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const result = await callOpenAIImageGeneration(currentPrompt, referenceImageB64);
            if (result) {
                return result;
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

    throw new Error('Failed to generate lifestyle image after all attempts');
}

/**
 * Call OpenAI image generation API
 */
async function callOpenAIImageGeneration(prompt, referenceImageB64) {
    const inputContent = [
        { type: "input_text", text: prompt },
        { 
            type: "input_image", 
            image_url: `data:image/jpeg;base64,${referenceImageB64}` 
        }
    ];

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
                size: "1024x1024"
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // Extract image data from response
    const imageOutputs = data.output?.filter(output => output.type === "image_generation_call");
    if (imageOutputs && imageOutputs.length > 0) {
        return imageOutputs[0].result; // Base64 image data
    }

    return null;
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
 * Adjust prompt based on marketing style
 */
function getStyleAdjustment(styleName) {
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

module.exports = {
    generateLifestyleImage
};