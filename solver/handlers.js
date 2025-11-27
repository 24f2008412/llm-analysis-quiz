// solver/handlers.js
const Papa = require('papaparse');
const axios = require('axios');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const utils = require('./utils');

// ===================================================
// MASTER HANDLER
// ===================================================
async function handle(task, meta){
  const { html, innerText } = task;

  let submitUrl = utils.findSubmitUrl(html, innerText);
  if (!submitUrl){
    console.warn('❗ No submit URL found in HTML.');
    return null;
  }

  submitUrl = utils.cleanUrl(submitUrl);

  if (submitUrl.startsWith("/")){
    submitUrl = utils.normalizeUrl(submitUrl, task.url);
  }

  if (!submitUrl || !submitUrl.startsWith("http")){
    console.warn('❗ submit URL still bad after cleaning:', submitUrl);
    return null;
  }

  const lower = innerText.toLowerCase();

  // ----------------------------------------------------
  // Handle JSON encoded in base64 via atob("...")
  // ----------------------------------------------------
  const base64 = utils.extractAtobBase64(html);
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      const match = decoded.match(/\{[\s\S]*\}/m);
      if (match){
        const json = JSON.parse(match[0]);
        if (typeof json.answer !== 'undefined'){
          return { submitUrl, payload: { ...meta, url: task.url, answer: json.answer }};
        }
      }
    } catch (err) {
      console.warn("Failed to extract atob JSON:", err.message);
    }
  }

  // ----------------------------------------------------
  // File links: CSV / XLS / XLSX / PDF / ZIP
  // ----------------------------------------------------
  const fileLinks = utils.findLikelyFileLinks(html, task.url);
  if (fileLinks.length) {
    for (const link of fileLinks){
      try{
        const file = await utils.downloadFile(link);
        const type = await utils.detectFileType(file.buffer);

        // ---------- PDF ----------
        if (type && type.mime === 'application/pdf'){
          const data = await pdf(file.buffer);
          const sum = utils.sumNumbersNearWord(data.text, 'value');
          if (sum !== null){
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

        // ---------- CSV ----------
        if (type && (type.ext === 'csv' || link.toLowerCase().endsWith('.csv'))){
          const parsed = Papa.parse(file.buffer.toString('utf8'), { header: true, dynamicTyping: true }).data;
          const col = utils.pickColumnName(parsed[0], ['value','amount','total','price']);
          if (col){
            const sum = parsed.reduce((s,row)=> s + (Number(row[col])||0), 0);
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

        // ---------- XLSX / XLS ----------
        if (type && (type.ext === 'xlsx' || link.toLowerCase().match(/\.xlsx?$/))){
          const wb = XLSX.read(file.buffer, { type: 'buffer' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

          const col = utils.pickColumnName(rows[0], ['value','amount','total','price']);
          if (col){
            const sum = rows.reduce((s,row)=> s + (Number(row[col])||0), 0);
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

      }catch(err){
        console.warn("❗ File processing failed:", link, err.message);
      }
    }
  }

  // ----------------------------------------------------
  // Table in HTML
  // ----------------------------------------------------
  if (lower.includes('sum') && lower.includes('value')){
    const tables = utils.extractTablesFromHtml(html);
    for (const t of tables){
      try{
        const parsed = utils.htmlTableToJson(t);
        const col = utils.pickColumnName(parsed[0], ['value','amount','total','price']);
        if (col){
          const sum = parsed.reduce((s,row)=> s + (Number(row[col])||0), 0);
          return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
        }
      }catch(err){
        console.warn("HTML table parse error:", err.message);
      }
    }
  }

  // ----------------------------------------------------
  // Inline text pattern: "Answer: 123"
  // ----------------------------------------------------
  const ansMatch = innerText.match(/answer[:\s]+([-\d\.eE]+)/i);
  if (ansMatch){
    return { submitUrl, payload: { ...meta, url: task.url, answer: Number(ansMatch[1]) }};
  }

  return { submitUrl, payload: { ...meta, url: task.url, answer: "no-solution-found" }};
}

// ===================================================
// FIXED submit function
// ===================================================
async function submitAnswer(url, payload){
  url = utils.cleanUrl(url);
  if (!url.startsWith("http")){
    console.error("Invalid URL to submit:", url);
    return null;
  }

  try{
    console.log("👉 Posting answer to:", url);
    const r = await axios.post(url, payload, {
      headers: {"Content-Type":"application/json"},
      timeout: 30000
    });
    return r;
  }catch(err){
    console.error("submitAnswer error:", err.message);
    return null;
  }
}

module.exports = { handle, submitAnswer };
