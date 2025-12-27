const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(tok);
    }
  }
  return args;
}

function loadJson(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    process.exit(1);
  }
}

function pickArray(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object') {
    if (Array.isArray(doc.data)) return doc.data;
    if (Array.isArray(doc.words)) return doc.words;
    for (const k of Object.keys(doc)) {
      if (Array.isArray(doc[k]) && doc[k].every(v => v && typeof v === 'object')) {
        return doc[k];
      }
    }
  }
  console.error('Cannot locate entries array in JSON.');
  process.exit(1);
}

function isValidWordBasic(word) {
  return typeof word === 'string' && word.trim().length > 0;
}

function isValidWordStrict(word) {
  if (typeof word !== 'string') return false;
  const s = word.trim();
  if (!s) return false;
  return /^[A-Za-z][A-Za-z\-']*$/.test(s);
}

function getWord(o) {
  if (!o || typeof o !== 'object') return undefined;
  if (typeof o.word === 'string') return o.word;
  if (typeof o.term === 'string') return o.term;
  return undefined;
}

function getWeight(o) {
  if (o && typeof o.weight === 'number') return o.weight;
  return 0;
}

function alphaCmp(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

function uniqueByWord(arr) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const w = getWord(it);
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(it);
    }
  }
  return out;
}

function stats(arr) {
  const counts = { total: arr.length };
  const map = new Map();
  for (let i = 0; i < arr.length; i++) {
    const w = getWord(arr[i]);
    if (!w) continue;
    map.set(w, (map.get(w) || 0) + 1);
  }
  counts.unique = map.size;
  counts.duplicates = [...map.values()].filter(x => x > 1).length;
  const buckets = { '0-4': 0, '5-8': 0, '9-12': 0, '13+': 0 };
  for (const w of map.keys()) {
    const len = w.length;
    if (len <= 4) buckets['0-4']++;
    else if (len <= 8) buckets['5-8']++;
    else if (len <= 12) buckets['9-12']++;
    else buckets['13+']++;
  }
  counts.lengthBuckets = buckets;
  const longest = [...map.keys()].sort((a, b) => b.length - a.length || alphaCmp(a, b)).slice(0, 20);
  counts.top20Longest = longest;
  return counts;
}

function main() {
  const args = parseArgs(process.argv);
  const file = args._[0] || args.file;
  if (!file) {
    console.log('Usage: node scripts/process-json.js <file> [--action validate|stats|clean|sort] [--strict] [--dedupe] [--minWeight N] [--sort length-desc|alpha|alpha-rev|weight-desc] [--out outfile]');
    process.exit(1);
  }
  const action = (args.action || 'validate').toString();
  const strict = !!args.strict;
  const minWeight = args.minWeight != null ? Number(args.minWeight) : null;
  const sortMode = args.sort || null;
  const out = args.out || null;

  const doc = loadJson(file);
  let arr = pickArray(doc);

  if (action === 'validate') {
    const invalid = [];
    const validator = strict ? isValidWordStrict : isValidWordBasic;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      const w = getWord(it);
      if (!validator(w)) {
        invalid.push({ index: i, word: w });
      }
    }
    console.log('TOTAL:', arr.length);
    console.log('INVALID_COUNT:', invalid.length);
    if (invalid.length) {
      console.log('SAMPLE_INVALID:', invalid.slice(0, 20));
    }
    process.exit(0);
  }

  if (action === 'stats') {
    const s = stats(arr);
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }

  if (action === 'clean' || action === 'sort') {
    const validator = strict ? isValidWordStrict : isValidWordBasic;
    let work = arr.filter(it => validator(getWord(it)));
    if (args.dedupe) work = uniqueByWord(work);
    if (minWeight != null) work = work.filter(it => getWeight(it) > minWeight);

    if (sortMode) {
      if (sortMode === 'alpha') {
        work.sort((a, b) => alphaCmp(getWord(a) || '', getWord(b) || ''));
      } else if (sortMode === 'alpha-rev') {
        work.sort((a, b) => alphaCmp(getWord(b) || '', getWord(a) || ''));
      } else if (sortMode === 'length-desc') {
        work.sort((a, b) => {
          const aw = getWord(a) || '';
          const bw = getWord(b) || '';
          return bw.length - aw.length || alphaCmp(aw, bw);
        });
      } else if (sortMode === 'weight-desc') {
        work.sort((a, b) => {
          const dw = getWeight(b) - getWeight(a);
          if (dw !== 0) return dw;
          const aw = getWord(a) || '';
          const bw = getWord(b) || '';
          return alphaCmp(aw, bw);
        });
      }
    }

    if (out) {
      const absOut = path.resolve(out);
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, JSON.stringify(work, null, 2), 'utf8');
      console.log('WROTE:', absOut);
      console.log('COUNT:', work.length);
    } else {
      console.log('COUNT:', work.length);
      console.log(JSON.stringify(work.slice(0, 3), null, 2));
      console.log('...');
    }
    process.exit(0);
  }

  console.error('Unknown action:', action);
  process.exit(1);
}

main();
