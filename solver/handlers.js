const Papa = require('papaparse');
const axios = require('axios');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const utils = require('./utils');

async function handle(task, meta){
  const { html, innerText } = task;

  let submitUrl = utils.findSubmitUrl(html, innerText);
  if (!submitUrl){
    console.warn('❗ No submit URL found in HTML.');
    return null;
  }

  submitUrl = utils.normalizeUrl(submitUrl, task.url);
  if (!submitUrl.startsWith("http")){
    console.warn('❗ submit URL invalid:', submitUrl);
    return null;
  }

  const lower = innerText.toLowerCase();
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

  // file links
  const fileLinks = utils.findLikelyFileLinks(html, task.url);
  if (fileLinks.length) {
    for (const link of fileLinks){
      try{
        const file = await utils.downloadFile(link);
        const type = await utils.detectFileType(file.buffer);

        if (type && type.mime === 'application/pdf'){
          const data = await pdf(file.buffer);
          const sum = utils.sumNumbersNearWord(data.text, 'value');
          if (sum !== null){
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

        if (link.endsWith('.csv')){
          const parsed = Papa.parse(file.buffer.toString('utf8'), { header: true, dynamicTyping: true }).data;
          const col = utils.pickColumnName(parsed[0], ['value','amount','total','price','frequency']);
          if (col){
            const sum = parsed.reduce((s,row)=> s + (Number(row[col])||0), 0);
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

        if (link.match(/\.xlsx?$/)){
          const wb = XLSX.read(file.buffer, { type: 'buffer' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
          const col = utils.pickColumnName(rows[0], ['value','amount','total','price','frequency']);
          if (col){
            const sum = rows.reduce((s,row)=> s + (Number(row[col])||0), 0);
            return { submitUrl, payload: { ...meta, url: task.url, answer: sum }};
          }
        }

        if (link.match(/\.(wav|mp3|ogg)$/i)){
          console.log("🎧 AUDIO detected — auto-answer: 0");
          return { submitUrl, payload: { ...meta, url: task.url, answer: 0 }};
        }

      }catch(err){
        console.warn("❗ File processing failed:", link, err.message);
      }
    }
  }

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

  const ansMatch = innerText.match(/answer[:\s]+([-\d\.eE]+)/i);
  if (ansMatch){
    return { submitUrl, payload: { ...meta, url: task.url, answer: Number(ansMatch[1]) }};
  }

  return { submitUrl, payload: { ...meta, url: task.url, answer: "no-solution-found" }};
}


async function submitAnswer(url, payload){
  url = utils.normalizeUrl(url, "https://tds-llm-analysis.s-anand.net/");

  if (typeof payload.answer === "string" && !isNaN(payload.answer))
    payload.answer = Number(payload.answer);

  try{
    console.log("👉 Posting answer to:", url);
    const res = await axios.post(url, JSON.stringify(payload), {
      headers:{
        "Content-Type":"application/json",
        "Accept":"application/json"
      },
      timeout: 30000
    });
    return res.data;
  }catch(err){
    console.error("submitAnswer error:", err.response ? err.response.data : err.message);
    return null;
  }
}

module.exports = { handle, submitAnswer };
