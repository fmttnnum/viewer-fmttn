/* tools/extract-links.js
   Usage (Windows):
     node tools/extract-links.js "C:\\Users\\MP Lacroix\\Documents\\Projets\\viewer-fmttn\\public\\refFMTTN.pdf" > "public\\links.json"
*/
const fs = require('fs');

function resolvePdfjs() {
  const candidates = [
    'pdfjs-dist/build/pdf.js',        // v4 standard
    'pdfjs-dist',                     // parfois ré-exporte getDocument
    'pdfjs-dist/legacy/build/pdf.js'  // fallback legacy
  ];
  for (const id of candidates) {
    try {
      let lib = require(id);
      if (lib && !lib.getDocument && lib.default) lib = lib.default;
      if (lib && typeof lib.getDocument === 'function') {
        console.log(`[extract-links] pdfjs chargé via: ${id}`);
        return lib;
      }
    } catch (_) { /* essaie le suivant */ }
  }
  console.error('❌ Impossible de charger pdfjs-dist. Exécute: npm i pdfjs-dist');
  process.exit(1);
}

const pdfjsLib = resolvePdfjs();

(async () => {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node tools/extract-links.js <file.pdf>');
    process.exit(1);
  }

  const data = new Uint8Array(fs.readFileSync(input));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  console.log('[extract-links] pages =', pdf.numPages);

  const out = {};
  const N = pdf.numPages;

  for (let i = 1; i <= N; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 }); // width/height avec rotation
    const annots = await page.getAnnotations({ intent: 'display' });

    const list = [];
    for (const a of annots) {
      if (a.subtype !== 'Link' || !a.rect || a.rect.length !== 4) continue;

      // a.rect = [x1,y1,x2,y2] en points PDF (origine bas-gauche)
      const [x1, y1, x2, y2] = a.rect;
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      // PDF → % CSS (origine CSS en haut-gauche ⇒ inversion Y)
      const xPct = (x / vp.width) * 100;
      const yPct = ((vp.height - (y + h)) / vp.height) * 100;
      const wPct = (w / vp.width) * 100;
      const hPct = (h / vp.height) * 100;

      const title = a.title || a.contents || undefined;

      if (a.url) {
        // Lien externe
        list.push({
          kind: 'external',
          href: a.url,
          xPct: +xPct.toFixed(3),
          yPct: +yPct.toFixed(3),
          wPct: +wPct.toFixed(3),
          hPct: +hPct.toFixed(3),
          title
        });
        continue;
      }

      // Lien interne (GoTo page)
      let gotoPage = null;
      try {
        if (a.dest) {
          const dest = await pdf.getDestination(a.dest);
          if (dest && dest[0]) {
            const pageIndex = await pdf.getPageIndex(dest[0]);
            gotoPage = pageIndex + 1; // 1-based
          }
        }
      } catch { /* ignore si non résolu */ }

      if (gotoPage) {
        list.push({
          kind: 'internal',
          gotoPage,
          xPct: +xPct.toFixed(3),
          yPct: +yPct.toFixed(3),
          wPct: +wPct.toFixed(3),
          hPct: +hPct.toFixed(3),
          title
        });
      }
    }

    console.log(`[extract-links] page ${i}: liens trouvés =`, list.length);
    if (list.length) out[String(i)] = list;
  }

  console.log('[extract-links] terminé.');
  process.stdout.write(JSON.stringify(out, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
