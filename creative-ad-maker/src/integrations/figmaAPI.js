// src/integrations/figmaAPI.js
const fetch = require('node-fetch');

class FigmaAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.figma.com/v1';
  }

  async createAdFrame(payload) {
    const { layout, content, images, style } = payload;

    try {
      // Step 1: Create a new Figma file
      const fileResponse = await this.createFile(`AI Ad - ${content.header.text}`);
      const fileId = fileResponse.key;

      // Step 2: Get the canvas ID from the created file
      const fileData = await this.getFile(fileId);
      const canvasId = fileData.document.children[0].id;

      // Step 3: Create the ad layout frame
      const frameNodes = await this.createAdLayout(fileId, canvasId, layout, content, images, style);

      return {
        success: true,
        fileId: fileId,
        url: `https://www.figma.com/file/${fileId}`,
        nodes: frameNodes
      };

    } catch (error) {
      console.error('Figma API error:', error);
      throw error;
    }
  }

  async createFile(name) {
    const response = await fetch(`${this.baseURL}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        node_type: 'CANVAS'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Figma file: ${error}`);
    }

    return await response.json();
  }

  async getFile(fileId) {
    const response = await fetch(`${this.baseURL}/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get Figma file: ${error}`);
    }

    return await response.json();
  }

  async createAdLayout(fileId, canvasId, layout, content, images, style) {
    // Convert grid positions to Figma coordinates
    const gridSize = 20;
    const cellSize = 1024 / gridSize; // Assuming 1024x1024 canvas

    const nodes = [];

    // Create main ad frame
    const adFrame = {
      type: 'FRAME',
      name: 'AI Generated Ad',
      x: 0,
      y: 0,
      width: 1024,
      height: 1024,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      children: []
    };

    // Add background image if available
    if (images.hero || images.staged || images.lifestyle) {
      const bgImage = images.hero || images.staged || images.lifestyle;
      const backgroundNode = await this.createImageNode(
        'Background',
        0, 0, 1024, 1024,
        bgImage
      );
      adFrame.children.push(backgroundNode);
    }

    // Add header text
    if (layout.header && content.header) {
      const headerNode = this.createTextNode(
        'Header',
        layout.header.col * cellSize,
        layout.header.row * cellSize,
        layout.header.width * cellSize,
        layout.header.height * cellSize,
        content.header.text,
        {
          fontFamily: content.header.font,
          fontSize: this.calculateFontSize(layout.header.height * cellSize, 'header'),
          fontWeight: 'bold'
        }
      );
      adFrame.children.push(headerNode);
    }

    // Add subhead text
    if (layout.subhead && content.subhead) {
      const subheadNode = this.createTextNode(
        'Subhead',
        layout.subhead.col * cellSize,
        layout.subhead.row * cellSize,
        layout.subhead.width * cellSize,
        layout.subhead.height * cellSize,
        content.subhead.text,
        {
          fontFamily: content.subhead.font,
          fontSize: this.calculateFontSize(layout.subhead.height * cellSize, 'subhead'),
          fontWeight: 'normal'
        }
      );
      adFrame.children.push(subheadNode);
    }

    // Add logo
    if (layout.logo && content.logo) {
      const logoNode = await this.createLogoNode(
        'Logo',
        layout.logo.col * cellSize,
        layout.logo.row * cellSize,
        layout.logo.width * cellSize,
        layout.logo.height * cellSize,
        content.logo.data
      );
      adFrame.children.push(logoNode);
    }

    // Add CTA button
    if (layout.cta && content.cta) {
      const ctaNode = this.createCTANode(
        'CTA',
        layout.cta.col * cellSize,
        layout.cta.row * cellSize,
        layout.cta.width * cellSize,
        layout.cta.height * cellSize,
        content.cta.text
      );
      adFrame.children.push(ctaNode);
    }

    // Create the nodes in Figma
    const createResponse = await this.createNodes(fileId, canvasId, [adFrame]);

    return createResponse;
  }

  async createImageNode(name, x, y, width, height, imageUrl) {
    // For images, we need to upload them to Figma first
    let imageRef = null;

    if (imageUrl.startsWith('data:')) {
      // Convert base64 to Figma image
      imageRef = await this.uploadImage(imageUrl);
    } else {
      // Handle URL images
      imageRef = await this.uploadImageFromURL(imageUrl);
    }

    return {
      type: 'RECTANGLE',
      name: name,
      x: x,
      y: y,
      width: width,
      height: height,
      fills: imageRef ? [{
        type: 'IMAGE',
        imageRef: imageRef,
        scaleMode: 'FILL'
      }] : [{
        type: 'SOLID',
        color: { r: 0.9, g: 0.9, b: 0.9 }
      }]
    };
  }

  createTextNode(name, x, y, width, height, text, typography) {
    return {
      type: 'TEXT',
      name: name,
      x: x,
      y: y,
      width: width,
      height: height,
      characters: text,
      style: {
        fontFamily: typography.fontFamily || 'Arial',
        fontSize: typography.fontSize || 24,
        fontWeight: typography.fontWeight || 400,
        textAlignHorizontal: 'CENTER',
        textAlignVertical: 'CENTER'
      },
      fills: [{
        type: 'SOLID',
        color: { r: 0, g: 0, b: 0 }
      }]
    };
  }

  async createLogoNode(name, x, y, width, height, logoData) {
    if (typeof logoData === 'object' && logoData.type === 'svg') {
      // Handle SVG logos
      return {
        type: 'VECTOR',
        name: name,
        x: x,
        y: y,
        width: width,
        height: height,
        vectorData: this.convertSVGToFigmaVector(logoData.content)
      };
    } else {
      // Handle image logos
      return await this.createImageNode(name, x, y, width, height, logoData);
    }
  }

  createCTANode(name, x, y, width, height, text) {
    return {
      type: 'FRAME',
      name: name,
      x: x,
      y: y,
      width: width,
      height: height,
      fills: [{
        type: 'SOLID',
        color: { r: 0, g: 0.5, b: 1 }
      }],
      cornerRadius: 8,
      children: [{
        type: 'TEXT',
        name: 'CTA Text',
        x: 0,
        y: 0,
        width: width,
        height: height,
        characters: text,
        style: {
          fontFamily: 'Arial',
          fontSize: this.calculateFontSize(height, 'cta'),
          fontWeight: 'bold',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER'
        },
        fills: [{
          type: 'SOLID',
          color: { r: 1, g: 1, b: 1 }
        }]
      }]
    };
  }

  async createNodes(fileId, parentId, nodes) {
    const response = await fetch(`${this.baseURL}/files/${fileId}/nodes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent_id: parentId,
        nodes: nodes
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Figma nodes: ${error}`);
    }

    return await response.json();
  }

  async uploadImage(base64Data) {
    // Remove data URL prefix
    const base64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await fetch(`${this.baseURL}/images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64
      })
    });

    if (!response.ok) {
      console.warn('Failed to upload image to Figma');
      return null;
    }

    const result = await response.json();
    return result.meta.images ? Object.values(result.meta.images)[0] : null;
  }

  async uploadImageFromURL(imageUrl) {
    try {
      // Fetch the image and convert to base64
      const response = await fetch(imageUrl);
      const buffer = await response.buffer();
      const base64 = `data:image/png;base64,${buffer.toString('base64')}`;
      return await this.uploadImage(base64);
    } catch (error) {
      console.warn('Failed to upload image from URL:', error);
      return null;
    }
  }

  calculateFontSize(containerHeight, elementType) {
    const ratios = {
      header: 0.6,    // 60% of container height
      subhead: 0.5,   // 50% of container height
      cta: 0.4        // 40% of container height
    };

    const minSizes = {
      header: 24,
      subhead: 18,
      cta: 14
    };

    const calculated = containerHeight * (ratios[elementType] || 0.5);
    return Math.max(calculated, minSizes[elementType] || 12);
  }

  convertSVGToFigmaVector(svgContent) {
    // This is a simplified SVG to Figma vector conversion
    // In a real implementation, you'd need a more robust SVG parser
    console.warn('SVG to Figma vector conversion is simplified');

    return {
      vectorPaths: [{
        windingRule: 'NONZERO',
        data: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' // Placeholder path
      }],
      fills: [{
        type: 'SOLID',
        color: { r: 0, g: 0, b: 0 }
      }]
    };
  }
}

module.exports = FigmaAPI;