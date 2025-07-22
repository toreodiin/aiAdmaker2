// layoutConfig.js - ALL RULES IN ONE PLACE
module.exports = {
  // Grid settings
  grid: {
    size: 20,
    focusZone: { startRow: 3, endRow: 11 },
    focusBonus: 1.5,
    scoreThreshold: 0.6,
    extremeThreshold: 0.5
  },

  // Element definitions
  elements: {
    header: {
      name: 'Header',
      color: '#FF0000',
      ratios: [
        { w: 4, h: 2 },   // 2:1
        { w: 6, h: 3 },   // 2:1
        { w: 8, h: 4 },   // 2:1
        { w: 10, h: 5 },  // 2:1
        { w: 6, h: 1 },   // 6:1
        { w: 12, h: 2 },  // 6:1
        { w: 18, h: 3 },  // 6:1
      ],
      maxWidth: 18,
      maxHeight: 5,
      minPadding: 1, // Edge padding
      priority: 1
    },
    subhead: {
      name: 'Subhead',
      color: '#0000FF',
      ratios: [
        { w: 8, h: 2 },   // 4:1
        { w: 12, h: 3 },  // 4:1
        { w: 6, h: 1 },   // 6:1
        { w: 12, h: 2 },  // 6:1
      ],
      minPadding: 1,
      priority: 2
    },
    logo: {
      name: 'Logo',
      color: '#800080',
      fixedSize: { w: 4, h: 4 },
      minPadding: 0, // No padding for logo
      priority: 3
    },
    cta: {
      name: 'CTA',
      color: '#008000',
      fixedSize: { w: 4, h: 2 },
      minPadding: 1,
      priority: 4,
      enabled: false // Easy toggle
    }
  },

  // Placement rules
  rules: {
    header: {
      preferLowerPosition: true,
      preferCentered: true,
      snapToCenterThreshold: 2, // Grid cells
      preferLargerSizes: true,
      minScoreThreshold: 0.6
    },
    subhead: {
      alignWithHeader: true,
      mustBeBelow: 'header',
      maxDistanceFromHeader: 5, // Grid cells
      preferCenteredIfHeaderCentered: true
    },
    logo: {
      placement: {
        ifHeaderCentered: ['bottom-center', 'top-center'],
        ifHeaderNotCentered: ['corners-away-from-header']
      },
      avoidOverlap: true
    }
  },

  // Scoring weights
  scoring: {
    sizeImportance: 2.0,      // How much to favor larger elements
    positionImportance: 0.5,   // How much position matters
    uniformityImportance: 1.5, // How much uniform areas matter
    centerBonus: 0.1          // Bonus for centered placement
  }
};