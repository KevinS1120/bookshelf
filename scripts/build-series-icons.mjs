// Picks the series-cover icons from game-icons.net (CC BY 3.0) and writes
// src/seriesIcons.js. Run with: node scripts/build-series-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const set = JSON.parse(readFileSync(require.resolve('@iconify-json/game-icons/icons.json'), 'utf8'));
const names = Object.keys(set.icons);

// Each category: icons to include first (hand-picked), then words to look for
// in icon names (whole hyphen-separated words) to fill up the category.
const CATEGORIES = [
  {
    id: 'magic',
    label: 'Magic',
    pick: [
      'wizard-staff', 'magic-swirl', 'crystal-ball', 'potion-ball', 'spell-book', 'magic-potion', 'fairy-wand', 'pentacle',
      'rune-stone', 'cauldron', 'crystal-wand', 'unicorn', 'wizard-face', 'witch-face', 'magic-lamp', 'magic-portal',
      'magic-gate', 'magic-broom', 'fairy', 'fairy-wings', 'book-aura', 'lunar-wand', 'dragon-orb', 'crystal-eye',
      'tied-scroll', 'round-potion', 'bubbling-flask', 'fizzing-flask', 'magic-shield', 'orb-wand', 'enchanted-sword',
      'third-eye', 'triquetra', 'celtic-knot', 'mirror-mirror', 'genie', 'genie-lamp', 'aura', 'crystal-growth',
    ],
    words: ['magic', 'wizard', 'witch', 'spell', 'potion', 'wand', 'rune', 'crystal', 'orb', 'cauldron', 'fairy', 'enchanted', 'sorcery', 'mage', 'elixir', 'grimoire'],
  },
  {
    id: 'creatures',
    label: 'Creatures',
    pick: [
      'dragon-head', 'spiked-dragon-head', 'dragon-spiral', 'dragon-breath', 'griffin-symbol', 'phoenix-head', 'wolf-howl',
      'wolf-head', 'raven', 'kraken-tentacle', 'sea-serpent', 'sea-dragon', 'hydra', 'wyvern', 'lion', 'owl', 'barn-owl',
      'stag-head', 'fox-head', 'eagle-head', 'eagle-emblem', 'bear-head', 'horse-head', 'pegasus', 'centaur', 'minotaur',
      'troll', 'goblin', 'ogre', 'cobra', 'snake', 'shark-jaws', 'whale-tail', 'octopus', 'squid', 'spider-alt',
      'scarab-beetle', 'butterfly', 'dragonfly', 'tiger-head',
    ],
    words: ['dragon', 'griffin', 'phoenix', 'wolf', 'raven', 'owl', 'kraken', 'serpent', 'hydra', 'lion', 'bear', 'fox', 'stag', 'eagle', 'spider', 'horse', 'troll', 'goblin', 'wyvern', 'basilisk', 'snake', 'deer', 'boar', 'hawk', 'crow', 'tiger', 'whale', 'shark'],
  },
  {
    id: 'battle',
    label: 'Battle',
    pick: [
      'crossed-swords', 'broadsword', 'two-handed-sword', 'battle-axe', 'pocket-bow', 'bow-arrow', 'high-shot', 'crossbow',
      'checked-shield', 'round-shield', 'shield-reflect', 'visored-helm', 'spartan-helmet', 'barbute', 'closed-barbute',
      'trident', 'war-axe', 'mace-head', 'flail', 'catapult', 'cannon', 'katana', 'scimitar', 'sai', 'halberd', 'gauntlet',
      'chest-armor', 'knight-banner', 'sword-in-stone', 'crossed-axes', 'arrow-cluster', 'spear-head', 'dagger-rose',
      'bowie-knife', 'stiletto', 'war-pick', 'thor-hammer', 'trebuchet', 'battering-ram', 'drakkar',
    ],
    words: ['sword', 'swords', 'axe', 'bow', 'arrow', 'arrows', 'dagger', 'spear', 'shield', 'crossbow', 'helm', 'helmet', 'mace', 'hammer', 'flail', 'scimitar', 'katana', 'halberd', 'trident', 'catapult', 'saber', 'rapier', 'lance', 'gauntlet'],
  },
  {
    id: 'kingdoms',
    label: 'Kingdoms',
    pick: [
      'castle', 'stone-tower', 'crown', 'queen-crown', 'jeweled-crown', 'throne-king', 'crowned-skull', 'scepter', 'fort',
      'hill-fort', 'tower-flag', 'castle-ruins', 'palace', 'crowned-heart', 'heraldic-sun', 'king', 'chess-king',
      'chess-queen', 'chess-knight', 'gate', 'open-gate', 'star-gate', 'portculis', 'greek-temple', 'pagoda',
      'mayan-pyramid', 'egyptian-pyramids', 'stone-bridge', 'village', 'windmill', 'church', 'bell-shield', 'griffin-shield',
      'lion-shield', 'swords-emblem', 'laurel-crown', 'laurels', 'tiara', 'ring-of-power', 'crenulated-shield',
    ],
    words: ['castle', 'tower', 'crown', 'throne', 'king', 'queen', 'knight', 'banner', 'fortress', 'fort', 'keep', 'palace', 'scepter', 'heraldic', 'emperor', 'prince', 'princess', 'citadel', 'kingdom', 'ruins', 'temple', 'pillar'],
  },
  {
    id: 'voyages',
    label: 'Voyages',
    pick: [
      'galleon', 'anchor', 'compass', 'treasure-map', 'locked-chest', 'open-treasure-chest', 'open-chest', 'sextant',
      'lighthouse', 'island', 'palm-tree', 'wave-crest', 'spyglass', 'pirate-flag', 'pirate-hat', 'skull-crossed-bones',
      'caravel', 'ship-wheel', 'ship-wreck', 'hot-air-balloon', 'airship', 'world', 'globe', 'sail', 'sailboat', 'canoe',
      'backpack', 'camping-tent', 'footprint', 'signpost', 'direction-signs', 'telescope', 'lantern-flame', 'old-lantern',
      'steam-locomotive', 'horseshoe', 'mountain-road', 'cargo-ship', 'tread', 'binoculars',
    ],
    words: ['ship', 'galleon', 'anchor', 'compass', 'map', 'treasure', 'chest', 'sextant', 'lighthouse', 'island', 'wave', 'sail', 'sailboat', 'spyglass', 'telescope', 'pirate', 'caravel', 'boat', 'canoe', 'train', 'carriage', 'backpack', 'tent', 'globe', 'world', 'footprint', 'signpost'],
  },
  {
    id: 'wilds',
    label: 'Wilds',
    pick: [
      'oak', 'pine-tree', 'beech', 'willow-tree', 'forest', 'peaks', 'mountains', 'moon', 'half-moon', 'moon-orbit', 'sun',
      'sunrise', 'star-swirl', 'stars-stack', 'fern', 'rose', 'lotus', 'tulip', 'sunflower', 'mushroom-gills', 'mushrooms',
      'campfire', 'snowflake-1', 'snowflake-2', 'lightning-storm', 'tornado', 'volcano', 'waterfall', 'river', 'acorn',
      'oak-leaf', 'maple-leaf', 'clover', 'feather', 'desert', 'cactus', 'flame', 'fire', 'cloud', 'wind-slap',
    ],
    words: ['tree', 'oak', 'pine', 'forest', 'mountain', 'mountains', 'peaks', 'moon', 'sun', 'star', 'leaf', 'flower', 'rose', 'mushroom', 'river', 'campfire', 'snowflake', 'lightning', 'volcano', 'waterfall', 'tornado', 'flame', 'lotus', 'clover', 'acorn', 'feather', 'desert', 'cactus'],
  },
  {
    id: 'mystery',
    label: 'Mystery',
    pick: [
      'death-skull', 'skull-in-jar', 'candle-light', 'candle-skull', 'key', 'skeleton-key', 'padlock', 'eye-target',
      'all-seeing-eye', 'domino-mask', 'carnival-mask', 'poison-bottle', 'coffin', 'ghost', 'haunting', 'hourglass',
      'spider-web', 'hood', 'cloak', 'magnifying-glass', 'fingerprint', 'tombstone', 'grave-flowers', 'crossed-bones',
      'vampire-dracula', 'werewolf', 'reaper-scythe', 'scythe', 'dripping-blade', 'blood', 'cursed-star', 'evil-book',
      'sealed-scroll', 'trapdoor', 'lockpicks', 'masked-spider', 'crow-dive', 'black-cat', 'pocket-watch', 'smoking-pipe',
    ],
    words: ['skull', 'candle', 'key', 'padlock', 'eye', 'mask', 'poison', 'coffin', 'ghost', 'hourglass', 'web', 'lantern', 'hood', 'cloak', 'magnifying', 'fingerprint', 'grave', 'tombstone', 'bones', 'vampire', 'werewolf', 'haunted', 'reaper'],
  },
  {
    id: 'scifi',
    label: 'Sci-fi',
    pick: [
      'rocket', 'rocket-flight', 'ringed-planet', 'planet-core', 'earth-america', 'robot-golem', 'android-mask', 'ufo',
      'flying-saucer', 'astronaut-helmet', 'satellite', 'galaxy', 'alien-skull', 'ray-gun', 'laser-gun', 'spaceship',
      'starfighter', 'space-shuttle', 'cyborg-face', 'atom', 'comet-spark', 'radar-dish', 'circuitry', 'gears', 'portal',
      'nuclear', 'battle-mech', 'dna1', 'dna2', 'black-hole-bolas', 'orbit', 'energy-sword', 'teleport', 'robot-antennas',
      'processor', 'planet-conquest', 'jet-pack', 'mineral-heart', 'radioactive', 'implosion',
    ],
    words: ['rocket', 'planet', 'robot', 'ufo', 'astronaut', 'satellite', 'galaxy', 'alien', 'spaceship', 'starfighter', 'cyborg', 'atom', 'comet', 'radar', 'circuitry', 'android', 'laser', 'space', 'portal', 'dna', 'nuclear'],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    pick: [
      'heart-wings', 'hearts', 'love-letter', 'diamond-ring', 'ring', 'lips', 'kiss', 'dove', 'peace-dove', 'heart-key',
      'linked-rings', 'love-song', 'heart-bottle', 'shining-heart', 'heart-tower', 'lovers', 'candlebright', 'swan',
      'butterfly-flower', 'flower-emblem', 'heart-inside', 'heart-organ', 'arrow-cupid', 'cupidon-arrow', 'love-mystery',
      'two-hearts', 'heart-necklace', 'wedding-dress', 'ballerina-shoes', 'dancers', 'violin', 'music-box', 'lotus-flower',
      'ribbon', 'perfume-bottle', 'fan', 'rose', 'tulip', 'pearl-necklace', 'gem-pendant',
    ],
    words: ['heart', 'hearts', 'love', 'ring', 'lips', 'kiss', 'dove', 'letter', 'wedding', 'cupid', 'valentine', 'tulip', 'swan', 'butterfly', 'necklace'],
  },
  {
    id: 'scholars',
    label: 'Scholars',
    pick: [
      'open-book', 'book-cover', 'bookshelf', 'book-pile', 'books', 'scroll-unfurled', 'scroll-quill', 'quill-ink', 'quill',
      'inkwell', 'graduate-cap', 'theater', 'drama-masks', 'spectacles', 'harp', 'lyre', 'abacus', 'microscope', 'candlestick',
      'desk-lamp', 'paint-brush', 'easel', 'palette', 'trumpet', 'brain', 'light-bulb', 'philosopher-bust', 'greek-sphinx',
      'ancient-ruins', 'egyptian-temple', 'papers', 'envelope', 'stamper', 'owl', 'magnifying-glass', 'globe', 'compass',
      'sextant', 'chess-knight', 'book-aura',
    ],
    words: ['book', 'books', 'bookshelf', 'scroll', 'quill', 'ink', 'inkwell', 'globe', 'watch', 'chess', 'theater', 'pen', 'spectacles', 'candlestick', 'telescope', 'microscope', 'abacus', 'lyre', 'harp', 'violin'],
  },
];

