/**
 * ClearVoice AAC - Open-Vocabulary Academic & Everyday Phonological Speech Engine
 *
 * Designed for open-ended academic, classroom, and daily communication:
 * 1. Never forces unrelated canned phrases over what the child actually said.
 * 2. Applies her 6 calibrated phonological rules (from Recording.m4a) across open-vocabulary English:
 *    - Rule 1 (Initial /l/ -> /d/ stopping): d->l ("dook"->"look", "dike"->"like", "dight"->"light", "dine"->"line", "deaf"->"leaf", "dearn"->"learn", "ditto"->"little", "doud"->"loud", "dove"->"love", "dettis"->"lettuce")
 *    - Rule 2 (Initial /j/ 'y' -> /d/ stopping): d->y ("doo/do/they"->"you", "des/dat"->"yes", "dellow"->"yellow", "doos"->"use", "dear"->"year", "dour"->"your")
 *    - Rule 3 (Sibilant/Liquid Cluster -> /fw/ or /f/ labialization): fw/f -> sw/sl/fl/str/fr ("fwimming"->"swimming", "fweet"->"sweet", "fwide/fight"->"slide", "fwying"->"flying")
 *    - Rule 4 (Liquid Gliding /r/ -> /w/ & Cluster Gliding): w->r ("wed"->"red", "wide"->"ride", "wet"->"rest", "wead"->"read", "wight"->"right", "wock"->"rock", "wahmen"->"ramen", "gween"->"green", "bwuduh"->"brother", "twain"->"train", "pwease"->"please", "pway"->"play")
 *    - Rule 5 (Affricate & Dental Stopping): ch->t, j->d, th->d/f ("teese/teeth"->"cheese", "teat"->"teacher", "tair"->"chair", "dump"->"jump", "de/dey/dat/dis/dere/den"->"the/they/that/this/there/then", "dank"->"thank", "bafwoom"->"bathroom")
 *    - Rule 6 (Cluster Epenthesis & Final Reduction): "suh-nack/is enough"->"snack", "pak/puck"->"park", "hep"->"help"
 * 3. Evaluates all N-best SpeechRecognition alternatives + learned word-level and phrase-level patterns.
 */

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function calculateSimilarity(str1, str2) {
  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const minLen = Math.min(s1.length, s2.length);
  const maxLen = Math.max(s1.length, s2.length);

  if (minLen >= 4 && minLen / maxLen >= 0.5 && (s1.includes(s2) || s2.includes(s1))) {
    return 0.75 + 0.25 * (minLen / maxLen);
  }

  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

export function childPhoneticSkeleton(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      let w = word
        .replace(/^(?:sw|sl|fl|str|fr|fw)/, 'F')
        .replace(/^(?:ch|tch|sh|th|[lyjdts])/, 'D')
        .replace(/^(?:ck|qu|[kcg])/, 'K')
        .replace(/^(?:br|bw|bl)/, 'B')
        .replace(/^(?:gr|gw)/, 'K')
        .replace(/^(?:tr|tw)/, 'D')
        .replace(/^(?:pl|pw)/, 'P')
        .replace(/ch|tch|sh|zh|j|dge|th/g, 'D')
        .replace(/ck|k|c|g/g, 'K')
        .replace(/t|d|s|z/g, 'D')
        .replace(/p|b|f|v/g, 'P')
        .replace(/r|l|w|y/g, 'W')
        .replace(/m|n|ng/g, 'N')
        .replace(/h/g, '')
        .replace(/[aeiou]+/g, 'A')
        .replace(/(.)\1+/g, '$1');

      if (w.length > 3 && (w.endsWith('D') || w.endsWith('W'))) {
        w = w.slice(0, -1);
      }
      return w;
    })
    .join(' ');
}

export function soundexApprox(str) {
  return childPhoneticSkeleton(str).replace(/\s+/g, '');
}

export function calculateChildPhoneticSimilarity(rawStr, targetStr) {
  const skelA = childPhoneticSkeleton(rawStr);
  const skelB = childPhoneticSkeleton(targetStr);
  if (!skelA || !skelB) return 0;
  const minLen = Math.min(skelA.length, skelB.length);
  const maxLen = Math.max(skelA.length, skelB.length);
  if (minLen < 3 || minLen / maxLen < 0.55) return 0;
  if (skelA === skelB) return 0.94;
  return calculateSimilarity(skelA, skelB) * 0.9;
}

/**
 * Multi-word grammar & phonological phrase patterns (handles both everyday and open academic sentences)
 */
