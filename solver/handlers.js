// solver/handlers.js
const Papa = require('papaparse');
const axios = require('axios');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const utils = require('./utils');

// Generic handler: tries to find instructions and a submit URL
async function handle(task, meta){
  const { html, innerText } = task;
  // 1) Find submit URL in page (the page includes it per quiz spec)
  const submitUrl = utils.findSubmitUrl(html, innerText);
  if (!submitUrl) {
    console.warn('No submit URL found');
    return null;
  }

  // 2) Parse obvious tasks using heuristic patterns
  // Common patterns: "What is the sum of the \"value\" column in the table on page 2?"
  const lower = innerText.toLowerCase();

  // If page contains a base64-encoded payload in atob (like sample), decode if present
  const base64 = utils.extractAtobBase64(html);
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      console.log('Found decoded payload (len', decoded.length, ')');
      // The sample payload contains a JSON with answer and url; if it contains "answer" use it
      if (decoded.includes('"answer"')){
        const match = decoded.match(/\{[\s\S]*\}/m);
        if (match) {
          const json = JSON.parse(match[0]);
          // If this sample JSON contains an 'answer' field, submit it.
          if (typeof json.answer !== 'undefined'){
            const payload = Object.assign({}, meta, { url: task.url, answer: json.answer });
            return { submitUrl, payload };
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse atob payload', e.message);
    }
  }

  // CSV/Excel/PDF file link present? Try to find and download
  const fileLinks = utils.findLikelyFileLinks(html, task.url);
  if (fileLinks.length) {
    console.log('Found file links:', fileLinks);
    for (const link of fileLinks) {
      try {
        const file = await utils.downloadFile(link);
        const type = await utils.detectFileType(file.buffer);
        console.log('Downloaded', link, 'detected-type', type);
        if (type && type.mime === 'application/pdf') {
          const data = await pdf(file.buffer);
          // Simple heuristic: find numbers after the word "value" or parse tables in PDFs
          const sum = utils.sumNumbersNearWord(data.text, 'value');
          if (sum !== null) {
            const payload = Object.assign({}, meta, { url: task.url, answer: sum });
            return { submitUrl, payload };
          }
        }
        if (type && (type.ext === 'csv' || link.toLowerCase().endsWith('.csv'))) {
          const csv = file.buffer.toString('utf8');
          const parsed = Papa.parse(csv, { header: true, dynamicTyping: true }).data;
          // if question asks for sum of column "value" or similar
          const col = utils.pickColumnName(parsed[0], ['value','amount','total','price']);
          if (col) {
            const sum = parsed.reduce((s,row)=> s + (Number(row[col])||0), 0);
            const payload = Object.assign({}, meta, { url: task.url, answer: sum });
            return { submitUrl, payload };
          }
        }
        if (type && (type.ext === 'xlsx' || link.toLowerCase().match(/\.xlsx?$/))) {
          const wb = XLSX.read(file.buffer, { type: 'buffer' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
          const col = utils.pickColumnName(json[0], ['value','amount','total','price']);
          if (col) {
            const sum = json.reduce((s,row)=> s + (Number(row[col])||0), 0);
            const payload = Object.assign({}, meta, { url: task.url, answer: sum });
            return { submitUrl, payload };
          }
        }
      } catch (err) {
        console.warn('File processing failed for', link, err.message);
      }
    }
  }

  // Heuristic: if the text asks for a sum of a column, try to find table in DOM
  if (lower.includes('sum') || lower.includes('sum of')){
    // Attempt to extract HTML table(s)
    const tables = utils.extractTablesFromHtml(html);
    for (const table of tables){
      const parsed = utils.htmlTableToJson(table);
      const col = utils.pickColumnName(parsed[0], ['value','amount','total','price']);
      if (col) {
        const sum = parsed.reduce((s,row)=> s + (Number(row[col])||0), 0);
        const payload = Object.assign({}, meta, { url: task.url, answer: sum });
        return { submitUrl, payload };
      }
    }
  }

  // If none matched: fallback to text answer extraction using simple heuristics
  // e.g., look for a line that says "Answer: 12345"
  const ansMatch = innerText.match(/answer[:\s]+([-\d\.eE]+)/i);
  if (ansMatch) {
    const payload = Object.assign({}, meta, { url: task.url, answer: Number(ansMatch[1]) });
    return { submitUrl, payload };
  }

  // Last resort: send a simple string with the page title (so we always provide something)
  return { submitUrl, payload: Object.assign({}, meta, { url: task.url, answer: "no-solution-found" }) };
}

async function submitAnswer(url, payload) {
  try {
    const r = await axios.post(url, payload, { timeout: 30_000 });
    return r;
  } catch (err) {
    console.error('submitAnswer error', err.message || err);
    return null;
  }
}

module.exports = { handle, submitAnswer };