const PER_CATEGORY = 40;

// Modern or off-theme icons that the word matching would otherwise pull in.
const EXCLUDE = new RegExp(
  '(^|-)(usb|car|cars|usa|brazil|india|golf|tv|tie|boxing|gas|scuba|jason|water|pisa|ranch|corner|card|mould|' +
    'engine|speed|egg|goo|3d|dog|pistol|sentry|bolter|zat|field|stock|robber|alarm|plus|minus|tile|dunk|lob|zig|' +
    'vest|belt|leg|palm|swing|ace|dice|deku|paw|self|ball|cold|half|cog|cyber|mecha|bug|grab|stare|blast|burst|' +
    'spit|spy|beats|power|pope|frog|old|evil|dwarf|tusks|boss|bolt|dead|totem|tribal|ninja|devil|curly|trap|rule|' +
    'white|black|secret|music|rear|beams|icicles|frozen|smoking|bars|law|holy|paper|police|taxi|bus|truck|' +
    'phone|computer|laptop|money|dollar|coin|shopping|cart|soccer|football|basketball|baseball|tennis|bowling|' +
    'toilet|pizza|burger|beer|soda|cigarette|syringe|pill|virus|bacteria|lab|test|hazard|biohazard|gun|rifle|' +
    'shotgun|grenade|bomb|tank|helicopter|plane|jet|missile|drone|ammo|bullet|bullets|target|crosshair)(-|$)',
);
// Hand-picked icons are kept even if a word above appears in their name.
const PICKED = new Set(CATEGORIES.flatMap((c) => c.pick));

