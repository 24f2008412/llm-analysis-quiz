---
title: LLM Analysis Quiz Solver
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
sdk_version: "1.0"
app_file: server.js
pinned: false
---

LLM Analysis Quiz — Hugging Face Space Deployment (Docker)
This project implements the LLM Analysis Quiz solver:

Express API /api/quiz-webhook receives quiz tasks
Validates secret
Loads the quiz page in headless Chromium (Puppeteer)
Extracts data (HTML tables, CSV, XLSX, PDF)
Computes numeric answers and submits back to provided submit URL
Follows next URLs if provided
Local development
Copy .env.example → .env and fill SECRET (local only).
Install: npm install
Run: npm start
Test with: curl -X POST http://localhost:7860/api/quiz-webhook -H "Content-Type: application/json" -d @tests/demo-request.json
Deploy on Hugging Face Spaces (Docker)
Create a Space: https://huggingface.co/spaces (choose docker SDK).
Push this repo (or upload files) — must include Dockerfile.
In Space settings → Repository secrets, add:
SECRET=llm-analysis-quiz-secret
NODE_ENV=production (Add OPENAI_API_KEY only if your solver uses OpenAI.)
Space will build (uses system Chromium). Endpoint will be: https://-llm-analysis-quiz.hf.space/api/quiz-webhook
Notes
Do not commit .env or any keys.
The Dockerfile installs system Chromium and prevents Puppeteer from downloading Chromium.
Replace <your-username> and <your-email> in the Google Form and README before submission.
