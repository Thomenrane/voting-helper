/**
 * DONNÉES DE DÉMONSTRATION — profil de réponses fictif.
 * Utilisé par le tracer bullet (#16) pour calculer un classement d'exemple
 * tant que le wizard de questions n'existe pas.
 * s3 est volontairement « sans_opinion » pour démontrer l'exclusion.
 */
import type { UserAnswers } from '../schema.ts';

export const DEMO_ANSWERS: UserAnswers = {
  s1: 2,
  s2: 1,
  s3: 'sans_opinion',
  s4: -1,
  s5: 2,
  s6: 0,
  s7: 1,
  s8: -2,
};
