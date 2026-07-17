/**
 * Transparency page strings (#26) — the prose of /methodologie, /equilibre
 * and /changelog, keyed by locale like UI (ui.ts): same mechanism, separate
 * dictionary so the shared UI strings stay lean. The published methodology
 * text MUST stay in exact agreement with the tested engine
 * (site/src/lib/scoring/scoring.ts) — change them together or not at all.
 *
 * NL texts are draft quality pending native review (#7) — the site-wide
 * draft banner covers these pages too.
 */
import type { ChangelogEntryKind } from '@voting-helper/data';
import type { Locale } from './locales.ts';

/** One prose section: a heading and its paragraphs. */
interface Section {
  heading: string;
  body: readonly string[];
}

/** One rule of the statement writing guide. */
interface WritingRule {
  name: string;
  description: string;
}

interface MethodologyStrings {
  pageTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  twoScores: Section;
  scale: Section;
  formula: {
    heading: string;
    intro: string;
    /** The formula itself, displayed as a block. */
    formulaLine: string;
    /** Numbered computation steps — precise enough to reimplement. */
    steps: readonly string[];
    exclusionsHeading: string;
    exclusions: readonly string[];
    exampleHeading: string;
    example: string;
  };
  ecart: Section;
  contradiction: Section;
  votesSelection: Section & { repoLinkLabel: string };
  writingGuide: {
    heading: string;
    intro: string;
    rules: readonly WritingRule[];
  };
  cadence: Section;
  versioning: Section;
}

interface BalanceStrings {
  pageTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  coverageHeading: string;
  coverageIntro: string;
  partyColumn: string;
  programmeColumn: string;
  votesStatementsColumn: string;
  linkedVotesColumn: string;
  /** e.g. « 8 / 8 » — screen-reader-friendly ratio. */
  ratio: (documented: number, total: number) => string;
  distributionHeading: string;
  distributionIntro: string;
  pourLabel: string;
  neutreLabel: string;
  contreLabel: string;
  nonDocumenteLabel: string;
  /** e.g. « 4 partis » for a distribution segment count. */
  partyCount: (count: number) => string;
}

interface ChangelogStrings {
  pageTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  kindLabels: Record<ChangelogEntryKind, string>;
  proofLinkLabel: string;
  emptyNotice: string;
}

export interface TransparencyStrings {
  methodology: MethodologyStrings;
  balance: BalanceStrings;
  changelog: ChangelogStrings;
}

