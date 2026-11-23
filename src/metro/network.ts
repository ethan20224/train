// Shared Meridian Deep network topology, line metadata & poetic station list.
// Single source of truth used by both P4-3 PSD transom displays and P4-5 live map wall.
// Pure (no three.js, no DOM).
import type { LineId } from './tracks';

export interface MetroLineNetwork {
  readonly id: LineId;
  readonly label: string;
  /** Ordered stations along track 0 travel direction (index 4 = Meridian Deep interchange). */
  readonly stations: readonly string[];
  readonly interchangeIndex: number;
  /** Terminus displayed for [track 0 (+axis), track 1 (-axis)]. */
  readonly termini: readonly [string, string];
}

/**
 * All 8 canonical names from the Meridian Deep specification appear as prominent stations/termini:
 * Vesper Falls, Halcyon, Hollow Bay, Ashgrove, Elsewhere, The Last Summer, Nowhere Junction, Meridian Deep.
 */
export const METRO_NETWORK: Record<LineId, MetroLineNetwork> = {
  meridian: {
    id: 'meridian',
    label: 'MERIDIAN',
    stations: [
      'Hollow Bay',
      'Stillwater',
      'Sunken Quay',
      'Pale Wharf',
      'Meridian Deep',
      'Glasshouse',
      'Low Tide',
      'Ochre Reach',
      'The Last Summer',
    ],
    interchangeIndex: 4,
    termini: ['The Last Summer', 'Hollow Bay'],
  },
  vesper: {
    id: 'vesper',
    label: 'VESPER',
    stations: [
      'Vesper Falls',
      'Mistwell',
      'Bell Foundry',
      'Cedar Lock',
      'Meridian Deep',
      'Lantern Row',
      'Driftwood',
      'Quiet Harbor',
      'Elsewhere',
    ],
    interchangeIndex: 4,
    termini: ['Elsewhere', 'Vesper Falls'],
  },
  halcyon: {
    id: 'halcyon',
    label: 'HALCYON',
    stations: [
      'Ashgrove',
      'Halcyon',
      'Alder Fen',
      'Vellum Gate',
      'Meridian Deep',
      'Chalk Steps',
      'Duskfield',
      'High Moor',
      'Nowhere Junction',
    ],
    interchangeIndex: 4,
    termini: ['Nowhere Junction', 'Ashgrove'],
  },
};

export const destinationOf = (line: LineId, track: 0 | 1): string => METRO_NETWORK[line].termini[track];
export const lineLabelOf = (line: LineId): string => METRO_NETWORK[line].label;
