/**
 * Registry of the official 2024 programme sources for the 13 federal parties.
 *
 * Every URL below was verified in the research note
 * `docs/research/programmes-partis.md` (branch `research/programmes-partis`,
 * verification date 16/07/2026). Channels follow the note's findings:
 * - `live`: origin serves automated clients (NationBuilder CDN, party CMS);
 * - `wayback`: origin is dead (Open Vld → « Anders. » rebranding), behind an
 *   anti-bot WAF (Ecolo, N-VA), or an EVOLVING web programme whose live version
 *   has drifted past the frozen 2024 ballot (PTB/PVDA, #58) — fetched from the
 *   Wayback Machine while keeping the canonical origin URL as provenance.
 * PTB/PVDA publish no PDF: their programme is a web index of per-chapter pages
 * (one unitary party, two language mirrors — both kept because citations must
 * stay verifiable in their original language). The live site crawled in 2026
 * has drifted from the 9 June 2024 programme (footer « © 2023-2026 », some
 * chapters cite 2025), so both are sourced from a mid-2024 Wayback capture near
 * the ballot — the frozen version the other 12 parties are all dated to (#58).
 */
import type { SnapshotSource } from '../snapshot/manifest.ts';

const NOTE = 'docs/research/programmes-partis.md (branch research/programmes-partis, 16/07/2026)';

