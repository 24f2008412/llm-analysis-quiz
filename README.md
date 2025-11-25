# LLM Analysis Quiz 

This repository provides a working API endpoint and solver for the LLM Analysis Quiz.

## Files
- server.js - Express endpoint that validates secret and invokes solver
- solver/ - Puppeteer-based solver + handlers for CSV/XLSX/PDF/HTML table parsing
- package.json, .env.example, Dockerfile, LICENSE, tests/demo-request.json

## Setup
1. Copy files into a directory.
2. Create `.env` from `.env.example` and set SECRET.
3. `npm install`
4. `npm start`

## Test
Use the provided demo endpoint:
`curl -X POST http://localhost:3000/api/quiz-webhook -H "Content-Type: application/json" -d @tests/demo-request.json`

Set SECRET in .env to match the JSON secret to receive 200.

## Deployment
Deploy to Render, Heroku, or any Node hosting. Ensure SECRET env var is set and service is HTTPS.
