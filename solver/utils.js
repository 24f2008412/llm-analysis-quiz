// solver/utils.js (FINAL CORRECTED)
const axios = require('axios');
const { JSDOM } = require('jsdom');

function cleanUrl(url){
  if (!url) return null;
  url = url.replace(/<\/?[^>]+>/g, '');
  url = url.replace(/[\u200B-\u200D\uFEFF]/g, '');
  return url.trim();
}

function normalizeUrl(url, base){
  if (!url) return null;
  url = cleanUrl(url);

  if (url.startsWith('//')) return 'https:' + url;

  try{
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:")
      return parsed.href;
  }catch(e){}

  try{
    return new URL(url, base).href;
  }catch(e){
    console.warn("normalizeUrl failed:", url, base);
    return null;
  }
}

// REQUIRED FIX — prevents submit%7B problem
function findSubmitUrl(html){
  let m;

  // action="...submit"
  m = html.match(/action=["']([^"' ]*submit[^"']*)/i);
  if (m) return cleanUrl(m[1]);

  // Correct full absolute submit URL — stop at boundary
  m = html.match(/https?:\/\/[^\s"'<>]+\/submit\b/i);
  if (m) return cleanUrl(m[0]);

  // relative /submit
  m = html.match(/['"](\/[^"' ]*submit[^"']*)['"]/i);
  if (m) return cleanUrl(m[1]);

  return null;
}

async function detectFileType(buffer){
  try{
    const FileType = (await import('file-type')).default;
    return await FileType.fromBuffer(buffer) || null;
  }catch(e){
    return null;
  }
}

async function downloadFile(url){
  url = cleanUrl(url);
  console.log("📥 downloading:", url);
  if (!url.startsWith("http")){
    throw new Error("❗ downloadFile received NON-ABSOLUTE URL: " + url);
  }

  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  if (!resp.data) throw new Error("Download returned empty buffer");
  return { buffer: Buffer.from(resp.data), headers: resp.headers };
}

function extractAtobBase64(html){
  const m = html.match(/atob\((?:`|")([A-Za-z0-9+\/=\n\r]+)(?:`|")\)/m);
  if (!m) return null;
  return cleanUrl(m[1]).replace(/\s+/g,'');
}

function findLikelyFileLinks(html, baseUrl){
  const matches = [];
  const re = /href=['"]([^'"]+\.(?:csv|xlsx?|pdf|zip|mp3|wav|ogg))['"]/ig;
  let m;
  while ((m = re.exec(html)) !== null){
    let abs = normalizeUrl(m[1], baseUrl);
    if (abs) matches.push(abs);
  }
  return matches;
}

function sumNumbersNearWord(text, word){
  const lines = text.split(/\n+/);
  let sum = 0;
  let found = false;
  for (const line of lines){
    if (line.toLowerCase().includes(word.toLowerCase())){
      const nums = line.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
      if (nums) { found = true; for (const n of nums) sum += Number(n); }
    }
  }
  return found ? sum : null;
}

function extractTablesFromHtml(html){
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  return Array.from(doc.querySelectorAll('table')).map(t => t.outerHTML);
}

function htmlTableToJson(htmlTable){
  const dom = new JSDOM(htmlTable);
  const doc = dom.window.document;
  const table = doc.querySelector('table');
  if (!table) return [];

  const thead = table.querySelectorAll('thead th');
  const headers = thead.length
    ? Array.from(thead).map(th => th.textContent.trim())
    : Array.from(table.querySelectorAll('tr')[0].querySelectorAll('td,th')).map((n,i)=>n.textContent.trim() || (`col${i}`));

  const rowEls = thead.length
    ? Array.from(table.querySelectorAll('tbody tr'))
    : Array.from(table.querySelectorAll('tr')).slice(1);

  return rowEls.map(r => {
    const cells = Array.from(r.querySelectorAll('td,th')).map(n => n.textContent.trim());
    const row = {};
    headers.forEach((h,i)=> row[h] = cells[i] || null);
    return row;
  }).map(row=>{
    const out = {};
    for (const k of Object.keys(row)){
      const v = row[k];
      const num = v && v.replace(/[, ]+/g,'').match(/^-?\d+(?:\.\d+)?([eE][-+]?\d+)?$/);
      out[k] = num ? Number(v.replace(/,/g,'')) : v;
    }
    return out;
  });
}

function pickColumnName(row, candidates){
  if (!row) return null;
  const keys = Object.keys(row).map(k=>k.toLowerCase());
  for (const c of candidates){
    const idx = keys.findIndex(k=>k.includes(c));
    if (idx >= 0) return Object.keys(row)[idx];
  }
  return null;
}

function stripHtml(html){ return html.replace(/<[^>]*>/g,''); }

module.exports = {
  cleanUrl, normalizeUrl, findSubmitUrl,
  extractAtobBase64, findLikelyFileLinks,
  downloadFile, detectFileType, sumNumbersNearWord,
  extractTablesFromHtml, htmlTableToJson, pickColumnName,
  stripHtml
};
