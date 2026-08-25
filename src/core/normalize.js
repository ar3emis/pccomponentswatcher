'use strict';

const { parseTitle, specKey, specLabel } = require('./parse');
const { parseGpuTitle, gpuSpecKey, gpuLabel } = require('./gpu');

/** Kit capacities tracked for memory. */
const RAM_CAPACITIES = [16, 24, 32, 48, 64, 96, 128];

/** VRAM sizes tracked for graphics cards. */
const GPU_VRAM = [8, 10, 12, 16, 20, 24, 32, 48, 96];

/**
 * Turns one raw retailer item into a normalised listing row, or returns a
 * `{ reject }` reason. Which parser runs is decided by the source path's
 * category, with a fallback sniff so a RAM page containing a GPU (or the
 * reverse) still classifies correctly.
 */
function normalize(rawTitle, vendorHint, category, variantText) {
  if (category === 'gpu') {
    const g = parseGpuTitle(variantText ? `${rawTitle} ${variantText}` : rawTitle, vendorHint);
    if (!g) return { reject: 'not-a-tracked-gpu' };
    if (!GPU_VRAM.includes(g.vram)) return { reject: 'vram-out-of-range' };
    return {
      spec: {
        ...g,
        // Shared column names so one table can render both categories.
        memoryGB: g.vram,
        kitLabel: gpuLabel(g),
        specKey: gpuSpecKey(g),
        speed: null,
        cas: null,
        modules: null,
        moduleGB: null,
        formFactor: 'PCIe',
        generation: null,
        rgb: false
      }
    };
  }

  const s = parseTitle(rawTitle, vendorHint, variantText);
  if (s.generation !== 5) return { reject: 'not-ddr5' };
  // A listing offering several capacities under one price is unusable.
  if (s.ambiguous) return { reject: 'ambiguous-capacity' };
  if (s.isServer) return { reject: 'server-ecc' };
  if (!s.brandId) return { reject: 'unknown-brand' };
  if (!s.totalGB) return { reject: 'no-capacity' };
  if (!RAM_CAPACITIES.includes(s.totalGB)) return { reject: 'capacity-out-of-range' };

  return {
    spec: {
      ...s,
      memoryGB: s.totalGB,
      modelId: null,
      modelName: null,
      vendor: null,
      modelTier: null,
      vram: null,
      oc: false,
      kitLabel: specLabel(s),
      specKey: specKey(s)
    }
  };
}

module.exports = { normalize, RAM_CAPACITIES, GPU_VRAM };
