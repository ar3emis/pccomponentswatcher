'use strict';

/**
 * Graphics-card catalogue.
 *
 * Retail listings very often omit the VRAM size ("ASUS TUF RTX 5090 OC
 * Gaming"), so the authoritative figure comes from the chip, not the title.
 * `vram` is the reference size; `vramVariants` lists the sizes a board may
 * ship with, which we then disambiguate from the title when possible.
 */
const GPU_MODELS = [
  // NVIDIA GeForce RTX 50 series
  { id: 'rtx5090', name: 'GeForce RTX 5090', vendor: 'NVIDIA', vram: 32, tier: 1, patterns: [/\brtx\s*-?\s*5090\b/i, /\b5090\b/i] },
  { id: 'rtx5080', name: 'GeForce RTX 5080', vendor: 'NVIDIA', vram: 16, tier: 1, patterns: [/\brtx\s*-?\s*5080\b/i, /\b5080\b/i] },
  { id: 'rtx5070ti', name: 'GeForce RTX 5070 Ti', vendor: 'NVIDIA', vram: 16, tier: 1, patterns: [/\brtx\s*-?\s*5070\s*ti\b/i, /\b5070\s*ti\b/i] },
  { id: 'rtx5070', name: 'GeForce RTX 5070', vendor: 'NVIDIA', vram: 12, tier: 2, patterns: [/\brtx\s*-?\s*5070\b/i] },
  { id: 'rtx5060ti', name: 'GeForce RTX 5060 Ti', vendor: 'NVIDIA', vram: 16, vramVariants: [8, 16], tier: 2, patterns: [/\brtx\s*-?\s*5060\s*ti\b/i] },
  { id: 'rtx5060', name: 'GeForce RTX 5060', vendor: 'NVIDIA', vram: 8, tier: 3, patterns: [/\brtx\s*-?\s*5060\b/i] },
  { id: 'rtx5050', name: 'GeForce RTX 5050', vendor: 'NVIDIA', vram: 8, tier: 3, patterns: [/\brtx\s*-?\s*5050\b/i] },

  // NVIDIA GeForce RTX 40 series (still widely stocked)
  { id: 'rtx4090', name: 'GeForce RTX 4090', vendor: 'NVIDIA', vram: 24, tier: 1, patterns: [/\brtx\s*-?\s*4090\b/i] },
  { id: 'rtx4080s', name: 'GeForce RTX 4080 SUPER', vendor: 'NVIDIA', vram: 16, tier: 1, patterns: [/\brtx\s*-?\s*4080\s*super\b/i] },
  { id: 'rtx4080', name: 'GeForce RTX 4080', vendor: 'NVIDIA', vram: 16, tier: 1, patterns: [/\brtx\s*-?\s*4080\b/i] },
  { id: 'rtx4070tis', name: 'GeForce RTX 4070 Ti SUPER', vendor: 'NVIDIA', vram: 16, tier: 2, patterns: [/\brtx\s*-?\s*4070\s*ti\s*super\b/i] },
  { id: 'rtx4070ti', name: 'GeForce RTX 4070 Ti', vendor: 'NVIDIA', vram: 12, tier: 2, patterns: [/\brtx\s*-?\s*4070\s*ti\b/i] },
  { id: 'rtx4060ti', name: 'GeForce RTX 4060 Ti', vendor: 'NVIDIA', vram: 16, vramVariants: [8, 16], tier: 3, patterns: [/\brtx\s*-?\s*4060\s*ti\b/i] },

  // NVIDIA RTX PRO Blackwell — the current workstation generation
  { id: 'rtxpro6000blackwell', name: 'RTX PRO 6000 Blackwell', vendor: 'NVIDIA', vram: 96, tier: 1, patterns: [/\brtx\s*pro\s*6000\b/i, /\bpro\s*6000\s*blackwell\b/i] },
  { id: 'rtxpro5000blackwell', name: 'RTX PRO 5000 Blackwell', vendor: 'NVIDIA', vram: 48, tier: 1, patterns: [/\brtx\s*pro\s*5000\b/i] },
  { id: 'rtxpro4500blackwell', name: 'RTX PRO 4500 Blackwell', vendor: 'NVIDIA', vram: 32, tier: 2, patterns: [/\brtx\s*pro\s*4500\b/i] },
  { id: 'rtxpro4000blackwell', name: 'RTX PRO 4000 Blackwell', vendor: 'NVIDIA', vram: 24, tier: 2, patterns: [/\brtx\s*pro\s*4000\b/i] },

  // NVIDIA workstation boards that compete for the same buyers
  { id: 'rtx6000ada', name: 'RTX 6000 Ada Generation', vendor: 'NVIDIA', vram: 48, tier: 1, patterns: [/\brtx\s*6000\s*ada\b/i] },
  { id: 'rtx5000ada', name: 'RTX 5000 Ada', vendor: 'NVIDIA', vram: 32, tier: 2, patterns: [/\brtx\s*5000\s*ada\b/i] },
  { id: 'rtx4500ada', name: 'RTX 4500 Ada', vendor: 'NVIDIA', vram: 24, tier: 3, patterns: [/\brtx\s*4500\s*ada\b/i] },
  { id: 'rtx4000ada', name: 'RTX 4000 Ada Generation', vendor: 'NVIDIA', vram: 20, tier: 3, patterns: [/\brtx\s*4000\s*ada\b/i] },

  // NVIDIA RTX A-series (Ampere) — still widely traded second-hand and by some AIBs
  { id: 'rtxa6000', name: 'RTX A6000', vendor: 'NVIDIA', vram: 48, tier: 2, patterns: [/\brtx\s*a6000\b/i, /\ba6000\b/i] },
  { id: 'rtxa5000', name: 'RTX A5000', vendor: 'NVIDIA', vram: 24, tier: 2, patterns: [/\brtx\s*a5000\b/i, /\ba5000\b/i] },
  { id: 'rtxa4500', name: 'RTX A4500', vendor: 'NVIDIA', vram: 20, tier: 3, patterns: [/\brtx\s*a4500\b/i, /\ba4500\b/i] },
  { id: 'rtxa4000', name: 'RTX A4000', vendor: 'NVIDIA', vram: 16, tier: 3, patterns: [/\brtx\s*a4000\b/i, /\ba4000\b/i] },

  // AMD Radeon RX 9000 series — the direct alternatives
  { id: 'rx9070xt', name: 'Radeon RX 9070 XT', vendor: 'AMD', vram: 16, tier: 1, patterns: [/\brx\s*-?\s*9070\s*xt\b/i, /\b9070\s*xt\b/i] },
  { id: 'rx9070gre', name: 'Radeon RX 9070 GRE', vendor: 'AMD', vram: 12, tier: 2, patterns: [/\brx\s*-?\s*9070\s*gre\b/i] },
  { id: 'rx9070', name: 'Radeon RX 9070', vendor: 'AMD', vram: 16, tier: 1, patterns: [/\brx\s*-?\s*9070\b/i] },
  { id: 'rx9060xt', name: 'Radeon RX 9060 XT', vendor: 'AMD', vram: 16, vramVariants: [8, 16], tier: 2, patterns: [/\brx\s*-?\s*9060\s*xt\b/i] },

  // AMD Radeon RX 7000 series
  { id: 'rx7900xtx', name: 'Radeon RX 7900 XTX', vendor: 'AMD', vram: 24, tier: 1, patterns: [/\brx\s*-?\s*7900\s*xtx\b/i] },
  { id: 'rx7900xt', name: 'Radeon RX 7900 XT', vendor: 'AMD', vram: 20, tier: 2, patterns: [/\brx\s*-?\s*7900\s*xt\b/i] },
  { id: 'rx7800xt', name: 'Radeon RX 7800 XT', vendor: 'AMD', vram: 16, tier: 2, patterns: [/\brx\s*-?\s*7800\s*xt\b/i] },
  { id: 'rx7700xt', name: 'Radeon RX 7700 XT', vendor: 'AMD', vram: 12, tier: 3, patterns: [/\brx\s*-?\s*7700\s*xt\b/i] },
  { id: 'rx7600xt', name: 'Radeon RX 7600 XT', vendor: 'AMD', vram: 16, tier: 3, patterns: [/\brx\s*-?\s*7600\s*xt\b/i] },

  // AMD professional — the 32GB answer to a 5090
  { id: 'r9700', name: 'Radeon AI PRO R9700', vendor: 'AMD', vram: 32, tier: 1, patterns: [/\bai\s*pro\s*r9700\b/i, /\br9700\b/i] },
  { id: 'w7900', name: 'Radeon PRO W7900', vendor: 'AMD', vram: 48, tier: 2, patterns: [/\bw7900\b/i] },
  { id: 'w7800', name: 'Radeon PRO W7800', vendor: 'AMD', vram: 32, tier: 2, patterns: [/\bw7800\b/i] },
  { id: 'w7700', name: 'Radeon PRO W7700', vendor: 'AMD', vram: 16, tier: 3, patterns: [/\bw7700\b/i] },
  { id: 'w7600', name: 'Radeon PRO W7600', vendor: 'AMD', vram: 8, tier: 3, patterns: [/\bw7600\b/i] },

  // Intel Arc
  { id: 'arcb580', name: 'Arc B580', vendor: 'Intel', vram: 12, tier: 3, patterns: [/\barc\s*b580\b/i] },
  { id: 'arcb570', name: 'Arc B570', vendor: 'Intel', vram: 10, tier: 3, patterns: [/\barc\s*b570\b/i] },
  { id: 'arcprob70', name: 'Arc Pro B70', vendor: 'Intel', vram: 32, tier: 2, patterns: [/\barc\s*pro\s*b70\b/i] }
];

