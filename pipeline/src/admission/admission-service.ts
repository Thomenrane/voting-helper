/**
 * Orchestration du portail d'admission (#42) — du manifeste #21 au verdict.
 *
 * Pour un parti : pour chaque partie attendue, on regarde le manifeste #21 —
 * la source brute est-elle snapshotée (inventaire des parties) ? sa couche
 * texte dérivée est-elle disponible (pour l'auto-ID + la TOC) ou au moins son
 * nombre de pages attesté (quality.pages) ? On en tire les signaux, puis le
 * verdict conservateur via la logique pure.
 *
 * Le chargement de la couche texte est INJECTÉ (`LayerLoader`) pour que la
 * logique manifeste→signaux reste testable hors système de fichiers. Une
 * fabrique lisant réellement les octets attestés (avec vérification
 * d'intégrité #21) est fournie pour les commandes.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseTextLayer, type ProgrammeTextLayer } from '../extraction/text-layer.ts';
import {
  latestSnapshot,
  verifySnapshotIntegrity,
  type SnapshotEntry,
  type SnapshotManifest,
} from '../snapshot/manifest.ts';
import { sha256Hex } from '../snapshot/snapshot-store.ts';
import { buildPartyAdmissionInput, type DocumentSignals } from './evidence.ts';
import type { ExpectedIdentity } from './expected-identity.ts';
import { admitParty, type PartyAdmissionVerdict } from './verdict.ts';

/** Charge la couche texte d'un snapshot dérivé, ou `null` si indisponible. */
export type LayerLoader = (entry: SnapshotEntry) => Promise<ProgrammeTextLayer | null>;

export interface PartySignals {
  signals: DocumentSignals[];
  /** `source_id` bruts réellement attestés — l'inventaire des parties. */
  presentSourceIds: string[];
}

/** Rassemble les signaux d'admission d'un parti depuis le manifeste. */
export async function collectPartySignals(
  manifest: SnapshotManifest,
  expected: ExpectedIdentity,
  loadLayer: LayerLoader,
): Promise<PartySignals> {
  const signals: DocumentSignals[] = [];
  const presentSourceIds: string[] = [];
  for (const part of expected.parts) {
    if (latestSnapshot(manifest, part.source_id) !== undefined) {
      presentSourceIds.push(part.source_id);
    }
    const derived = latestSnapshot(manifest, `${part.source_id}-text`);
    let layer: ProgrammeTextLayer | null = null;
    let knownPages: number | null = null;
    if (derived !== undefined) {
      const pages = derived.quality?.['pages'];
      knownPages = typeof pages === 'number' ? pages : null;
      layer = await loadLayer(derived);
    }
    signals.push({ source_id: part.source_id, layer, knownPages });
  }
  return { signals, presentSourceIds };
}

/** Verdict d'admission d'un parti à partir du manifeste #21. */
export async function admitPartyFromManifest(
  manifest: SnapshotManifest,
  expected: ExpectedIdentity,
  loadLayer: LayerLoader,
): Promise<PartyAdmissionVerdict> {
  const { signals, presentSourceIds } = await collectPartySignals(manifest, expected, loadLayer);
  return admitParty(buildPartyAdmissionInput(expected, signals, presentSourceIds));
}

/**
 * Fabrique de `LayerLoader` lisant les octets attestés sur disque, vérifiés
 * contre l'empreinte committée (#21). Un fichier absent (binaires gitignorés,
 * clone frais) ou corrompu → `null` : l'auto-ID/TOC deviennent non évaluées et
 * le verdict reste conservateur, jamais faussement PASS.
 */
export function fileLayerLoader(repoRoot: string): LayerLoader {
  return async (entry: SnapshotEntry): Promise<ProgrammeTextLayer | null> => {
    const absPath = join(repoRoot, entry.file);
    if (!existsSync(absPath)) return null;
    const bytes = await readFile(absPath);
    try {
      verifySnapshotIntegrity(entry, sha256Hex(bytes));
    } catch {
      return null;
    }
    return parseTextLayer(bytes, entry.file);
  };
}