const used = new Set();
const out = [];
for (const cat of CATEGORIES) {
  const chosen = [];
  const add = (n, picked = false) => {
    if (chosen.length >= PER_CATEGORY || used.has(n) || !set.icons[n]) return;
    if (!picked && EXCLUDE.test(n)) return;
    chosen.push(n);
    used.add(n);
  };
  cat.pick.forEach((n) => add(n, true));
  // Fill up with names containing the category's words, simplest names first.
  names
    .filter((n) => !PICKED.has(n) && n.split('-').some((w) => cat.words.includes(w)))
    .sort((a, b) => a.split('-').length - b.split('-').length || a.length - b.length)
    .forEach((n) => add(n));
  out.push({ id: cat.id, label: cat.label, icons: chosen });
}

const icons = {};
for (const cat of out) for (const n of cat.icons) icons[n] = set.icons[n].body;

const header = `// Generated by scripts/build-series-icons.mjs from game-icons.net
// (https://game-icons.net, CC BY 3.0). Each value is the inside of a 512x512 SVG.
`;
writeFileSync(
  'src/seriesIcons.js',
  `${header}export const ICON_CATEGORIES = ${JSON.stringify(out)};\n\nexport const ICONS = ${JSON.stringify(icons)};\n`,
);
console.log(out.map((c) => `${c.label}: ${c.icons.length}`).join('\n'));
console.log('total', Object.keys(icons).length);
const missing = CATEGORIES.flatMap((c) => c.pick).filter((n) => !set.icons[n]);
console.log('hand picks not in the set:', missing.length, missing.join(', '));
