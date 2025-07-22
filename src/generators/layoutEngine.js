class LayoutEngine {
  constructor(gridData, config) {
    this.grid = gridData;
    this.config = config;
    this.gridSize = config.grid.size;
    this.placedElements = {};
  }

  generateLayout() {
    // Process elements by priority
    const sortedElements = Object.entries(this.config.elements)
      .filter(([key, element]) => element.enabled !== false)
      .sort((a, b) => a[1].priority - b[1].priority);

    for (const [elementType, elementConfig] of sortedElements) {
      if (elementType === 'header') {
        this.placedElements.header = this.findOptimalHeader(elementConfig);
      } else if (elementType === 'subhead' && this.placedElements.header) {
        this.placedElements.subhead = this.findOptimalSubhead(elementConfig);
      } else if (elementType === 'logo' && this.placedElements.header) {
        this.placedElements.logo = this.findOptimalLogo(elementConfig);
      }
    }

    return this.placedElements;
  }

  findOptimalHeader(elementConfig) {
    const candidates = [];
    const rules = this.config.rules.header;

    // Check for wide open spaces
    const hasWideSpace = this.checkForWideOpenSpace();

    let ratiosToTry = elementConfig.ratios;
    if (hasWideSpace) {
      ratiosToTry = [...elementConfig.ratios].sort((a, b) => {
        const ratioA = a.w / a.h;
        const ratioB = b.w / b.h;
        return ratioB - ratioA;
      });
    }

    // Sort by area to prefer larger headers
    ratiosToTry = ratiosToTry.sort((a, b) => (b.w * b.h) - (a.w * a.h));

    for (const size of ratiosToTry) {
      if (size.w > elementConfig.maxWidth || size.h > elementConfig.maxHeight) continue;

      const startPos = elementConfig.minPadding || 0;
      const endRowPos = this.gridSize - size.h - (elementConfig.minPadding || 0);
      const endColPos = this.gridSize - size.w - (elementConfig.minPadding || 0);

      for (let row = startPos; row <= endRowPos; row++) {
        for (let col = startPos; col <= endColPos; col++) {
          const analysis = this.analyzeBlock(row, col, size.w, size.h);

          if (analysis.cellCount === 0) continue;

          const adjustedThreshold = rules.minScoreThreshold * (1 - (size.w * size.h) / 200);
          if (analysis.averageScore < adjustedThreshold) continue;

          const score = this.calculateHeaderScore(row, col, size.w, size.h, analysis);

          candidates.push({
            type: 'header',
            row, col,
            width: size.w,
            height: size.h,
            score,
            analysis,
            ratio: `${size.h}:${size.w}`,
            aspectRatio: size.w / size.h
          });
        }
      }
    }

    // Sort and return best
    candidates.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) < 0.1) {
        return (b.width * b.height) - (a.width * a.height);
      }
      return scoreDiff;
    });

    if (candidates[0] && rules.snapToCenterThreshold) {
      this.applyCenterSnapping(candidates[0], rules.snapToCenterThreshold);
    }

    return candidates[0] || null;
  }

  findOptimalSubhead(elementConfig) {
    const header = this.placedElements.header;
    if (!header) return null;

    const rules = this.config.rules.subhead;
    const candidates = [];

    // Filter subhead ratios based on header height constraint
    const minSubheadHeight = Math.max(1, Math.ceil(header.height / 2));
    const validRatios = elementConfig.ratios.filter(size => size.h >= minSubheadHeight);

    if (validRatios.length === 0) {
      console.warn(`No valid subhead ratios found for header height ${header.height}. Minimum required: ${minSubheadHeight}`);
      return null;
    }

    for (const size of validRatios) {
      let subheadCol;
      if (header.isCentered) {
        subheadCol = Math.floor(this.gridSize / 2 - size.w / 2);
      } else {
        subheadCol = header.col;
      }

      const startPos = elementConfig.minPadding || 0;
      subheadCol = Math.max(startPos, Math.min(subheadCol, this.gridSize - size.w - startPos));

      const headerBottom = header.row + header.height;
      for (let row = headerBottom; row <= this.gridSize - size.h - startPos; row++) {
        const analysis = this.analyzeBlock(row, subheadCol, size.w, size.h);

        if (analysis.cellCount === 0 || analysis.averageScore < 0.5) continue;
        if (this.hasOverlap({row, col: subheadCol, width: size.w, height: size.h})) continue;

        const distanceFromHeader = row - headerBottom;
        if (distanceFromHeader > rules.maxDistanceFromHeader) continue;

        const distancePenalty = Math.max(0.5, 1 - (distanceFromHeader * 0.1));

        // Add size harmony bonus - prefer subheads that are proportionally similar to header
        const heightRatio = size.h / header.height;
        const harmonyBonus = heightRatio >= 0.5 ? 1.2 : (heightRatio >= 0.4 ? 1.1 : 1.0);

        const score = analysis.averageScore * analysis.uniformityScore * distancePenalty * harmonyBonus;

        candidates.push({
          type: 'subhead',
          row, 
          col: subheadCol,
          width: size.w,
          height: size.h,
          score,
          analysis,
          ratio: `${size.h}:${size.w}`,
          distanceFromHeader,
          heightRatio,
          harmonyBonus
        });
      }
    }

    candidates.sort((a, b) => {
      if (Math.abs(a.distanceFromHeader - b.distanceFromHeader) <= 1) {
        // If distance is similar, prefer better harmony and score
        return (b.harmonyBonus * b.score) - (a.harmonyBonus * a.score);
      }
      return a.distanceFromHeader - b.distanceFromHeader;
    });

    return candidates[0] || null;
  }

  findOptimalLogo(elementConfig) {
    const header = this.placedElements.header;
    if (!header) return null;

    const rules = this.config.rules.logo;
    const logoSize = elementConfig.fixedSize;

    if (header.isCentered) {
      return this.findCenteredLogo(logoSize, elementConfig);
    } else {
      return this.findCornerLogo(logoSize, elementConfig);
    }
  }

  // ... Additional helper methods remain the same ...

  analyzeBlock(startRow, startCol, width, height) {
    let totalScore = 0;
    let cellCount = 0;
    let minScore = 1.0;
    let allScores = [];

    for (let row = startRow; row < startRow + height; row++) {
      for (let col = startCol; col < startCol + width; col++) {
        if (this.grid[row] && this.grid[row][col]) {
          const cell = this.grid[row][col];
          totalScore += cell.textScore;
          minScore = Math.min(minScore, cell.textScore);
          allScores.push(cell.textScore);
          cellCount++;
        }
      }
    }

    if (cellCount === 0) return { cellCount: 0 };

    const averageScore = totalScore / cellCount;
    const uniformityScore = this.calculateUniformity(allScores);
    const deadZonePenalty = minScore > 0.4 ? 1.0 : 0.3;

    return {
      cellCount,
      averageScore,
      minScore,
      uniformityScore,
      deadZonePenalty
    };
  }

  calculateUniformity(values) {
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return Math.max(0, 1 - (stdDev / 0.15));
  }

  checkForWideOpenSpace() {
    // Analyze if we have a wide open area suitable for 6:1 ratios
    const wideTestWidth = 18;
    const wideTestHeight = 3;
    let wideAreaScore = 0;
    let testedAreas = 0;

    for (let row = 1; row <= this.gridSize - wideTestHeight - 1; row += 2) {
      for (let col = 1; col <= this.gridSize - wideTestWidth - 1; col += 2) {
        const analysis = this.analyzeBlock(row, col, wideTestWidth, wideTestHeight);
        if (analysis.cellCount > 0 && analysis.averageScore > 0) {
          wideAreaScore += analysis.averageScore;
          testedAreas++;
        }
      }
    }

    const avgWideScore = testedAreas > 0 ? wideAreaScore / testedAreas : 0;
    return avgWideScore > 0.6;
  }

  calculateHeaderScore(row, col, width, height, analysis) {
    const centerBonus = this.calculateCenterBonus(row, col, width, height);
    const area = width * height;
    const maxArea = 18 * 5;
    const sizeBonus = 1 + (area / maxArea) * 2;
    const rowPosition = row / this.gridSize;
    const positionBonus = 1 + (rowPosition * 0.5);

    let score = analysis.averageScore * 
               analysis.uniformityScore * 1.5 *
               analysis.deadZonePenalty *
               sizeBonus *
               centerBonus * 0.1 *
               positionBonus;

    const aspectRatio = width / height;
    if (aspectRatio >= 3 && analysis.averageScore > 0.7) {
      const wideBonus = 1 + (aspectRatio - 2) * 0.15;
      score *= wideBonus;
    }

    return score;
  }

  calculateCenterBonus(row, col, width, height) {
    const clusterCenterCol = col + (width / 2);
    const gridCenterCol = this.gridSize / 2;
    const horizontalDistance = Math.abs(clusterCenterCol - gridCenterCol);
    const maxDistance = this.gridSize / 2;
    const centerBonus = 1 + (0.1 * (1 - (horizontalDistance / maxDistance)));
    return centerBonus;
  }

  applyCenterSnapping(element, threshold) {
    const gridCenterCol = this.gridSize / 2;
    const elementCenterCol = element.col + (element.width / 2);
    const distanceFromCenter = Math.abs(elementCenterCol - gridCenterCol);

    if (distanceFromCenter <= threshold) {
      element.centeredCol = Math.floor(gridCenterCol - (element.width / 2));
      element.isCentered = true;
      // Use the centered position if it's valid
      if (element.centeredCol >= 1 && element.centeredCol <= this.gridSize - element.width - 1) {
        element.col = element.centeredCol;
      }
    }
  }

  hasOverlap(testElement) {
    for (const [type, element] of Object.entries(this.placedElements)) {
      if (element && this.checkOverlap(testElement, element)) {
        return true;
      }
    }
    return false;
  }

  checkOverlap(elem1, elem2) {
    return !(elem1.col + elem1.width <= elem2.col || 
             elem1.col >= elem2.col + elem2.width || 
             elem1.row + elem1.height <= elem2.row || 
             elem1.row >= elem2.row + elem2.height);
  }

  findCenteredLogo(logoSize, elementConfig) {
    const centerCol = Math.floor(this.gridSize / 2 - logoSize.w / 2);
    const candidates = [];

    // Try bottom position first (no padding for logo)
    const bottomRow = this.gridSize - logoSize.h;
    if (!this.hasOverlap({row: bottomRow, col: centerCol, width: logoSize.w, height: logoSize.h})) {
      const analysis = this.analyzeBlock(bottomRow, centerCol, logoSize.w, logoSize.h);
      if (analysis.averageScore > 0.3) {
        candidates.push({
          type: 'logo',
          row: bottomRow,
          col: centerCol,
          width: logoSize.w,
          height: logoSize.h,
          score: analysis.averageScore,
          placement: 'bottom-center'
        });
      }
    }

    // Try top position
    const topRow = 0;
    if (!this.hasOverlap({row: topRow, col: centerCol, width: logoSize.w, height: logoSize.h})) {
      const analysis = this.analyzeBlock(topRow, centerCol, logoSize.w, logoSize.h);
      if (analysis.averageScore > 0.3) {
        candidates.push({
          type: 'logo',
          row: topRow,
          col: centerCol,
          width: logoSize.w,
          height: logoSize.h,
          score: analysis.averageScore,
          placement: 'top-center'
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  findCornerLogo(logoSize, elementConfig) {
    const header = this.placedElements.header;
    const candidates = [];

    // Define corners (no padding for logo)
    const corners = [
      { name: 'top-left', row: 0, col: 0 },
      { name: 'top-right', row: 0, col: this.gridSize - logoSize.w },
      { name: 'bottom-left', row: this.gridSize - logoSize.h, col: 0 },
      { name: 'bottom-right', row: this.gridSize - logoSize.h, col: this.gridSize - logoSize.w }
    ];

    for (const corner of corners) {
      if (!this.hasOverlap({row: corner.row, col: corner.col, width: logoSize.w, height: logoSize.h})) {
        const analysis = this.analyzeBlock(corner.row, corner.col, logoSize.w, logoSize.h);
        candidates.push({
          type: 'logo',
          row: corner.row,
          col: corner.col,
          width: logoSize.w,
          height: logoSize.h,
          score: analysis.averageScore,
          placement: corner.name
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }
}

module.exports = LayoutEngine;