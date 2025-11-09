"use client";

import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import * as pdfjsViewer from "pdfjs-dist/web/pdf_viewer.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Pg = {
  baseCanvas: HTMLCanvasElement;
  ann: HTMLDivElement;
  text: HTMLDivElement;
  w: number;
  h: number;
};

export default function Page() {
  const [pages, setPages] = useState<Pg[]>([]);
  const basePdfUrl = "/docs/monDoc_base.pdf";
  const SCALE = 1.8;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const basePDF = await pdfjsLib.getDocument(basePdfUrl).promise;
      const linkService = new pdfjsViewer.SimpleLinkService();
      const out: Pg[] = [];

      for (let i = 1; i <= basePDF.numPages; i++) {
        const page = await basePDF.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });

        // rendu base
        const baseCanvas = document.createElement("canvas");
        baseCanvas.width = viewport.width;
        baseCanvas.height = viewport.height;
        const ctx = baseCanvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // calques (v4 builders) — sans AnnotationStorage
        const ann = document.createElement("div");
        ann.className = "annotationLayer";

        const text = document.createElement("div");
        text.className = "textLayer";

        // AnnotationLayerBuilder
        const annBuilder = new pdfjsViewer.AnnotationLayerBuilder({
          pageDiv: ann,
          pdfPage: page,
          renderForms: false,
          linkService,
          enableScripting: false,
        });
        annBuilder.render(viewport, "display");

        // TextLayerBuilder
        const textBuilder = new pdfjsViewer.TextLayerBuilder({
          textLayerDiv: text,
          pageIndex: i - 1,
          viewport,
          findController: null,
          enhanced: true,
        });
        textBuilder.setTextContent(await page.getTextContent());
        textBuilder.render();

        out.push({ baseCanvas, ann, text, w: viewport.width, h: viewport.height });
        if (cancelled) return;
      }

      if (!cancelled) setPages(out);
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pdfScrollWrap">
      <div className="toolbar"><b>Viewer</b> — défilement vertical</div>
      {pages.map((p, i) => (
        <div key={i} className="pageShell" style={{ width: p.w }}>
          <div className="pageBadge">Page {i+1}</div>
          <div style={{ position:"relative", width: p.w, height: p.h }}>
            <canvas ref={(el)=>{ if (el && el !== p.baseCanvas) el.replaceWith(p.baseCanvas); }} />
cd "C:\Users\MP Lacroix\Documents\Projets\viewer-fmttn"

@'
"use client";

import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Pg = { canvas: HTMLCanvasElement; w: number; h: number };

export default function Page() {
  const [pages, setPages] = useState<Pg[]>([]);
  const basePdfUrl = "/docs/monDoc_base.pdf";
  const SCALE = 1.8; // qualité nette

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = await pdfjsLib.getDocument(basePdfUrl).promise;
      const out: Pg[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        out.push({ canvas, w: viewport.width, h: viewport.height });
        if (cancelled) return;
      }
      if (!cancelled) setPages(out);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pdfScrollWrap">
      <div className="toolbar"><b>Viewer minimal</b> — défilement vertical (qualité nette)</div>
      {pages.map((p, i) => (
        <div key={i} className="pageShell" style={{ width: p.w }}>
          <div className="pageBadge">Page {i+1}</div>
          <div style={{ position:"relative", width: p.w, height: p.h }}>
            <canvas ref={(el)=>{ if (el && el !== p.canvas) el.replaceWith(p.canvas); }} />
          </div>
        </div>
      ))}
    </div>
  );
}
