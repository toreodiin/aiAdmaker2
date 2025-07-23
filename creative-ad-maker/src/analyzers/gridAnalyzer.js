class GridAnalyzer {
  constructor(pixelData, width, height, config) {
    this.pixelData = pixelData;
    this.width = width;
    this.height = height;
    this.config = config;
    this.gridSize = config.grid.size;
    this.gridWidth = width / this.gridSize;
    this.gridHeight = height / this.gridSize;
    this.grid = [];
  }

  analyze() {
    this.initializeGrid();
    this.applyNeighborBonuses();
    return this.grid;
  }

  initializeGrid() {
    for (let row = 0; row < this.gridSize; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.gridSize; col++) {
        const x = col * this.gridWidth;
        const y = row * this.gridHeight;
        this.grid[row][col] = this.analyzeGridCell(x, y, this.gridWidth, this.gridHeight, row, col);
      }
    }
  }

  analyzeGridCell(x, y, width, height, row, col) {
    // Extract pixels for this cell
    const cellPixels = this.extractCellPixels(x, y, width, height);

    const simplicity = this.calculateSimplicity(cellPixels);
    const isEmpty = this.calculateEmptiness(cellPixels);
    const textFriendly = this.calculateTextFriendliness(cellPixels);
    const avgBrightness = this.calculateAverageBrightness(cellPixels);

    const focusBonus = this.calculateFocusBonus(row, col);
    const edgePenalty = this.calculateEdgePenalty(row, col);

    const baseScore = (simplicity * 0.4 + isEmpty * 0.4 + textFriendly * 0.2) * 
                     focusBonus * edgePenalty;

    return {
      row, col, x, y, width, height,
      avgBrightness,
      metrics: {
        simplicity,
        isEmpty,
        textFriendly,
        focusBonus,
        edgePenalty
      },
      textScore: Math.max(0, Math.min(1, baseScore)),
      dominantColor: this.getDominantColor(cellPixels),
      preliminaryScore: baseScore
    };
  }

  extractCellPixels(x, y, cellWidth, cellHeight) {
    const pixels = [];
    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const endX = Math.floor(x + cellWidth);
    const endY = Math.floor(y + cellHeight);

    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const idx = (py * this.width + px) * 4;
        pixels.push({
          r: this.pixelData[idx],
          g: this.pixelData[idx + 1],
          b: this.pixelData[idx + 2],
          a: this.pixelData[idx + 3]
        });
      }
    }
    return pixels;
  }

  calculateSimplicity(pixels) {
    if (!pixels.length) return 0;

    let rSum = 0, gSum = 0, bSum = 0;
    pixels.forEach(p => {
      rSum += p.r || 0;
      gSum += p.g || 0;
      bSum += p.b || 0;
    });

    const avgR = rSum / pixels.length;
    const avgG = gSum / pixels.length;
    const avgB = bSum / pixels.length;

    let totalDeviation = 0;
    pixels.forEach(p => {
      const deviation = Math.sqrt(
        Math.pow((p.r || 0) - avgR, 2) + 
        Math.pow((p.g || 0) - avgG, 2) + 
        Math.pow((p.b || 0) - avgB, 2)
      );
      totalDeviation += deviation;
    });

    const avgDeviation = totalDeviation / pixels.length;
    return Math.max(0, 1 - (avgDeviation / 50));
  }

  calculateEmptiness(pixels) {
    const consistency = this.calculatePixelConsistency(pixels);
    const brightness = this.calculatePixelBrightness(pixels);
    return (consistency * 0.7 + brightness * 0.3);
  }

  calculatePixelConsistency(pixels) {
    if (!pixels.length) return 0;

    let minBrightness = 255, maxBrightness = 0;
    pixels.forEach(p => {
      const brightness = ((p.r || 0) + (p.g || 0) + (p.b || 0)) / 3;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
    });

    const brightnessRange = maxBrightness - minBrightness;
    return Math.max(0, 1 - (brightnessRange / 100));
  }

  calculatePixelBrightness(pixels) {
    if (!pixels.length) return 0;

    let totalBrightness = 0;
    pixels.forEach(p => {
      totalBrightness += ((p.r || 0) + (p.g || 0) + (p.b || 0)) / 3;
    });

    const avgBrightness = totalBrightness / pixels.length;

    if (avgBrightness >= 200) return 1.0;
    if (avgBrightness >= 150) return 0.8;
    if (avgBrightness >= 100) return 0.5;
    if (avgBrightness >= 50) return 0.2;
    return 0.1;
  }

  calculateTextFriendliness(pixels) {
    const dominantColor = this.getDominantColor(pixels);
    const luminance = 0.299 * dominantColor.r + 0.587 * dominantColor.g + 0.114 * dominantColor.b;

    if (luminance >= 50 && luminance <= 200) return 0.8;
    if (luminance >= 30 && luminance <= 230) return 0.5;
    return 0.2;
  }

  calculateAverageBrightness(pixels) {
    if (!pixels.length) return 128;

    let total = 0;
    pixels.forEach(p => {
      total += ((p.r || 0) + (p.g || 0) + (p.b || 0)) / 3;
    });
    return total / pixels.length;
  }

  getDominantColor(pixels) {
    if (!pixels.length) return { r: 128, g: 128, b: 128 };

    let r = 0, g = 0, b = 0;
    pixels.forEach(p => {
      r += p.r || 0;
      g += p.g || 0;
      b += p.b || 0;
    });

    return {
      r: Math.round(r / pixels.length),
      g: Math.round(g / pixels.length),
      b: Math.round(b / pixels.length)
    };
  }

  calculateFocusBonus(row, col) {
    const { focusZone, focusBonus } = this.config.grid;
    if (row >= focusZone.startRow && row <= focusZone.endRow) {
      return focusBonus;
    }
    return 1.0;
  }

  calculateEdgePenalty(row, col) {
    if (row === 0 || row === this.gridSize - 1 || 
        col === 0 || col === this.gridSize - 1) {
      return 0.3;
    }
    return 1.0;
  }

  applyNeighborBonuses() {
    const extremeThreshold = this.config.grid.extremeThreshold;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const cell = this.grid[row][col];
        const contextualBonus = this.calculateContextualBonus(row, col, extremeThreshold);
        cell.contextualBonus = contextualBonus;
        cell.textScore = Math.max(0, Math.min(1, cell.preliminaryScore + contextualBonus));
      }
    }
  }

  calculateContextualBonus(row, col, extremeThreshold) {
    if (extremeThreshold === 0) return 0;

    const currentCell = this.grid[row][col];
    const currentBrightness = currentCell.avgBrightness;
    const neighbors = this.get8Neighbors(row, col);

    if (!neighbors.length) return 0;

    const isExtreme = currentBrightness < 80 || currentBrightness > 180;
    if (!isExtreme) return 0;

    let compatibleNeighbors = 0;
    neighbors.forEach(neighbor => {
      const brightnessDiff = Math.abs(currentBrightness - neighbor.avgBrightness);
      if (brightnessDiff < 40) compatibleNeighbors++;
    });

    const compatibilityRatio = compatibleNeighbors / neighbors.length;
    return compatibilityRatio * extremeThreshold * 0.3;
  }

  get8Neighbors(row, col) {
    const neighbors = [];
    const directions = [
      [-1, 0], [-1, 1], [0, 1], [1, 1],
      [1, 0], [1, -1], [0, -1], [-1, -1]
    ];

    for (let [dRow, dCol] of directions) {
      const newRow = row + dRow;
      const newCol = col + dCol;

      if (newRow >= 0 && newRow < this.gridSize && 
          newCol >= 0 && newCol < this.gridSize) {
        if (this.grid[newRow] && this.grid[newRow][newCol]) {
          neighbors.push(this.grid[newRow][newCol]);
        }
      }
    }
    return neighbors;
  }

  analyzeBlock(startRow, startCol, width, height) {
    // This is used by the layout engine
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
}

module.exports = GridAnalyzer;