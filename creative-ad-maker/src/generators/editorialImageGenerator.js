// src/generators/editorialImageGenerator.js
const fetch = require('node-fetch');
const { OPENAI_KEY } = require('../config/apiKeys');

const BASE_PROMPT = `High-end editorial lifestyle photography capturing the essence and atmosphere of this lifestyle moment. Professional magazine-quality photo with cinematic mood and beautiful lighting. No products visible, just the pure lifestyle editorial moment.`;

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
 * Generate editorial image with streaming support
 */
async function generateEditorialImage(productPackage, onPartialImage = null) {
    const { usageDescription, marketingStyleName } = productPackage;

    // Generate prompt with scene variation
    const scene = EDITORIAL_SCENES[Math.floor(Math.random() * EDITORIAL_SCENES.length)];
    const mood = EDITORIAL_MOODS[Math.floor(Math.random() * EDITORIAL_MOODS.length)];

    // Incorporate marketing style
    const styleAdjustment = getEditorialStyleAdjustment(marketingStyleName);
    const finalPrompt = `${BASE_PROMPT} Editorial scene related to: ${usageDescription}.${scene}${mood}${styleAdjustment}`;

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
    
    let apiResponse; // Declare at function scope
    
    try {
        apiResponse = await fetch('https://api.openai.com/v1/responses', {
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

        console.log('Editorial API response status:', apiResponse.status);

        if (!apiResponse.ok) {
            const errorData = await apiResponse.text();
            console.error('Editorial API error:', errorData);
            throw new Error(`OpenAI API error: ${apiResponse.status} - ${errorData}`);
        }

        if (onPartialImage && apiResponse.body) {
            // Handle streaming response
            console.log('Handling streaming response...');
            const finalResult = await handleStreamingResponse(apiResponse, onPartialImage);
            return finalResult ? `data:image/png;base64,${finalResult}` : null;
        } else {
            // Handle non-streaming response
            console.log('Handling non-streaming response...');
            const data = await apiResponse.json();
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
 * Handle streaming response for partial images
 */
async function handleStreamingResponse(response, onPartialImage) {
    const decoder = new TextDecoder();
    let finalImageResult = null;

    try {
        // Check if streaming is supported
        if (!response.body || typeof response.body.getReader !== 'function') {
            // Fallback to non-streaming response
            const jsonData = await response.json();
            if (jsonData.outputs && jsonData.outputs.length > 0) {
                return jsonData.outputs[0].image.base64;
            }
            throw new Error('No image outputs found in non-streaming response');
        }

        const reader = response.body.getReader();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const eventData = JSON.parse(line.slice(6));

                        if (eventData.type === 'response.image_generation_call.partial_image') {
                            // Handle partial image
                            const partialImageB64 = eventData.partial_image_b64;
                            const partialIndex = eventData.partial_image_index;

                            if (onPartialImage && partialImageB64) {
                                onPartialImage(`data:image/png;base64,${partialImageB64}`, partialIndex);
                            }
                        } else if (eventData.type === 'response.image_generation_call.completed') {
                            // Handle final image
                            finalImageResult = eventData.result;
                        }
                    } catch (parseError) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }
        }

        return finalImageResult;
    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
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

module.exports = {
    generateEditorialImage
};