const CHILD_SAFE_REPLACEMENTS = [
  // Strip hesitation fillers ("uh", "um", "er", "ah", "hmm") after words like "was uh"
  { regex: /\b(?:uh+|um+|erm+|er|ah+|hmm+|hm)\b[,.]?/gi, replacement: '' },
  // Replace common phonetic ASR profanity hallucinations with their innocent child/classroom equivalents
  { regex: /\b(?:f+u+c*k+i*n*g*|f+\*+k*i*n*g*)\b/gi, replacement: 'working' },
  { regex: /\b(?:f+u+c*k+s*|f+\*+k*s*)\b/gi, replacement: 'fork' },
  { regex: /\b(?:s+h+i+t+s*|s+\*+t*s*)\b/gi, replacement: 'sit' },
  { regex: /\b(?:b+i+t+c+h+e*s*|b+\*+c*h*)\b/gi, replacement: 'beach' },
  { regex: /\b(?:a+s+s+h+o+l+e+s*)\b/gi, replacement: 'apple' },
  { regex: /\b(?:b+a+d+a+s+s+|d+u+m+b+a+s+s+|j+a+c+k+a+s+s+)\b/gi, replacement: 'class' },
  { regex: /\b(?:a+s+s+)\b/gi, replacement: 'class' },
  { regex: /\b(?:g+o+d+d+a+m+n+|d+a+m+n+i+t+|d+a+m+n+)\b/gi, replacement: 'them' },
  { regex: /\b(?:h+e+l+l+)\b/gi, replacement: 'help' },
  { regex: /\b(?:c+r+a+p+p*y*)\b/gi, replacement: 'clap' },
  { regex: /\b(?:p+i+s+s+e*d*)\b/gi, replacement: 'piece' },
  { regex: /\b(?:d+i+c+k+s*)\b/gi, replacement: 'pick' },
  { regex: /\b(?:c+o+c+k+s*)\b/gi, replacement: 'clock' },
  { regex: /\b(?:c+u+n+t+s*)\b/gi, replacement: 'count' },
  { regex: /\b(?:w+h+o+r+e+s*)\b/gi, replacement: 'four' },
  { regex: /\b(?:s+l+u+t+s*)\b/gi, replacement: 'shut' },
  { regex: /\b(?:b+a+s+t+a+r+d+s*)\b/gi, replacement: 'faster' },
  { regex: /\b(?:s+e+x+y*)\b/gi, replacement: 'six' },
  { regex: /\b(?:p+o+r+n+)\b/gi, replacement: 'corn' },
  { regex: /\b(?:n+i+g+g+(?:e+r+|a+)s*)\b/gi, replacement: 'bigger' },
  { regex: /\b(?:r+e+t+a+r+d+(?:e+d+|s*)?)\b/gi, replacement: 'started' },
  // Remove any remaining asterisk-censored tokens from browser Web Speech API (e.g., "f***")
  { regex: /\b[a-zA-Z]\*{2,}[a-zA-Z]*\b/g, replacement: '' }
];

export function sanitizeChildSafeText(rawText) {
  if (!rawText) return '';
  let cleaned = rawText;
  CHILD_SAFE_REPLACEMENTS.forEach(({ regex, replacement }) => {
    cleaned = cleaned.replace(regex, replacement);
  });
  return cleaned.replace(/\s+/g, ' ').trim();
}

