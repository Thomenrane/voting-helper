/**
 * Orchestration du portail d'admission (#42) — du manifeste #21 au verdict.
 *
 * Pour un parti : pour chaque partie attendue, on regarde le manifeste #21 —
 * la source brute est-elle snapshotée (inventaire des parties) ? Son binaire
 * brut est-il disponible localement pour MATÉRIALISER la couche texte (#46) —
 * la re-dériver depuis le snapshot épinglé, intégrité vérifiée par SHA-256
 * (#21) — et calculer le verdict sur la couche réelle ? À défaut, on retombe
 * sur le nombre de pages attesté au manifeste (quality.pages de la couche
 * dérivée). On en tire les signaux, puis le verdict via la logique pure.
 *
 * La matérialisation de la couche texte est INJECTÉE (`LayerLoader`) pour que
 * la logique manifeste→signaux reste testable hors système de fichiers et hors
 * réseau. Une fabrique lisant réellement les octets bruts attestés (avec
 * vérification d'intégrité #21, puis re-dérivation via `buildTextLayer`) est
 * fournie pour les commandes.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { materializeHtmlChapterLayer } from '../extraction/chapter-layer-store.ts';
import { buildTextLayer, type ProgrammeTextLayer } from '../extraction/text-layer.ts';
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

/**
 * Matérialise la couche texte d'UN snapshot BRUT (le PDF épinglé), ou `null`
 * quand le binaire est absent localement, corrompu, ou non-PDF (non
 * matérialisable). L'entrée reçue est le snapshot brut du parti (#46).
 */
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
    const raw = latestSnapshot(manifest, part.source_id);
    if (raw !== undefined) {
      presentSourceIds.push(part.source_id);
    }
    // Pages attestées au manifeste (couche dérivée #22) : repli quand le
    // binaire brut n'est pas matérialisable localement — la taille reste
    // évaluable sans dériver la couche.
    const derivedPages = latestSnapshot(manifest, `${part.source_id}-text`)?.quality?.['pages'];
    const knownPages = typeof derivedPages === 'number' ? derivedPages : null;
    // Matérialise la couche depuis le snapshot BRUT épinglé quand il est
    // présent localement (intégrité #21 vérifiée dans le loader).
    const layer = raw !== undefined ? await loadLayer(raw) : null;
    signals.push({
      source_id: part.source_id,
      layer,
      knownPages,
      // Empreinte et attestations de critère (#50) du snapshot épinglé : le
      // verdict n'honore une attestation que si son empreinte égale celle-ci.
      snapshotSha256: raw?.sha256 ?? null,
      attestations: raw?.criteria_attestations ?? [],
    });
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
 * Fabrique de `LayerLoader` qui MATÉRIALISE la couche texte du snapshot épinglé
 * sur disque (#46), jamais le réseau, jamais de clé. Deux sources matérialisées
 * dans la MÊME structure `ProgrammeTextLayer`, l'admission restant agnostique :
 * - PDF (#22) : lit les octets bruts, vérifie l'intégrité #21, re-dérive via
 *   `buildTextLayer` (unpdf) ;
 * - HTML des chapitres web (#51) : assemble la couche par chapitre depuis les
 *   snapshots de chapitres du manifeste (un chapitre = une page), chaque page
 *   ancrée au SHA-256 de son snapshot — d'où le `manifest` en fermeture.
 *
 * Retourne `null` — couche NON matérialisée, verdict conservateur, jamais
 * faussement PASS — quand le binaire est absent (gitignoré / clone frais / crawl
 * partiel), corrompu (empreinte #21 non concordante → HTML falsifié), ou d'un
 * type sans couche. Sans `manifest`, les sources HTML restent non matérialisées
 * (aucun inventaire de chapitres disponible) — le chemin PDF est inchangé.
 */
export function fileLayerLoader(repoRoot: string, manifest?: SnapshotManifest): LayerLoader {
  return async (entry: SnapshotEntry): Promise<ProgrammeTextLayer | null> => {
    if (entry.media_type === 'application/pdf') {
      const absPath = join(repoRoot, entry.file);
      if (!existsSync(absPath)) return null;
      const bytes = await readFile(absPath);
      try {
        verifySnapshotIntegrity(entry, sha256Hex(bytes));
      } catch {
        return null;
      }
      return buildTextLayer(entry.source_id, entry.sha256, bytes);
    }
    if (entry.media_type === 'text/html') {
      if (manifest === undefined) return null;
      return materializeHtmlChapterLayer(repoRoot, manifest, entry.source_id);
    }
    return null;
  };
}

/**
 * Date de génération DÉTERMINISTE du statut publié (#46) : la plus récente
 * `retrieved_at` du manifeste, en `YYYY-MM-DD`. Dérivée du snapshot épinglé et
 * non d'une horloge de build — régénérer sans nouvelle donnée reproduit le même
 * artefact. `''` pour un manifeste vide.
 */
export function manifestAsOfDate(manifest: SnapshotManifest): string {
  let latest = '';
  for (const entry of manifest.snapshots) {
    if (entry.retrieved_at > latest) latest = entry.retrieved_at;
  }
  return latest.slice(0, 10);
}
