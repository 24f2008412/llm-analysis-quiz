// solver/utils.js
const axios = require('axios');
const FileType = require('file-type');
const { JSDOM } = require('jsdom');

function findSubmitUrl(html, innerText){
  // Naive: look for https://.../submit in the HTML or text
  const re = /(https?:\/\/[\w\-\.\/:\d]+\/submit[\w\-\/]*)/i;
  let m = html.match(re) || innerText.match(re);
  return m ? m[1] : null;
}

function extractAtobBase64(html){
  // match atob(`BASE64...`) or atob("...")
  const m = html.match(/atob\((?:`|")([A-Za-z0-9+\/=\n\r]+)(?:`|")\)/m);
  return m ? m[1].replace(/\s+/g,'') : null;
}

async function downloadFile(url){
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  return { buffer: Buffer.from(resp.data), headers: resp.headers };
}

async function detectFileType(buffer){
  try{
    const t = await FileType.fromBuffer(buffer);
    return t || null;
  }catch(e){return null;}
}

function findLikelyFileLinks(html, baseUrl){
  // look for href to .csv, .xlsx, .pdf or typical file host
  const matches = [];
  const re = /href=['"]([^'"]+\.(?:csv|xlsx?|pdf|zip))['"]/ig;
  let m;
  while ((m = re.exec(html)) !== null){
    let url = m[1];
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) {
      try{ const u = new URL(baseUrl); url = u.origin + url; }catch(e){}
    }
    matches.push(url);
  }
  return matches;
}

function sumNumbersNearWord(text, word){
  // Look for lines that contain the word and numbers. Return sum of numbers in that page.
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
  const tables = Array.from(doc.querySelectorAll('table'));
  return tables.map(t => t.outerHTML);
}

function htmlTableToJson(htmlTable){
  const dom = new JSDOM(htmlTable);
  const doc = dom.window.document;
  const table = doc.querySelector('table');
  const headers = Array.from(table.querySelectorAll('thead th')).map(th=>th.textContent.trim());
  if (!headers.length){
    const firstRow = table.querySelector('tr');
    if (!firstRow) return [];
    headers.push(...Array.from(firstRow.querySelectorAll('td,th')).map((n,i)=>n.textContent.trim() || ('col'+i)));
  }
  const rows = Array.from(table.querySelectorAll('tr')).slice(headers.length?1:0);
  const data = rows.map(r=>{
    const cells = Array.from(r.querySelectorAll('td'));
    const row = {};
    headers.forEach((h,i)=> row[h] = (cells[i] ? cells[i].textContent.trim() : null));
    return row;
  }).filter(r=>Object.keys(r).length>0);
  // convert numeric strings
  return data.map(row=>{
    const out = {};
    for (const k of Object.keys(row)){
      const v = row[k];
      const num = v && v.replace(/[, ]+/g,'').match(/^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/);
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
  findSubmitUrl, extractAtobBase64, findLikelyFileLinks, downloadFile,
  detectFileType, sumNumbersNearWord, extractTablesFromHtml, htmlTableToJson,
  pickColumnName, stripHtml
};