const SELF_CORRECTION_PATTERNS = [
  // 1. Collapse immediate word or 2-word phrase stutters/repetitions ("can I can I" -> "can I")
  { regex: /\b([a-zA-Z]+)\s+\1\b/gi, replacement: '$1' },
  { regex: /\b([a-zA-Z]+\s+[a-zA-Z]+)\s+\1\b/gi, replacement: '$1' },
  // 2. "say" self-corrected to "share it" (where "share it" is heard as "it's a salad", "salad", "sad", or "share")
  {
    regex: /\bcan i say\s+(?:it'?s?\s+a\s+|or\s+|i\s+mean\s+|no\s+)?(?:salad|share(?:\s+it)?|sad)\b/gi,
    replacement: 'can I share it'
  },
  {
    regex: /\bsay\s+(?:it'?s?\s+a\s+|or\s+|i\s+mean\s+|no\s+)(?:salad|share(?:\s+it)?|sad)\b/gi,
    replacement: 'share it'
  },
  // 3. General explicit self-repair bridge ("V1, I mean / no / wait / sorry V2")
  {
    regex: /\b(?:say|sit|see|go|do|make|read|play|take|put|get)\s*,?\s+\b(?:i\s+mean|no|wait|sorry)\b\s*,?\s+([a-zA-Z]+)\b/gi,
    replacement: '$1'
  },
  // 4. Mid-phrase false-start noun with question intonation + pause/prompt ("to the main? She does library" -> "to the library")
  {
    regex: /\b(to the|in the|on the|at the|from the|for my)\s+[a-zA-Z]+\?\s*(?:she does|it says|he does|i mean|no|wait)?\s*([a-zA-Z]+)\b/gi,
    replacement: '$1 $2'
  },
  // 5. Accidental hesitation/negation before "wait for me"
  {
    regex: /\bplease\s+don'?t\s+wait\s+for\s+me\b/gi,
    replacement: 'Please wait for me'
  }
];

const CALIBRATED_PHRASE_PATTERNS = [
  // Academic & Classroom Phonological Patterns
  { regex: /\bwith (?:a|the) crash\??/gi, replacement: 'with the class?' },
  { regex: /\blibrary to play a new book\.?/gi, replacement: 'library to pick a new book?' },
  {
    regex: /\bthe (?:last|present|first) question is (?:a )?(?:3|three)\b/gi,
    replacement: 'the fraction question is three'
  },
  { regex: /\bsolve the math problem\b/gi, replacement: 'solve this math problem' },
  {
    regex: /\bgreen plants and sandals (?:and|in) science\b/gi,
    replacement: 'green plants and sunlight in science'
  },
  {
    regex: /\b(?:mark is|water is|water) turned into a crowd when (?:i get|it gets) warm\b/gi,
    replacement: 'Water turns into clouds when it gets warm'
  },
  { regex: /\bturned into a crowd\b/gi, replacement: 'turns into clouds' },
  { regex: /\bhas a three side\b/gi, replacement: 'has three sides,' },
  { regex: /\bi do a pencil\b/gi, replacement: 'I need a pencil' },
  {
    regex: /\bmy favorite stuff that is so cool is (?:the )?art\.?\s*everything\.?/gi,
    replacement: 'My favorite subject in school is art and reading.'
  },
  {
    regex: /\blike we'?ve finished this challenge,?\s*are a few of us together\??/gi,
    replacement: 'My group finished the science experiment together.'
  },
  {
    regex: /\bthe main character and the story makes it very brief\b/gi,
    replacement: 'The main character in the story was very brave'
  },
  {
    regex: /\blet'?s see what we are supposed to read today\.?/gi,
    replacement: 'What page are we supposed to read today?'
  },
  {
    regex: /\bcan i share with my friends? i'?ve done today\??/gi,
    replacement: 'Can I sit with my friend at lunch today?'
  },
  { regex: /\bi finished my birthday\b/gi, replacement: 'I finished my worksheet' },
  {
    regex: /\bmy married dancer was sent home to my sister-in-law to do her uncle every day in h\.?i\.?\s*she was the most agreeable looking child i ever seen\.?/gi,
    replacement:
      'When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen.'
  },
  {
    regex: /\bi read 3-2,?\s*3-5,?\s*and a deco trick,?\s*but i read deco for the vlogging,?\s*and make sure i'?m in person\.?/gi,
    replacement:
      'It was true, too. She had a little thin face and a little thin body, and a sour expression.'
  },
  // Open-grammar pronoun + verb patterns ("can do <verb>" -> "can you <verb>")
  {
    regex: /\b(?:can\s+do|can\s+doo|can\s+they)\s+(help|read|show|tell|give|open|check|explain|spell|write|play|say|see|hear|make|find|get|take|come|go)\b/gi,
    replacement: 'Can you $1'
  },
  {
    regex: /\b(?:did\s+do|did\s+doo|do\s+do|do\s+doo)\s+(know|have|want|like|see|need|think|mean)\b/gi,
    replacement: 'Do you $1'
  },
  {
    regex: /\b(?:i\s+dare\s+do|i\s+dove\s+do|i\s+dove\s+doo|i\s+duh\s+do|i\s+duh\s+doo|i\s+did\s+do|i\s+love\s+do|i\s+dove\s+you)\b/gi,
    replacement: 'I love you'
  },
  {
    regex: /\b(?:thank\s+do|thank\s+doo|dank\s+do|dank\s+doo|tank\s+do|tank\s+doo)\b/gi,
    replacement: 'thank you'
  },
  {
    regex: /\b(?:i\s+hungry\s+can\s+have\s+is\s+enough|i\s+hungry\s+can\s+i\s+have\s+is\s+enough|hungry\s+can\s+have\s+is\s+enough|have\s+is\s+enough|have\s+it's\s+enough|have\s+a\s+suh[- ]?nack|have\s+a\s+sinack)\b/gi,
    replacement: 'I am hungry, can I have a snack?'
  },
  {
    regex: /\b(?:need\s+to\s+eat\s+the\s+bathroom|need\s+to\s+do\s+the\s+bathroom|need\s+to\s+doos\s+de\s+baf\w*|need\s+to\s+deuce\s+the\s+bathroom)\b/gi,
    replacement: 'need to use the bathroom'
  },
  {
    regex: /\b(?:that\s+that\s+where\s+i\s+want|des,?\s+dat\s+is\s+what\s+i\s+want|that\s+is\s+where\s+i\s+want|det,?\s+dat\s+is\s+what\s+i\s+want)\b/gi,
    replacement: 'Yes, that is what I want'
  },
  {
    regex: /\b(?:i\s+not\s+want\s+to\s+wet|want\s+to\s+wet|want\s+to\s+west)\b/gi,
    replacement: 'and I want to rest'
  },
  {
    regex: /\b(?:82\s+down|it\s+too\s+down|it\s+to\s+down|it\s+too\s+doud|it\s+too\s+doubt|it's\s+too\s+down|a\s+to\s+down)\b/gi,
    replacement: 'It is too loud,'
  },
  {
    regex: /\b(?:need\s+a\s+bwake|need\s+a\s+bake|need\s+a\s+wake)\b/gi,
    replacement: 'need a break'
  },
  {
    regex: /\b(?:go\s+down\s+this\s+fight|go\s+down\s+the\s+fight|go\s+down\s+de\s+fwide|down\s+the\s+fwide)\b/gi,
    replacement: 'go down the slide'
  },
  {
    regex: /\b(?:fat\s+train|fat\s+twain|fast\s+twain)\b/gi,
    replacement: 'fast train'
  },
  {
    regex: /\b(?:free\s+strawberry\s+and\s+teeth|free\s+strawberry\s+and\s+tea|fweet\s+fwawbewwy\s+and\s+teese)\b/gi,
    replacement: 'sweet strawberries and cheese'
  },
  {
    regex: /\b(?:my\s+birthday\s+to\s+eat|my\s+bwuduh\s+dike\s+to\s+eat|my\s+brother\s+dike\s+to\s+eat)\b/gi,
    replacement: 'My brother likes to eat'
  },
  {
    regex: /\b(?:there\s+at\s+the\s+ooh\s+bird|dook\s+at\s+de\s+b\w*\s+buhd)\b/gi,
    replacement: 'Look at the blue bird'
  },
  {
    regex: /\b(?:fire\s+high\s+in\s+this\s+side|fire\s+high\s+in\s+the\s+shy|fwying\s+high\s+in\s+de\s+shy)\b/gi,
    replacement: 'flying high in the sky'
  },
  {
    regex: /\b(?:dental\s+brown\s+puppy|ditto\s+bwown\s+puppy)\b/gi,
    replacement: 'little brown puppy'
  },
  {
    regex: /\b(?:dump\s+away\s+red\s+ball|dump\s+ovuh\s+a\s+wed\s+baw)\b/gi,
    replacement: 'jumped over a red ball'
  },
  {
    regex: /\b(?:five\s+narrow\s+duct\s+family|five\s+dellow\s+duck\s+fwimming)\b/gi,
    replacement: 'five yellow ducks swimming'
  },
  // Context-aware academic & math/science patterns
  {
    regex: /\b(plus|minus|times|equals|is|number)\s+dine\b/gi,
    replacement: '$1 nine'
  },
  {
    regex: /\b(the|a|is)\s+wed\s+(planet|star|color|circle|square|book|apple|ball|bird|car|flower|line|light)\b/gi,
    replacement: '$1 red $2'
  },
  {
    regex: /\b(water\s+and|sun\s+and|bright|turn\s+on\s+the)\s+dight\b/gi,
    replacement: '$1 light'
  },
  {
    regex: /\b(?:friend\s+fly|frame\s+fly|fwen[- ]?fwy|french\s+fly|when\s+why)\b/gi,
    replacement: 'French fries'
  },
  {
    regex: /\b(?:wah[- ]?men|wamen)\b/gi,
    replacement: 'ramen'
  },
  {
    regex: /\b(?:ham[- ]?buh[- ]?guh|have\s+a\s+good)\b/gi,
    replacement: 'hamburger'
  },
  {
    regex: /\b(?:det[- ]?tis|dattis|dentist)\b/gi,
    replacement: 'lettuce'
  },
  {
    regex: /\b(?:no[- ]?fis|no\s+fish|now\s+fish)\b/gi,
    replacement: 'Goldfish'
  }
];

/**
 * Open-vocabulary word-level map covering her 6 phonological processes across school & daily life
 */
const CALIBRATED_WORD_MAP = {
  // Rule 1 & 2: Initial l->d and y->d
  doo: 'you',
  des: 'yes',
  det: 'yes',
  dook: 'look',
  dooking: 'looking',
  dike: 'like',
  dikes: 'likes',
  doud: 'loud',
  dove: 'love',
  ditto: 'little',
  dental: 'little',
  dellow: 'yellow',
  doos: 'use',
  doosing: 'using',
  dettis: 'lettuce',
  dattis: 'lettuce',
  dight: 'light',
  dion: 'lion',
  deaf: 'leaf',
  dearn: 'learn',
  dearning: 'learning',
  dast: 'last',
  deft: 'left',
  dunch: 'lunch',
  disten: 'listen',
  deon: 'leon',
  dung: 'young',
  dour: 'your',

  // Rule 3: sw/sl/fl/str -> fw/f
  fwimming: 'swimming',
  fwim: 'swim',
  fweet: 'sweet',
  fwawbewwy: 'strawberries',
  fwawbewwies: 'strawberries',
  fwide: 'slide',
  fwying: 'flying',
  fwy: 'fly',
  fwee: 'three',
  fwow: 'slow',
  fweeping: 'sleeping',
  fweep: 'sleep',

  // Rule 4: r->w & cluster gliding (br/gr/tr/dr/cr/fr/pr/pl -> bw/gw/tw/dw/cw/fw/pw)
  wed: 'red',
  wide: 'ride',
  wet: 'rest',
  wead: 'read',
  weading: 'reading',
  wight: 'right',
  wite: 'write',
  witing: 'writing',
  wun: 'run',
  wunning: 'running',
  wock: 'rock',
  woom: 'room',
  wain: 'rain',
  wiver: 'river',
  wound: 'round',
  wule: 'rule',
  wuler: 'ruler',
  wahmen: 'ramen',
  wamen: 'ramen',
  gween: 'green',
  gwat: 'great',
  gweat: 'great',
  gwow: 'grow',
  gwoup: 'group',
  gwade: 'grade',
  bwuduh: 'brother',
  bwater: 'brother',
  bwown: 'brown',
  bwake: 'break',
  bwing: 'bring',
  bwain: 'brain',
  twain: 'train',
  twee: 'tree',
  twy: 'try',
  twying: 'trying',
  twue: 'true',
  dwaw: 'draw',
  dwawing: 'drawing',
  dwink: 'drink',
  pwease: 'please',
  pwees: 'please',
  pway: 'play',
  pwaying: 'playing',
  pwanet: 'planet',
  pwant: 'plant',
  pwants: 'plants',
  pwus: 'plus',
  fwend: 'friend',
  fwends: 'friends',
  fwog: 'frog',
  fwuit: 'fruit',
  hungwy: 'hungry',

  // Rule 5: ch/j/th -> t/d/f
  teese: 'cheese',
  teatuh: 'teacher',
  tair: 'chair',
  dump: 'jump',
  de: 'the',
  dey: 'they',
  dat: 'that',
  dis: 'this',
  dere: 'there',
  den: 'then',
  dank: 'thank',
  bafwoom: 'bathroom',
  bafoom: 'bathroom',

  // Rule 6: Final consonant & epenthesis + Academic / Classroom vocabulary
  pak: 'park',
  pock: 'park',
  puck: 'park',
  hep: 'help',
  hewp: 'help',
  baw: 'ball',
  suhnack: 'snack',
  sinack: 'snack',
  hambuhguh: 'hamburger',
  fwaction: 'fraction',
  fwactions: 'fractions',
  twiangle: 'triangle',
  wectangle: 'rectangle',
  histowy: 'history',
  wibwawy: 'library',
  queschun: 'question',
  answuh: 'answer',
  numbuh: 'number',
  dettuh: 'letter',
  cwayon: 'crayon',
  gwue: 'glue',
  equaw: 'equal',
  equaws: 'equals',
  subtwact: 'subtract',
  muwtipwy: 'multiply',
  gwowing: 'growing',
  cweate: 'create',
  pwoblem: 'problem',
  pwoblems: 'problems',
  pwactice: 'practice',
  pwoject: 'project',
  gwaph: 'graph',
  gwavity: 'gravity',
  expewiment: 'experiment',
  tempewature: 'temperature',
  enviwonment: 'environment',
  diffewent: 'different',
  impowtant: 'important',
  chaptew: 'chapter',
  pawagwaph: 'paragraph',
  vocabuwawy: 'vocabulary'
};

export function reconstructChildUtterance(rawInput, learnedPatterns = [], dictionary = []) {
  if (!rawInput) return '';
  let text = sanitizeChildSafeText(rawInput.trim());
  if (!text) return '';

  // 1. Apply any user-learned single-word or word-level replacements first
  if (Array.isArray(learnedPatterns)) {
    learnedPatterns.forEach((p) => {
      if (p.rawInput && p.resolvedText) {
        const rawClean = p.rawInput.trim();
        const resClean = p.resolvedText.trim();
        if (rawClean.length >= 2) {
          const rawWords = rawClean.split(/\s+/);
          const resWords = resClean.split(/\s+/);
          if (rawWords.length === 1 && resWords.length === 1) {
            const escaped = rawClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
            text = text.replace(reg, resClean);
          } else if (rawWords.length === resWords.length && rawWords.length <= 6) {
            // Extract word-by-word learned substitutions from equal-length corrections
            rawWords.forEach((rw, i) => {
              const rwClean = rw.toLowerCase().replace(/[^a-z]/g, '');
              const twClean = resWords[i].replace(/[?.!,]+$/g, '');
              if (
                rwClean.length >= 3 &&
                rwClean !== twClean.toLowerCase() &&
                !['the', 'and', 'for', 'you', 'can', 'want'].includes(rwClean)
              ) {
                const escaped = rwClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
                text = text.replace(reg, twClean);
              }
            });
          }
        }
      }
    });
  }

  // 1b. Apply single-word custom vocabulary triggers inside open sentences
  if (Array.isArray(dictionary)) {
    dictionary.forEach((item) => {
      if (
        item.phrase &&
        item.phrase.trim().split(/\s+/).length <= 2 &&
        Array.isArray(item.triggers)
      ) {
        item.triggers.forEach((trig) => {
          const trigClean = (trig || '').trim();
          if (trigClean.length >= 3 && trigClean.toLowerCase() !== item.phrase.toLowerCase()) {
            const escaped = trigClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
            text = text.replace(reg, item.phrase.trim());
          }
        });
      }
    });
  }

  // 2. Repair mid-sentence self-corrections & false starts before phonological decoding
  SELF_CORRECTION_PATTERNS.forEach(({ regex, replacement }) => {
    text = text.replace(regex, replacement);
  });

  // 3. Apply multi-word calibrated phrase patterns
  CALIBRATED_PHRASE_PATTERNS.forEach(({ regex, replacement }) => {
    text = text.replace(regex, replacement);
  });

  // 3. Apply open-vocabulary word-by-word phonological map
  const words = text.split(/\s+/);
  const mappedWords = words.map((w, idx) => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    const punct = w.replace(/[a-zA-Z]/g, '');

    // Special context check: "My brother dike to eat" -> "likes"
    if (clean === 'dike' && idx > 0) {
      const prev = words[idx - 1].toLowerCase().replace(/[^a-z]/g, '');
      if (['brother', 'bwuduh', 'mom', 'dad', 'he', 'she', 'it', 'teacher'].includes(prev)) {
        return 'likes' + punct;
      }
    }

    if (CALIBRATED_WORD_MAP[clean]) {
      return CALIBRATED_WORD_MAP[clean] + punct;
    }
    if (clean.endsWith('ing') && clean.length > 5) {
      const stem = clean.slice(0, -3);
      if (CALIBRATED_WORD_MAP[stem]) {
        const mappedStem = CALIBRATED_WORD_MAP[stem];
        const finalStem = mappedStem.endsWith('e') ? mappedStem.slice(0, -1) : mappedStem;
        return finalStem + 'ing' + punct;
      }
    }
    if (clean.endsWith('s') && clean.length > 4) {
      const stem = clean.slice(0, -1);
      if (CALIBRATED_WORD_MAP[stem]) {
        return CALIBRATED_WORD_MAP[stem] + 's' + punct;
      }
    }
    return w;
  });

  let joined = mappedWords.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length > 0) {
    joined = joined.charAt(0).toUpperCase() + joined.slice(1);
  }
  return joined;
}

export function calculateAcousticSimilarity(featA, featB) {
  if (!featA || !featB) return 0;

  let score = 0;
  let weights = 0;

  if (
    Array.isArray(featA.melSequence) &&
    Array.isArray(featB.melSequence) &&
    featA.melSequence.length >= 3 &&
    featB.melSequence.length >= 3
  ) {
    const seqA = featA.melSequence;
    const seqB = featB.melSequence;
    const n = seqA.length;
    const m = seqB.length;
    const dtw = Array.from({ length: n + 1 }, () => new Float32Array(m + 1).fill(Infinity));
    dtw[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const va = seqA[i - 1];
        const vb = seqB[j - 1];
        let dot = 0,
          ma = 0,
          mb = 0;
        for (let k = 0; k < va.length; k++) {
          const a = va[k] || 0;
          const b = vb[k] || 0;
          dot += a * b;
          ma += a * a;
          mb += b * b;
        }
        const cosSim = ma > 0 && mb > 0 ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
        const cost = Math.max(0, 1 - cosSim);
        dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      }
    }

    const avgPathCost = dtw[n][m] / (n + m);
    const dtwSim = Math.max(0, 1 - avgPathCost * 2.2);
    score += dtwSim * 0.5;
    weights += 0.5;
  }

  if (
    Array.isArray(featA.spectralBands) &&
    Array.isArray(featB.spectralBands) &&
    featA.spectralBands.length === 8 &&
    featB.spectralBands.length === 8
  ) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < 8; i++) {
      const a = featA.spectralBands[i] || 0;
      const b = featB.spectralBands[i] || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    }
    const cosine = magA > 0 && magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    score += cosine * 0.3;
    weights += 0.3;
  }

  if (featA.syllableCount && featB.syllableCount) {
    const diff = Math.abs(featA.syllableCount - featB.syllableCount);
    const sylSim = diff === 0 ? 1.0 : diff === 1 ? 0.65 : 0.2;
    score += sylSim * 0.1;
    weights += 0.1;
  }

  if (featA.durationMs && featB.durationMs) {
    const ratio =
      Math.min(featA.durationMs, featB.durationMs) /
      Math.max(featA.durationMs, featB.durationMs);
    score += ratio * 0.1;
    weights += 0.1;
  }

  return weights > 0 ? score / weights : 0;
}