export const PROGRAMME_SOURCES: SnapshotSource[] = [
  {
    id: 'ps-programme-2024',
    label: 'PS — Programme 2024 (PDF complet, 1220 p.)',
    originUrl:
      'https://assets.nationbuilder.com/psbe/pages/2953/attachments/original/1709026101/Programme_PS_2024.pdf',
    fetchUrl:
      'https://assets.nationbuilder.com/psbe/pages/2953/attachments/original/1709026101/Programme_PS_2024.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § PS`,
  },
  {
    id: 'mr-programme-2024',
    label: 'MR — Programme 2024 (PDF complet, 311 p.)',
    originUrl: 'https://www.mr.be/wp-content/uploads/2024/02/PROGRAMME-GEN-2024-1.pdf',
    fetchUrl: 'https://www.mr.be/wp-content/uploads/2024/02/PROGRAMME-GEN-2024-1.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § MR`,
  },
  {
    id: 'les-engages-programme-2024',
    label: 'Les Engagés — Programme 2024 (PDF complet, 355 p.)',
    originUrl:
      'https://www.lesengages.be/wp-content/uploads/2024/02/lesengages_programme2024_complet_2_v2.pdf',
    fetchUrl:
      'https://www.lesengages.be/wp-content/uploads/2024/02/lesengages_programme2024_complet_2_v2.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Les Engagés`,
  },
  {
    id: 'ecolo-programme-2024',
    label: 'Ecolo — Programme 2024 consolidé (PDF, 338 p.)',
    originUrl: 'https://ecolo.be/wp-content/uploads/2024/02/2024-Programme-consolide-final.pdf',
    fetchUrl:
      'https://web.archive.org/web/2024id_/https://ecolo.be/wp-content/uploads/2024/02/2024-Programme-consolide-final.pdf',
    channel: 'wayback',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Ecolo (site anti-bot, canal Wayback)`,
  },
  {
    id: 'ptb-programme-2024',
    label: 'PTB — Programme (index des chapitres web, pas de PDF national)',
    originUrl: 'https://www.ptb.be/programme',
    // Confirmed mid-2024 index capture near the 9 June 2024 ballot (#58). The
    // chapter pages are captured at OTHER instants — each is resolved per chapter
    // at crawl time (see wayback-availability.ts), not from this timestamp.
    fetchUrl: 'https://web.archive.org/web/20240618091111id_/https://www.ptb.be/programme',
    channel: 'wayback',
    mediaType: 'text/html',
    provenance: `${NOTE} — § PTB (programme web évolutif, gelé au scrutin via Wayback mi-2024, #58)`,
  },
  {
    id: 'defi-axe-1-2024',
    label: 'DéFI — Axe 1 : Remettre la Belgique en état de fonctionner (PDF, 44 p.)',
    originUrl: 'https://www.defi.be/wp-content/uploads/livret-axe-1-corr-0324-bd.pdf',
    fetchUrl: 'https://www.defi.be/wp-content/uploads/livret-axe-1-corr-0324-bd.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § DéFI`,
  },
  {
    id: 'defi-axe-2-2024',
    label: 'DéFI — Axe 2 : Laïcité politique (PDF, 28 p.)',
    originUrl: 'https://www.defi.be/wp-content/uploads/livret-axe-2-corr-0324-bd.pdf',
    fetchUrl: 'https://www.defi.be/wp-content/uploads/livret-axe-2-corr-0324-bd.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § DéFI`,
  },
  {
    id: 'defi-axe-3-2024',
    label: "DéFI — Axe 3 : Libérer l'esprit d'entreprendre (PDF, 36 p.)",
    originUrl: 'https://www.defi.be/wp-content/uploads/0523_livret_axe_3_bd.pdf',
    fetchUrl: 'https://www.defi.be/wp-content/uploads/0523_livret_axe_3_bd.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § DéFI`,
  },
  {
    id: 'defi-axe-4-2024',
    label: 'DéFI — Axe 4 : Rendre le contrat social plus juste (PDF, 84 p.)',
    originUrl: 'https://www.defi.be/wp-content/uploads/livret_axe-_4_corr2024_bd.pdf',
    fetchUrl: 'https://www.defi.be/wp-content/uploads/livret_axe-_4_corr2024_bd.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § DéFI`,
  },
  {
    id: 'defi-axe-5-2024',
    label: 'DéFI — Axe 5 : Développement durable, économie et libertés (PDF, 100 p.)',
    originUrl: 'https://www.defi.be/wp-content/uploads/0624_livret_axe_5_bd.pdf',
    fetchUrl: 'https://www.defi.be/wp-content/uploads/0624_livret_axe_5_bd.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § DéFI`,
  },
  {
    id: 'nva-programme-2024',
    label: 'N-VA — « Voor Vlaamse Welvaart » (PDF, 120 p.)',
    originUrl: 'https://www.n-va.be/sites/n-va.be/files/2024-04/Verkiezingsprogramma.pdf',
    fetchUrl:
      'https://web.archive.org/web/2024id_/https://www.n-va.be/sites/n-va.be/files/2024-04/Verkiezingsprogramma.pdf',
    channel: 'wayback',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § N-VA (site anti-bot, canal Wayback)`,
  },
  {
    id: 'vlaams-belang-programme-2024',
    label: 'Vlaams Belang — « Vlaanderen weer van ons » (PDF, 100 p.)',
    originUrl:
      'https://www.vlaamsbelang.org/sites/default/files/2024-03/202403_Verkiezingsprogramma_DEF_Web.pdf',
    fetchUrl:
      'https://www.vlaamsbelang.org/sites/default/files/2024-03/202403_Verkiezingsprogramma_DEF_Web.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Vlaams Belang`,
  },
  {
    id: 'vooruit-programme-2024',
    label: 'Vooruit — Verkiezingsprogramma 2024 (PDF, 288 p.)',
    originUrl:
      'https://assets.nationbuilder.com/vooruit/pages/11936/attachments/original/1709800485/Verkiezingsprogramma_2024.pdf',
    fetchUrl:
      'https://assets.nationbuilder.com/vooruit/pages/11936/attachments/original/1709800485/Verkiezingsprogramma_2024.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Vooruit`,
  },
  {
    id: 'cdv-programme-2024',
    label: 'CD&V — « Kies zekerheid » (PDF congrès 21/04/2024, 442 p.)',
    originUrl:
      'https://assets.nationbuilder.com/cdenv/pages/8534/attachments/original/1713685808/VKprog_vcongresapril.pdf',
    fetchUrl:
      'https://assets.nationbuilder.com/cdenv/pages/8534/attachments/original/1713685808/VKprog_vcongresapril.pdf',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § CD&V`,
  },
  {
    id: 'open-vld-partijprogramma-2024',
    label: 'Open Vld (→ Anders.) — Partijprogramma v1.0.9 (PDF, 156 p.)',
    originUrl:
      'https://assets.nationbuilder.com/openvld/pages/29787/attachments/original/1716445819/Partijprogramma_1.0.9.pdf',
    fetchUrl:
      'https://web.archive.org/web/20240530063900id_/https://assets.nationbuilder.com/openvld/pages/29787/attachments/original/1716445819/Partijprogramma_1.0.9.pdf',
    channel: 'wayback',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Open Vld (URLs d'origine mortes après le rebranding « Anders. »)`,
  },
  {
    id: 'open-vld-becijferd-groeiplan-2024',
    label: 'Open Vld (→ Anders.) — Becijferd groeiplan (PDF, 30 p.)',
    originUrl:
      'https://assets.nationbuilder.com/openvld/pages/29661/attachments/original/1711725852/Becijferd_groeiplan.pdf',
    fetchUrl:
      'https://web.archive.org/web/20240814083658id_/https://assets.nationbuilder.com/openvld/pages/29661/attachments/original/1711725852/Becijferd_groeiplan.pdf?1711725852',
    channel: 'wayback',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Open Vld (URLs d'origine mortes après le rebranding « Anders. »)`,
  },
  {
    id: 'groen-programme-2024',
    label: 'Groen — « Groen voor verandering » (PDF, 45 planches doubles)',
    originUrl:
      'https://assets.nationbuilder.com/groen/pages/16938/attachments/original/1710591090/Programma_Groen.pdf',
    fetchUrl:
      'https://assets.nationbuilder.com/groen/pages/16938/attachments/original/1710591090/Programma_Groen.pdf?1710591090=',
    channel: 'live',
    mediaType: 'application/pdf',
    provenance: `${NOTE} — § Groen`,
  },
  {
    id: 'pvda-programme-2024',
    label: 'PVDA — Programma (index des chapitres web, miroir NL du PTB)',
    originUrl: 'https://www.pvda.be/programma',
    // Confirmed mid-2024 index capture near the 9 June 2024 ballot (#58). The
    // chapter pages are captured at OTHER instants — each is resolved per chapter
    // at crawl time (see wayback-availability.ts), not from this timestamp.
    fetchUrl: 'https://web.archive.org/web/20240528161524id_/https://www.pvda.be/programma',
    channel: 'wayback',
    mediaType: 'text/html',
    provenance: `${NOTE} — § PVDA (parti unitaire PTB-PVDA, miroir NL, gelé au scrutin via Wayback mi-2024, #58)`,
  },
];
