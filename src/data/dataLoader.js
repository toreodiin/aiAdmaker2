const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');

class DataLoader {
  constructor() {
    this.styles = [];
    this.ctaHeuristics = [];
  }

  async initialize() {
    try {
      // Load styles
      const stylesCSV = await fs.readFile(path.join(__dirname, '../../data/Import1.csv'), 'utf8');
      const stylesParsed = Papa.parse(stylesCSV, { header: true, dynamicTyping: true });
      this.styles = stylesParsed.data.filter(row => row.Title); // Filter out empty rows

      // Load CTA heuristics
      const ctaCSV = await fs.readFile(path.join(__dirname, '../../data/ctaHeuristics.csv'), 'utf8');
      const ctaParsed = Papa.parse(ctaCSV, { header: true, dynamicTyping: true });
      this.ctaHeuristics = ctaParsed.data.filter(row => row.cta);

      console.log(`Loaded ${this.styles.length} styles and ${this.ctaHeuristics.length} CTAs`);
    } catch (error) {
      console.error('Error loading data files:', error);
      throw error;
    }
  }

  getStyles() {
    return this.styles;
  }

  getCTAs() {
    return this.ctaHeuristics;
  }
}

// Singleton instance
const dataLoader = new DataLoader();

module.exports = dataLoader;