/**
 * Add-in-board partners — the "brand" a shopper actually buys.
 *
 * `patterns` are the vendor's own name; `series` are product-line names.
 * They are kept apart because series words collide across vendors: "GAMING OC"
 * is a Gigabyte line but also appears inside Sapphire and PowerColor names, so
 * a series match must never outrank an explicit brand name.
 */
const AIB_BRANDS = [
  { id: 'asus', name: 'ASUS', patterns: [/\basus\b/i], series: [/\brog\s*strix\b/i, /\btuf\s*gaming\b/i, /\bproart\b/i, /\bastral\b/i] },
  { id: 'msi', name: 'MSI', patterns: [/\bmsi\b/i], series: [/\bsuprim\b/i, /\bventus\b/i, /\bgaming\s*trio\b/i, /\bshadow\s*[23]x\b/i] },
  { id: 'gigabyte', name: 'Gigabyte', patterns: [/\bgigabyte\b/i], series: [/\baorus\b/i, /\bwindforce\b/i, /\beagle\b/i] },
  { id: 'zotac', name: 'Zotac', patterns: [/\bzotac\b/i], series: [/\btwin\s*edge\b/i, /\btrinity\b/i, /\bamp\s*extreme\b/i, /\bsolo\b/i] },
  { id: 'palit', name: 'Palit', patterns: [/\bpalit\b/i], series: [/\bgamerock\b/i, /\bgamingpro\b/i] },
  { id: 'gainward', name: 'Gainward', patterns: [/\bgainward\b/i], series: [/\bphantom\b/i, /\bphoenix\b/i, /\bghost\b/i] },
  { id: 'inno3d', name: 'INNO3D', patterns: [/\binno\s*3d\b/i], series: [/\bichill\b/i] },
  { id: 'colorful', name: 'Colorful', patterns: [/\bcolorful\b/i], series: [/\bigame\b/i] },
  { id: 'galax', name: 'GALAX / KFA2', patterns: [/\bgalax\b/i, /\bkfa2\b/i], series: [/\bhof\b/i] },
  { id: 'pny', name: 'PNY', patterns: [/\bpny\b/i], series: [/\bxlr8\b/i] },
  { id: 'sapphire', name: 'Sapphire', patterns: [/\bsapph?ire\b/i], series: [/\bnitro\+?\b/i, /\bpulse\b/i] },
  { id: 'powercolor', name: 'PowerColor', patterns: [/\bpower\s*color\b/i], series: [/\bred\s*devil\b/i, /\bhellhound\b/i, /\bfighter\b/i, /\breaper\b/i] },
  { id: 'xfx', name: 'XFX', patterns: [/\bxfx\b/i], series: [/\bmercury\b/i, /\bswift\b/i, /\bspeedster\b/i, /\bquicksilver\b/i] },
  { id: 'asrock', name: 'ASRock', patterns: [/\basrock\b/i], series: [/\bsteel\s*legend\b/i, /\bphantom\s*gaming\b/i, /\btaichi\b/i, /\bchallenger\b/i] },
  { id: 'sparkle', name: 'Sparkle', patterns: [/\bsparkle\b/i], series: [/\bguardian\b/i, /\btitan\s*oc\b/i] },
  { id: 'acer', name: 'Acer Predator', patterns: [/\bacer\b/i], series: [/\bbifrost\b/i, /\bpredator\b/i] },
  { id: 'nvidia', name: 'NVIDIA Founders', patterns: [/\bfounders\s*edition\b/i, /\bnvidia\s*fe\b/i], series: [] },
  { id: 'amd', name: 'AMD Reference', patterns: [/\bamd\s*reference\b/i], series: [] },
  { id: 'manli', name: 'Manli', patterns: [/\bmanli\b/i], series: [] },
  { id: 'maxsun', name: 'Maxsun', patterns: [/\bmaxsun\b/i], series: [] },
  { id: 'peladn', name: 'PELADN', patterns: [/\bpeladn\b/i], series: [] },
  { id: 'leadtek', name: 'Leadtek', patterns: [/\bleadtek\b/i], series: [] },
  { id: 'biostar', name: 'Biostar', patterns: [/\bbiostar\b/i], series: [] }
];

