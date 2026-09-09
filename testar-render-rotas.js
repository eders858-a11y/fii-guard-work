async function run(){ const r1 = await fetch("https://fii-guard-work.onrender.com/api/proventos?ticker=VGIR11"); console.log("URL (?ticker=):", r1.status, await r1.text()); } run();
