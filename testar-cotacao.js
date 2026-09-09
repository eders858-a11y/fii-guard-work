async function run(){ const r = await fetch("https://brapi.dev/api/quote/VGIR11?token=fZh138TebUi2JYGBJG75C6"); console.log("Status Cotação:", r.status, await r.text()); } run();