const MODEL_BY_ID = new Map(GPU_MODELS.map((m) => [m.id, m]));

/** Longest-name-first so "RTX 5070 Ti" wins over "RTX 5070". */
const ORDERED_MODELS = [...GPU_MODELS].sort((a, b) => b.name.length - a.name.length);

function detectModel(text) {
  if (!text) return null;
  for (const m of ORDERED_MODELS) {
    for (const p of m.patterns) if (p.test(text)) return m;
  }
  return null;
}

/** Board partner: explicit brand names first, product-line names only after. */
function detectAib(text) {
  if (!text) return null;
  for (const b of AIB_BRANDS) {
    for (const p of b.patterns) if (p.test(text)) return b;
  }
  for (const b of AIB_BRANDS) {
    for (const p of b.series) if (p.test(text)) return b;
  }
  return null;
}

const PLAUSIBLE_VRAM = [4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 96];

/** Explicit VRAM in the title: "16GB GDDR7", "GDDR6 8GB", or a bare "16G". */
function detectStatedVram(text) {
  const m =
    text.match(/(\d{1,3})\s*gb?\s*(?:gddr\d?x?|hbm\d?|vram|memory)/i) ||
    text.match(/(?:gddr\d?x?|hbm\d?)\s*(\d{1,3})\s*gb?\b/i) ||
    text.match(/(?:^|[^a-z0-9])(\d{1,3})\s*gb(?![a-z0-9])/i) ||
    text.match(/(?:^|[^a-z0-9])(\d{1,3})g(?![a-z0-9])/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return PLAUSIBLE_VRAM.includes(v) ? v : null;
}

/**
 * Things a listing must not be. A model number in the title is not enough:
 * water blocks, brackets and cables all name the cards they fit, and a
 * prebuilt PC names the card inside it.
 */
const NOT_A_CARD = [
  /\b(laptop|notebook|mobile|prebuilt|barebone|mini\s*pc|all[\s-]in[\s-]one)\b/i,
  /\b(desktop|gaming|workstation)\s+pc\b/i,
  /\bpc\s+set\b/i,
  /water\s*block|waterblock|water\s*cool/i,
  /back\s*plate|backplate/i,
  /\b(support|holder|bracket|stand|mount|anti[\s-]?sag)\b/i,
  /\briser\b|extension\s*cable|pcie\s*cable|power\s*cable/i,
  /thermal\s*(pad|paste)/i,
  /\bcooler\b|fan\s*replacement/i,
  /\bmodding\b|\bshroud\b|\bsleeve\b/i,
  /hydro\s*x|icue\s*link/i,
  /\bcase\b|\bpsu\b|power\s*supply/i
];

function isNotACard(text) {
  return NOT_A_CARD.some((re) => re.test(text));
}

/**
 * Parses a GPU listing title. Returns null when the title is not a graphics
 * card we track, or when it cannot name one card at one price.
 */
function parseGpuTitle(rawTitle, vendorHint) {
  const title = String(rawTitle || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;|&ndash;/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (isNotACard(title)) return null;

  const model = detectModel(title);
  if (!model) return null;

  // "8GB / 16GB" in one title cannot describe one price.
  if (/(\d{1,3})\s*gb?\s*[/|]\s*(\d{1,3})\s*gb\b/i.test(title)) return null;

  const aib = detectAib(vendorHint ? `${vendorHint} ${title}` : title);
  const stated = detectStatedVram(title);

  // Trust the title only when it names a size the board actually ships in.
  let vram = model.vram;
  if (stated) {
    const allowed = model.vramVariants || [model.vram];
    if (allowed.includes(stated)) vram = stated;
  }

  return {
    title,
    category: 'gpu',
    modelId: model.id,
    modelName: model.name,
    vendor: model.vendor,
    modelTier: model.tier,
    vram,
    brandId: aib ? aib.id : null,
    brandName: aib ? aib.name : model.vendor,
    brandTier: aib ? 2 : 3,
    oc: /\boc\b|\boverclock/i.test(title)
  };
}

/** Cross-retailer key: same chip + same VRAM + same board partner. */
function gpuSpecKey(s) {
  if (!s.modelId) return null;
  return ['gpu', s.modelId, `${s.vram}gb`, s.brandId || 'x'].join('|');
}

function gpuLabel(s) {
  return `${s.modelName} · ${s.vram}GB`;
}

module.exports = { GPU_MODELS, AIB_BRANDS, MODEL_BY_ID, parseGpuTitle, gpuSpecKey, gpuLabel, detectModel, detectAib };
