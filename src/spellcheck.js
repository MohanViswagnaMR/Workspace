/* =========================================================================
   Offline spell checker
   -------------------------------------------------------------------------
   Browsers don't expose their spell-check suggestions to JavaScript, so the
   app ships its own: a frequency-ordered English word list (public/dict/en.txt,
   lazy-loaded on first use) plus a Norvig-style edit-distance suggester ranked
   by word frequency. Everything runs client-side and offline once cached.
   ========================================================================= */

let words = null;   // Set<string> of known words (lowercase)
let rank  = null;   // Map<string, number> word → frequency rank (lower = commoner)
let loading = null; // in-flight load promise

// Kick off (or reuse) the dictionary load. Safe to call many times.
export function loadDict(){
  if(words) return Promise.resolve();
  if(loading) return loading;
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  loading = fetch(base + 'dict/en.txt')
    .then(r => r.ok ? r.text() : Promise.reject(new Error('dict '+r.status)))
    .then(txt => {
      const list = txt.split('\n');
      words = new Set();
      rank  = new Map();
      for(let i=0;i<list.length;i++){
        const w = list[i];
        if(!w) continue;
        words.add(w);
        if(!rank.has(w)) rank.set(w, i);
      }
    })
    .catch(e => { loading = null; throw e; });
  return loading;
}

export const dictReady = () => !!words;

// strip surrounding punctuation, keep inner letters/apostrophes, lowercase
const clean = w => (w||'').toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g,'');

// A token counts as misspelled when the dictionary is loaded, the word is
// alphabetic (len ≥ 2), not a number, and isn't a known word.
export function isMisspelled(token){
  if(!words) return false;
  if(/\d/.test(token)) return false;
  const w = clean(token);
  if(w.length < 2) return false;
  return !words.has(w);
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
function edits1(w){
  const out = new Set();
  for(let i=0;i<=w.length;i++){
    if(i<w.length) out.add(w.slice(0,i)+w.slice(i+1));                 // delete
    if(i<w.length-1) out.add(w.slice(0,i)+w[i+1]+w[i]+w.slice(i+2));   // transpose
    for(let k=0;k<26;k++){
      const c = ALPHA[k];
      if(i<w.length) out.add(w.slice(0,i)+c+w.slice(i+1));             // replace
      out.add(w.slice(0,i)+c+w.slice(i));                             // insert
    }
  }
  return out;
}

// Up to `max` correction suggestions for a misspelled word, ranked by frequency.
export function suggest(token, max=5){
  if(!words) return [];
  const w = clean(token);
  if(w.length < 2 || words.has(w)) return [];
  const found = new Set();
  for(const e of edits1(w)) if(words.has(e)) found.add(e);
  // expand to edit-distance 2 only when distance-1 came up short (and the word
  // is short enough that the quadratic pass stays cheap)
  if(found.size < max && w.length <= 12){
    for(const e1 of edits1(w)){
      for(const e2 of edits1(e1)) if(words.has(e2)) found.add(e2);
      if(found.size > max*8) break;
    }
  }
  found.delete(w);
  const ranked = [...found].sort((a,b)=>(rank.get(a)??1e9)-(rank.get(b)??1e9));
  return ranked.slice(0, max).map(s => matchCase(token, s));
}

// mirror the original token's leading capitalization onto a suggestion
function matchCase(orig, s){
  const o = (orig||'').replace(/^[^A-Za-z']+/,'');
  if(o && o[0] === o[0].toUpperCase() && o[0] !== o[0].toLowerCase())
    return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}
