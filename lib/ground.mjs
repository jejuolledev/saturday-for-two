// Grounding check for anything a language model writes into the plan.
// A sentence may only name things that came back from Qloo (or that the user typed) and may only
// state numbers that are in the data. Anything else is rejected and replaced by a template.

const COMMON = new Set(['i', 'me', 'my', 'we', 'our', 'us', 'you', 'your', 'both', 'neither', 'either', 'saturday', 'qloo', 'the', 'a', 'an', 'it', 'its', 'this', 'that', 'then', 'so', 'and', 'but', 'or', 'if', 'for', 'of', 'in', 'on', 'at', 'to', 'with', 'from', 'one', 'two', 'three', 'top', 'list', 'lists', 'rank', 'ranks', 'no', 'not', 'only', 'also', 'here', 'there', 'they', 'he', 'she', 'his', 'her', 'their', 'morning', 'lunch', 'film', 'movie', 'songs', 'song', 'music', 'show', 'episode', 'evening', 'car', 'turn', 'turns', 'shared', 'both', 'nothing', 'outside', 'everyone', 'mixed', 'call', 'instead', 'meanwhile', 'later', 'first', 'next', 'after', 'before', 'tonight', 'today', 'pick', 'picks', 'ok', 'tv', 'pg', 'g', 'kids', 'kid', 'alcohol', 'good', 'none', 'while', 'when', 'since', 'because', 'each', 'other', 'every', 'what', 'who', 'where', 'how', 'yes']);

const dash = (s) => String(s || '').replace(/[\u2010-\u2015\u2212]/g, '-');
const norm = (s) => dash(s).toLowerCase().normalize('NFKC');

// allowed: { names: [...strings], numbers: [...numbers] }
export function checkClaims(text, allowed) {
  const problems = [];
  let t = norm(text);
  if (!t.trim()) return { ok: false, problems: ['empty'] };
  if (t.length > 420) problems.push('too long');
  // Remove every allowed name (longest first) so names with digits or capitals inside are fine.
  const names = [...new Set((allowed.names || []).map(norm).filter((n) => n.length >= 2))].sort((x, y) => y.length - x.length);
  for (const n of names) t = t.split(n).join(' ');
  // Numbers: every number left must be one the data contains.
  const nums = new Set((allowed.numbers || []).map((n) => String(n)));
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) if (!nums.has(m[0])) problems.push(`number ${m[0]} is not in the data`);
  if (/[%$€£₩]/.test(t)) problems.push('percent or money stated');
  if (/\b[olfme]\d{1,2}\b/.test(t)) problems.push('an internal ref (like m1) is in the sentence');
  // Non-Latin scripts left over are names we did not see.
  if (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.test(t)) problems.push('a name that is not in the data');
  // Capitalised words in the original that are not allowed names and not common words.
  const orig = dash(text);
  let o = orig;
  for (const n of [...new Set((allowed.names || []).map(dash))].sort((x, y) => y.length - x.length)) if (n && n.length >= 2) o = o.split(new RegExp(escapeRe(n), 'gi')).join(' ');
  const sentences = o.split(/(?<=[.!?:;—–-])\s+|\n/);
  for (const s of sentences) {
    const words = s.trim().split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (!clean || i === 0) return;
      if (/^\p{Lu}/u.test(clean) && !COMMON.has(clean.toLowerCase())) problems.push(`"${clean}" is not a name from Qloo`);
    });
    // quoted text must be an allowed name
    for (const q of s.matchAll(/["“”']([^"“”']{3,60})["“”']/g)) problems.push(`quoted "${q[1]}" is not a name from Qloo`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
