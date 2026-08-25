'use strict';

/**
 * Curated catalogue of reputable memory brands.
 * `tier` drives default ordering in the dashboard: the user asked for
 * Corsair and G.Skill first, then the other reputed names.
 */
const BRANDS = [
  { id: 'corsair',  name: 'Corsair',       tier: 1, patterns: [/\bcorsair\b/i, /\bvengeance\b/i, /\bdominator\b/i] },
  { id: 'gskill',   name: 'G.Skill',       tier: 1, patterns: [/\bg[\.\s_-]?skill\b/i, /\btrident\s*z\b/i, /\bripjaws\b/i, /\bflare\s*x\b/i] },

  { id: 'kingston', name: 'Kingston',      tier: 2, patterns: [/\bkingston\b/i, /\bfury\s+(beast|renegade|impact)\b/i, /\bkingmax\b(?!)/i] },
  { id: 'crucial',  name: 'Crucial',       tier: 2, patterns: [/\bcrucial\b/i, /\bballistix\b/i] },
  { id: 'adata',    name: 'ADATA / XPG',   tier: 2, patterns: [/\ba[\s-]?data\b/i, /\bxpg\b/i, /\blancer\b/i, /\bcaster\b/i] },
  { id: 'teamgroup',name: 'TeamGroup',     tier: 2, patterns: [/\bteam\s*group\b/i, /\bt[\s-]?force\b/i, /\bteam\s+(elite|delta|vulcan|xtreem)\b/i] },
  { id: 'patriot',  name: 'Patriot',       tier: 2, patterns: [/\bpatriot\b/i, /\bviper\b/i] },

  { id: 'samsung',  name: 'Samsung',       tier: 3, patterns: [/\bsamsung\b/i] },
  { id: 'hynix',    name: 'SK hynix',      tier: 3, patterns: [/\bsk\s*hynix\b/i, /\bhynix\b/i] },
  { id: 'micron',   name: 'Micron',        tier: 3, patterns: [/\bmicron\b/i] },
  { id: 'lexar',    name: 'Lexar',         tier: 3, patterns: [/\blexar\b/i, /\bthor\b/i] },
  { id: 'klevv',    name: 'KLEVV',         tier: 3, patterns: [/\bklevv\b/i, /\bcras\b/i] },
  { id: 'pny',      name: 'PNY',           tier: 3, patterns: [/\bpny\b/i] },
  { id: 'silicon',  name: 'Silicon Power', tier: 3, patterns: [/\bsilicon\s*power\b/i] },
  { id: 'transcend',name: 'Transcend',     tier: 3, patterns: [/\btranscend\b/i] },
  { id: 'apacer',   name: 'Apacer',        tier: 3, patterns: [/\bapacer\b/i] },
  { id: 'mushkin',  name: 'Mushkin',       tier: 3, patterns: [/\bmushkin\b/i] },
  { id: 'netac',    name: 'Netac',         tier: 3, patterns: [/\bnetac\b/i] },
  { id: 'neoforza', name: 'Neo Forza',     tier: 3, patterns: [/\bneo\s*forza\b/i] },
  { id: 'acer',     name: 'Acer Predator', tier: 3, patterns: [/\bpredator\b/i, /\bacer\b/i] },
  { id: 'gigabyte', name: 'Gigabyte AORUS',tier: 3, patterns: [/\baorus\b/i] },
  { id: 'asgard',   name: 'Asgard',        tier: 3, patterns: [/\basgard\b/i] },
  { id: 'kimtigo',  name: 'Kimtigo',       tier: 3, patterns: [/\bkimtigo\b/i] },
  { id: 'zadak',    name: 'ZADAK',         tier: 3, patterns: [/\bzadak\b/i] },
  { id: 'colorful', name: 'Colorful',      tier: 3, patterns: [/\bcolorful\b/i] },
  { id: 'blackberry', name: 'Kingbank',    tier: 3, patterns: [/\bking\s?bank\b/i] }
];

const BY_ID = new Map(BRANDS.map((b) => [b.id, b]));

/** Best-effort brand detection from a product title / vendor string. */
function detectBrand(text) {
  if (!text) return null;
  for (const tier of [1, 2, 3]) {
    for (const b of BRANDS) {
      if (b.tier !== tier) continue;
      for (const p of b.patterns) if (p.test(text)) return b;
    }
  }
  return null;
}

module.exports = { BRANDS, BY_ID, detectBrand };