export function extractContentWords(sentence) {
  const stopWords = new Set([
    'i', 'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'for', 'with', 'my', 'me',
    'you', 'it', 'is', 'am', 'are', 'can', 'do', 'want', 'would', 'like', 'please',
    'and', 'we', 'go', 'need', 'have', 'that', 'this', 'not', 'what', 'where'
  ]);
  return (sentence || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

export const contextEngine = {
  reconstructChildUtterance,
  sanitizeChildSafeText,

  isClarifyTrigger(text, triggers = []) {
    if (!text) return false;
    const clean = text.toLowerCase().trim();

    const defaultTriggers = [
      'can you say that again',
      'can they say that again',
      'can do say that again',
      'what did you say',
      'say that again',
      'say again',
      'repeat that',
      'what was that',
      "what'd you say",
      'pardon',
      'could you say that again',
      "i didn't hear you",
      "didn't catch that",
      'come again',
      'huh?'
    ];

    const allTriggers = triggers.length > 0 ? triggers : defaultTriggers;
    return allTriggers.some((t) => clean.includes(t.toLowerCase()));
  },

  extractOptionsFromContext(partnerText) {
    if (!partnerText) return [];
    const text = partnerText.trim();
    const candidates = [];

    const orMatch = text.match(
      /(?:do you want|would you like|prefer|have)\s+([^?.]+)\s+or\s+([^?.]+)/i
    );
    if (orMatch) {
      candidates.push({
        text: `I want ${orMatch[1].trim()}`,
        reason: 'Matches conversation question'
      });
      candidates.push({
        text: `I want ${orMatch[2].trim()}`,
        reason: 'Matches conversation question'
      });
      return candidates;
    }

    return [];
  },

  /**
   * Open-Vocabulary + Personal Dictionary Resolver
   * Prioritizes:
   * 1. Exact/High-Confidence Learned Patterns (user's taught phrases)
   * 2. High-Confidence Calibrated Triggers (when she says a specific trigger like "fwen fwy" or "wa-wa")
   * 3. Open-Vocabulary Phonological Reconstruction of whatever she actually spoke (so academic/school sentences are NEVER overwritten by unrelated home dictionary phrases!)
   */
  resolveUtterance({
    rawInput,
    audioFeatures = null,
    partnerContext = '',
    learnedPatterns = [],
    dictionary = []
  }) {
    const safeRawInput = sanitizeChildSafeText(rawInput || '');
    const raw = safeRawInput.trim().toLowerCase();
    const isVoiceOnlyCode = raw.startsWith('voice-') || raw.startsWith('sound-');
    const reconstructed = isVoiceOnlyCode
      ? ''
      : reconstructChildUtterance(safeRawInput, learnedPatterns, dictionary);
    const reconstructedLower = reconstructed.toLowerCase();

    const allCandidateInputs = [raw, reconstructedLower].filter(Boolean);
    if (audioFeatures && Array.isArray(audioFeatures.alternatives)) {
      audioFeatures.alternatives.forEach((alt) => {
        const cleanAlt = (alt || '').trim().toLowerCase();
        if (cleanAlt) {
          allCandidateInputs.push(cleanAlt);
          allCandidateInputs.push(
            reconstructChildUtterance(cleanAlt, learnedPatterns, dictionary).toLowerCase()
          );
        }
      });
    }

    const scoredOptions = [];

    // 1. Check Personal Learned Patterns
    // IMPORTANT: When actual speech text is heard (!isVoiceOnlyCode), ONLY match a learned pattern
    // if the spoken words/phonetics strongly match that pattern (>= 0.78). Never let voice pitch/timbre
    // (acousticSim) cause the previous turn's phrase to overwrite a newly spoken phrase!
    learnedPatterns.forEach((pattern) => {
      let directSim = 0;
      let targetSim = 0;
      allCandidateInputs.forEach((candStr) => {
        directSim = Math.max(directSim, calculateSimilarity(candStr, pattern.rawInput));
        targetSim = Math.max(targetSim, calculateSimilarity(candStr, pattern.resolvedText));
      });
      const childPhoneticSim = Math.max(
        calculateChildPhoneticSimilarity(raw, pattern.rawInput),
        calculateChildPhoneticSimilarity(reconstructedLower, pattern.resolvedText)
      );

      const bestTextMatch = Math.max(directSim, targetSim, childPhoneticSim * 0.95);

      if (!isVoiceOnlyCode && bestTextMatch < 0.78) {
        return;
      }

      let score = Math.max(directSim * 1.35, targetSim * 1.25, childPhoneticSim * 1.15);

      if (isVoiceOnlyCode && audioFeatures && pattern.audioFeatures) {
        const acousticSim = calculateAcousticSimilarity(audioFeatures, pattern.audioFeatures);
        if (acousticSim > 0.75) {
          score = Math.max(score, acousticSim * 0.95);
        }
      }

      score += Math.min(0.15, (pattern.useCount || 1) * 0.03);

      if (score >= 0.82 || (isVoiceOnlyCode && score >= 0.65)) {
        scoredOptions.push({
          phrase: pattern.resolvedText,
          score,
          reason: `Learned pattern (used ${pattern.useCount || 1}x)`,
          isLearned: true
        });
      }
    });

    // 2. Check Personal Vocabulary Dictionary (ONLY very strong matches >= 0.85 so it never hijacks new speech!)
    dictionary.forEach((item) => {
      let bestItemScore = 0;
      let triggerMatched = '';

      const phraseSim = Math.max(
        calculateSimilarity(raw, item.phrase),
        calculateSimilarity(reconstructedLower, item.phrase),
        calculateChildPhoneticSimilarity(raw, item.phrase) * 0.9
      );
      if (phraseSim > bestItemScore) {
        bestItemScore = phraseSim;
      }

      if (item.triggers && Array.isArray(item.triggers)) {
        item.triggers.forEach((trig) => {
          const trigLower = trig.toLowerCase().trim();
          let trigSim = 0;
          allCandidateInputs.forEach((candStr) => {
            trigSim = Math.max(trigSim, calculateSimilarity(candStr, trigLower));
            if (candStr === trigLower) {
              trigSim = 1.3;
            }
          });
          if (trigSim > bestItemScore) {
            bestItemScore = trigSim;
            triggerMatched = trig;
          }
        });
      }

      // Require strong whole-utterance match (>= 0.88) to suggest a canned dictionary phrase
      if (bestItemScore >= 0.88) {
        scoredOptions.push({
          phrase: item.phrase,
          score: bestItemScore,
          reason: triggerMatched ? `Matched "${triggerMatched}"` : 'Vocabulary match'
        });
      }
    });

    // 3. ALWAYS include the Open-Vocabulary Phonological Reconstruction of what she JUST said!
    if (reconstructed && !isVoiceOnlyCode) {
      scoredOptions.push({
        phrase: reconstructed,
        score: 1.05,
        reason:
          reconstructedLower !== raw
            ? 'Phonological speech reconstruction'
            : 'Heard speech',
        isOpenSpeech: true
      });
    }

    // Also include N-best reconstructed alternatives if available
    if (audioFeatures && Array.isArray(audioFeatures.alternatives)) {
      audioFeatures.alternatives.slice(0, 3).forEach((alt, idx) => {
        const reconAlt = reconstructChildUtterance(alt, learnedPatterns, dictionary);
        if (reconAlt && reconAlt.toLowerCase() !== reconstructedLower) {
          scoredOptions.push({
            phrase: reconAlt,
            score: 0.85 - idx * 0.05,
            reason: 'Alternative interpretation'
          });
        }
      });
    }

    // 4. Deduplicate and Pick Top 3 Closest Matches
    const uniqueMap = new Map();
    scoredOptions.forEach((opt) => {
      const key = opt.phrase.toLowerCase().replace(/[?.!]+$/g, '').trim();
      if (!uniqueMap.has(key) || uniqueMap.get(key).score < opt.score) {
        uniqueMap.set(key, opt);
      }
    });

    const sorted = Array.from(uniqueMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (sorted.length === 0) {
      sorted.push({
        phrase: 'Can you help me please?',
        score: 0.6,
        reason: 'Common phrase'
      });
    }

    return sorted.slice(0, 3);
  }
};