export const TRANSPARENCY: Record<Locale, TransparencyStrings> = {
  fr: {
    methodology: {
      pageTitle: 'Méthodologie — test électoral fédéral',
      metaDescription:
        'La formule complète des deux scores, les critères de sélection des votes, le guide de rédaction des énoncés et la cadence des mises à jour.',
      heading: 'Méthodologie',
      intro:
        'Tout ce qu’il faut pour vérifier le test — ou le réécrire vous-même : la formule exacte des deux scores, les critères de liaison des votes, les règles de rédaction des énoncés et le rythme des mises à jour.',
      twoScores: {
        heading: 'Deux scores, jamais fusionnés',
        body: [
          'Chaque parti reçoit deux scores calculés séparément : « promesses » mesure votre alignement sur son programme officiel de 2024, « actes » votre alignement sur les votes nominatifs de son groupe à la Chambre. Les deux scores ne sont jamais combinés en un chiffre unique — l’écart entre les deux est précisément ce que le test veut montrer.',
        ],
      },
      scale: {
        heading: 'L’échelle et le sens des votes',
        body: [
          'Vous répondez à chaque énoncé sur une échelle à 5 degrés : tout à fait d’accord (+2), plutôt d’accord (+1), neutre (0), plutôt contre (−1), tout à fait contre (−2). « Sans opinion » n’est pas un degré : l’énoncé est alors retiré de votre calcul, pour les deux scores.',
          'Les positions de programme des partis sont codées sur la même échelle de −2 à +2, chacune adossée à une citation exacte du programme. Les votes sont traduits par rapport au sens de l’énoncé : un vote « oui » vaut +2, une abstention 0, un vote « non » −2. Quand plusieurs votes sont liés au même énoncé, leur moyenne est utilisée — elle peut donc être fractionnaire.',
        ],
      },
      formula: {
        heading: 'La formule',
        intro:
          'Chaque score est une distance moyenne inversée : plus vos réponses sont proches des positions du parti, plus le score approche 100. Précisément, pour chaque dimension (promesses ou actes) :',
        formulaLine: 'score = 100 × (1 − moyenne des distances normalisées), arrondi à l’entier le plus proche',
        steps: [
          'Pour chaque énoncé retenu, la distance est |votre réponse − position du parti| — l’écart absolu sur l’échelle, dit « city-block », au maximum 4 (de +2 à −2).',
          'Cette distance est normalisée en la divisant par 4, donc ramenée entre 0 et 1.',
          'La moyenne des distances normalisées est prise sur les seuls énoncés retenus pour cette dimension — le dénominateur affiché à côté de chaque score (« basé sur 7/8 énoncés »).',
          'Le score vaut 100 × (1 − cette moyenne), arrondi à l’entier le plus proche.',
          'Si aucun énoncé n’est retenu, le score est « n.d. » (non disponible) — jamais 0 : ne rien pouvoir mesurer n’est pas un désaccord total.',
        ],
        exclusionsHeading: 'Ce qui est exclu — jamais compté comme neutre',
        exclusions: [
          '« Sans opinion » (ou une question non répondue) exclut l’énoncé de vos deux scores.',
          'Un parti sans position de programme documentée sur un énoncé voit cet énoncé exclu de son score promesses — le silence est affiché, jamais imputé.',
          'Un énoncé sans aucun vote lié est exclu du score actes du parti.',
          'Seuls les enregistrements validés en relecture humaine entrent dans le calcul ; deux enregistrements validés pour le même couple parti × énoncé sont refusés comme donnée incohérente.',
        ],
        exampleHeading: 'Exemple',
        example:
          'Vous répondez +1 et le programme du parti dit −2 : distance 3, normalisée 0,75. Sur un second énoncé, distance normalisée 0,25. Moyenne : 0,5 — score promesses : 100 × (1 − 0,5) = 50, basé sur 2 énoncés.',
      },
      ecart: {
        heading: 'L’écart promesses / actes',
        body: [
          'L’écart d’un parti est la différence entre ses deux scores affichés (arrondis) : promesses − actes. Quand les deux scores existent et que l’écart atteint 15 points en valeur absolue, il est signalé comme « écart marquant » — c’est le seuil au-delà duquel la divergence entre discours et votes est mise en évidence dans le classement.',
        ],
      },
      contradiction: {
        heading: 'Le badge « promesse vs vote »',
        body: [
          'Sur un énoncé donné, un parti est signalé en contradiction quand sa position de programme et la position issue de ses votes sont de signes opposés, chacune d’au moins un degré (l’une ≥ +1 et l’autre ≤ −1). Ce badge dépend uniquement des données du parti — pas de vos réponses — et les deux preuves (citation et votes) sont affichées côte à côte pour que vous constatiez la contradiction vous-même.',
        ],
      },
      votesSelection: {
        heading: 'Quels votes sont liés aux énoncés',
        body: [
          'Seuls comptent les votes nominatifs en séance plénière de la Chambre portant sur le vote final d’un texte ou sur un amendement portant directement sur la mesure de l’énoncé. Les votes de procédure sont exclus. Chaque liaison est justifiée en une phrase et validée en relecture ; un énoncé sans vote lié est exclu du score actes — jamais compté comme neutre.',
          'Les critères complets de liaison sont publiés dans le dépôt du projet (docs/methodologie/criteres-liaison-votes.md).',
        ],
        repoLinkLabel: 'Dépôt du projet',
      },
      writingGuide: {
        heading: 'Comment les énoncés sont rédigés',
        intro: 'Chaque énoncé doit respecter quatre règles, vérifiées en relecture :',
        rules: [
          {
            name: 'Discriminant',
            description:
              'l’énoncé sépare réellement les partis. Un énoncé sur lequel tout le monde est d’accord n’apprend rien — la page Équilibre publie la distribution des positions pour le vérifier.',
          },
          {
            name: 'Une phrase simple',
            description:
              'une seule mesure, formulée en une phrase sans jargon ; la mesure concrète chiffrée est donnée en note sous l’énoncé.',
          },
          {
            name: 'Traçable',
            description:
              'la mesure se retrouve telle quelle dans les programmes et dans les textes votés à la Chambre — sinon aucune preuve ne peut être citée.',
          },
          {
            name: 'Neutre',
            description:
              'formulation sans mot orienté ni présupposé, avec une équivalence stricte entre les versions française et néerlandaise.',
          },
        ],
      },
      cadence: {
        heading: 'Cadence des mises à jour',
        body: [
          'Le pipeline de données tourne une fois par mois : il produit des propositions de positions et de liaisons de votes, soumises en relecture humaine — rien n’atteint le site sans validation. En période électorale, la cadence passe à une fois par semaine.',
          'Chaque mise à jour publiée est consignée dans le changelog public, avec un lien vers la preuve.',
        ],
      },
      versioning: {
        heading: 'Versionnage',
        body: [
          'Deux versions sont affichées sous chaque résultat : la version de la méthodologie (ce document — elle ne change que si la formule change) et la date des données (dernière révision publiée). Un résultat partagé reste ainsi interprétable après une mise à jour : il dit avec quelle formule et quelles données il a été calculé.',
        ],
      },
    },
    balance: {
      pageTitle: 'Équilibre — test électoral fédéral',
      metaDescription:
        'Les chiffres de neutralité du test, générés automatiquement depuis les données : couverture par parti, distribution des positions par énoncé, votes liés.',
      heading: 'Équilibre',
      intro:
        'Cette page est générée à chaque publication depuis les mêmes données que le test — aucun chiffre n’est saisi à la main. Elle permet de juger la neutralité du jeu de données sans lire le code.',
      coverageHeading: 'Couverture par parti',
      coverageIntro:
        'Pour chaque parti : le nombre d’énoncés où une position de programme est documentée, le nombre d’énoncés couverts par au moins un vote lié, et le total de votes liés. Une couverture déséquilibrée entre partis fausserait la comparaison.',
      partyColumn: 'Parti',
      programmeColumn: 'Positions programme',
      votesStatementsColumn: 'Énoncés avec votes',
      linkedVotesColumn: 'Votes liés',
      ratio: (documented, total) => `${documented} / ${total}`,
      distributionHeading: 'Distribution des positions par énoncé',
      distributionIntro:
        'Répartition des positions de programme documentées sur chaque énoncé. Un bon énoncé discrimine : des partis des deux côtés. Un énoncé où tout le monde est du même côté n’apprend rien — cette page le rend visible.',
      pourLabel: 'Pour',
      neutreLabel: 'Neutre',
      contreLabel: 'Contre',
      nonDocumenteLabel: 'Non documenté',
      partyCount: (count) => (count === 1 ? '1 parti' : `${count} partis`),
    },
    changelog: {
      pageTitle: 'Changelog — test électoral fédéral',
      metaDescription:
        'L’historique public des données du test : positions ajoutées ou modifiées, votes liés, sources — chaque entrée avec sa preuve.',
      heading: 'Changelog',
      intro:
        'Chaque publication de données est consignée ici : quoi, quand, et le lien vers la preuve (la contribution publique correspondante). La liste est générée depuis un fichier structuré versionné dans le dépôt, alimenté à chaque intégration de données.',
      kindLabels: {
        positions: 'Positions',
        votes: 'Votes liés',
        sources: 'Sources',
        methodologie: 'Méthodologie',
      },
      proofLinkLabel: 'Preuve',
      emptyNotice: 'Aucune entrée pour le moment.',
    },
  },
  nl: {
    methodology: {
      pageTitle: 'Methodologie — federale stemtest',
      metaDescription:
        'De volledige formule van de twee scores, de selectiecriteria voor stemmingen, de redactiegids voor stellingen en het updateritme.',
      heading: 'Methodologie',
      intro:
        'Alles om de test te controleren — of zelf te herschrijven: de exacte formule van de twee scores, de koppelingscriteria voor stemmingen, de redactieregels voor stellingen en het ritme van de updates.',
      twoScores: {
        heading: 'Twee scores, nooit samengevoegd',
        body: [
          'Elke partij krijgt twee apart berekende scores: « beloften » meet uw overeenstemming met haar officiële programma van 2024, « daden » uw overeenstemming met de hoofdelijke stemmingen van haar fractie in de Kamer. De twee scores worden nooit tot één cijfer gecombineerd — de kloof ertussen is precies wat de test wil tonen.',
        ],
      },
      scale: {
        heading: 'De schaal en de richting van de stemmingen',
        body: [
          'U beantwoordt elke stelling op een schaal met 5 graden: helemaal akkoord (+2), eerder akkoord (+1), neutraal (0), eerder tegen (−1), helemaal tegen (−2). « Geen mening » is geen graad: de stelling wordt dan uit uw berekening verwijderd, voor beide scores.',
          'De programmastandpunten van de partijen worden op dezelfde schaal van −2 tot +2 gecodeerd, elk gestaafd met een exact citaat uit het programma. Stemmingen worden vertaald ten opzichte van de richting van de stelling: een « ja »-stem telt als +2, een onthouding als 0, een « nee »-stem als −2. Zijn meerdere stemmingen aan dezelfde stelling gekoppeld, dan wordt hun gemiddelde gebruikt — dat kan dus een breukgetal zijn.',
        ],
      },
      formula: {
        heading: 'De formule',
        intro:
          'Elke score is een omgekeerde gemiddelde afstand: hoe dichter uw antwoorden bij de standpunten van de partij liggen, hoe dichter de score bij 100 komt. Precies, per dimensie (beloften of daden):',
        formulaLine:
          'score = 100 × (1 − gemiddelde van de genormaliseerde afstanden), afgerond op het dichtstbijzijnde gehele getal',
        steps: [
          'Voor elke weerhouden stelling is de afstand |uw antwoord − standpunt van de partij| — het absolute verschil op de schaal (« city-block »), maximaal 4 (van +2 tot −2).',
          'Die afstand wordt genormaliseerd door te delen door 4, dus herleid tot een waarde tussen 0 en 1.',
          'Het gemiddelde van de genormaliseerde afstanden wordt genomen over enkel de weerhouden stellingen voor die dimensie — de noemer die naast elke score staat (« op basis van 7/8 stellingen »).',
          'De score is 100 × (1 − dat gemiddelde), afgerond op het dichtstbijzijnde gehele getal.',
          'Wordt geen enkele stelling weerhouden, dan is de score « n.b. » (niet beschikbaar) — nooit 0: niets kunnen meten is geen totale onenigheid.',
        ],
        exclusionsHeading: 'Wat wordt uitgesloten — nooit als neutraal geteld',
        exclusions: [
          '« Geen mening » (of een onbeantwoorde vraag) sluit de stelling uit van uw beide scores.',
          'Een partij zonder gedocumenteerd programmastandpunt over een stelling ziet die stelling uitgesloten van haar score beloften — de stilte wordt getoond, nooit ingevuld.',
          'Een stelling zonder enige gekoppelde stemming wordt uitgesloten van de score daden van de partij.',
          'Alleen records die door menselijke review zijn gevalideerd tellen mee; twee gevalideerde records voor hetzelfde paar partij × stelling worden geweigerd als inconsistente data.',
        ],
        exampleHeading: 'Voorbeeld',
        example:
          'U antwoordt +1 en het programma van de partij zegt −2: afstand 3, genormaliseerd 0,75. Op een tweede stelling: genormaliseerde afstand 0,25. Gemiddelde: 0,5 — score beloften: 100 × (1 − 0,5) = 50, op basis van 2 stellingen.',
      },
      ecart: {
        heading: 'De kloof beloften / daden',
        body: [
          'De kloof van een partij is het verschil tussen haar twee getoonde (afgeronde) scores: beloften − daden. Wanneer beide scores bestaan en de kloof in absolute waarde 15 punten bereikt, wordt ze gemarkeerd als « opvallende kloof » — de drempel waarboven de afwijking tussen discours en stemgedrag in het klassement wordt uitgelicht.',
        ],
      },
      contradiction: {
        heading: 'De badge « belofte vs stem »',
        body: [
          'Op een gegeven stelling wordt een partij als tegenstrijdig gemarkeerd wanneer haar programmastandpunt en het standpunt uit haar stemmingen tegengestelde tekens hebben, elk van minstens één graad (het ene ≥ +1 en het andere ≤ −1). Deze badge hangt alleen af van de gegevens van de partij — niet van uw antwoorden — en beide bewijzen (citaat en stemmingen) staan naast elkaar zodat u de tegenstrijdigheid zelf kunt vaststellen.',
        ],
      },
      votesSelection: {
        heading: 'Welke stemmingen aan stellingen worden gekoppeld',
        body: [
          'Alleen hoofdelijke stemmingen in de plenaire vergadering van de Kamer tellen mee, over de eindstemming van een tekst of over een amendement dat rechtstreeks de maatregel van de stelling betreft. Procedurele stemmingen zijn uitgesloten. Elke koppeling wordt in één zin verantwoord en in review gevalideerd; een stelling zonder gekoppelde stemming wordt uitgesloten van de score daden — nooit als neutraal geteld.',
          'De volledige koppelingscriteria staan gepubliceerd in de repository van het project (docs/methodologie/criteres-liaison-votes.md).',
        ],
        repoLinkLabel: 'Repository van het project',
      },
      writingGuide: {
        heading: 'Hoe de stellingen worden geschreven',
        intro: 'Elke stelling moet vier regels naleven, gecontroleerd in review:',
        rules: [
          {
            name: 'Onderscheidend',
            description:
              'de stelling maakt echt een onderscheid tussen de partijen. Een stelling waarover iedereen akkoord gaat leert niets — de pagina Evenwicht publiceert de verdeling van de standpunten om dat te controleren.',
          },
          {
            name: 'Eén eenvoudige zin',
            description:
              'één maatregel, geformuleerd in één zin zonder jargon; de concrete becijferde maatregel staat in een noot onder de stelling.',
          },
          {
            name: 'Traceerbaar',
            description:
              'de maatregel is als dusdanig terug te vinden in de programma’s en in de teksten gestemd in de Kamer — anders kan geen bewijs worden geciteerd.',
          },
          {
            name: 'Neutraal',
            description:
              'formulering zonder geladen woorden of vooronderstellingen, met een strikte gelijkwaardigheid tussen de Franse en de Nederlandse versie.',
          },
        ],
      },
      cadence: {
        heading: 'Ritme van de updates',
        body: [
          'De datapipeline draait één keer per maand: hij stelt standpunten en stemkoppelingen voor, die door menselijke review gaan — niets bereikt de site zonder validatie. In verkiezingsperiodes wordt het ritme wekelijks.',
          'Elke gepubliceerde update wordt vastgelegd in de publieke changelog, met een link naar het bewijs.',
        ],
      },
      versioning: {
        heading: 'Versienummering',
        body: [
          'Onder elk resultaat staan twee versies: de versie van de methodologie (dit document — ze verandert alleen als de formule verandert) en de datum van de gegevens (laatst gepubliceerde herziening). Een gedeeld resultaat blijft zo interpreteerbaar na een update: het zegt met welke formule en welke gegevens het werd berekend.',
        ],
      },
    },
    balance: {
      pageTitle: 'Evenwicht — federale stemtest',
      metaDescription:
        'De neutraliteitscijfers van de test, automatisch gegenereerd uit de gegevens: dekking per partij, verdeling van de standpunten per stelling, gekoppelde stemmingen.',
      heading: 'Evenwicht',
      intro:
        'Deze pagina wordt bij elke publicatie gegenereerd uit dezelfde gegevens als de test — geen enkel cijfer wordt met de hand ingevoerd. Ze laat toe de neutraliteit van de dataset te beoordelen zonder de code te lezen.',
      coverageHeading: 'Dekking per partij',
      coverageIntro:
        'Per partij: het aantal stellingen met een gedocumenteerd programmastandpunt, het aantal stellingen gedekt door minstens één gekoppelde stemming, en het totale aantal gekoppelde stemmingen. Een onevenwichtige dekking tussen partijen zou de vergelijking vertekenen.',
      partyColumn: 'Partij',
      programmeColumn: 'Programmastandpunten',
      votesStatementsColumn: 'Stellingen met stemmingen',
      linkedVotesColumn: 'Gekoppelde stemmingen',
      ratio: (documented, total) => `${documented} / ${total}`,
      distributionHeading: 'Verdeling van de standpunten per stelling',
      distributionIntro:
        'Verdeling van de gedocumenteerde programmastandpunten per stelling. Een goede stelling maakt onderscheid: partijen aan beide kanten. Een stelling waar iedereen aan dezelfde kant staat leert niets — deze pagina maakt dat zichtbaar.',
      pourLabel: 'Voor',
      neutreLabel: 'Neutraal',
      contreLabel: 'Tegen',
      nonDocumenteLabel: 'Niet gedocumenteerd',
      partyCount: (count) => (count === 1 ? '1 partij' : `${count} partijen`),
    },
    changelog: {
      pageTitle: 'Changelog — federale stemtest',
      metaDescription:
        'De publieke geschiedenis van de testgegevens: toegevoegde of gewijzigde standpunten, gekoppelde stemmingen, bronnen — elke vermelding met haar bewijs.',
      heading: 'Changelog',
      intro:
        'Elke datapublicatie wordt hier vastgelegd: wat, wanneer, en de link naar het bewijs (de overeenkomstige publieke bijdrage). De lijst wordt gegenereerd uit een gestructureerd, geversioneerd bestand in de repository, aangevuld bij elke data-integratie.',
      kindLabels: {
        positions: 'Standpunten',
        votes: 'Gekoppelde stemmingen',
        sources: 'Bronnen',
        methodologie: 'Methodologie',
      },
      proofLinkLabel: 'Bewijs',
      emptyNotice: 'Nog geen vermeldingen.',
    },
  },
};
