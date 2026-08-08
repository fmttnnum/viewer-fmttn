"use client";

import { useEffect, useState } from "react";

type Pg = {
  baseCanvas: HTMLCanvasElement;
  ann: HTMLDivElement;
  text: HTMLDivElement;
  w: number;
  h: number;
};

type AnnotationBuilderInstance = {
  render: (viewport: unknown, intent: string) => void;
};

type TextBuilderInstance = {
  setTextContent: (content: unknown) => void;
  render: () => void;
};

export default function Page() {
  const [pages, setPages] = useState<Pg[]>([]);
  const basePdfUrl = "/docs/monDoc_base.pdf";
  const scale = 1.8;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      const pdfjsViewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const basePdf = await pdfjsLib.getDocument(basePdfUrl).promise;
      const linkService = new pdfjsViewer.SimpleLinkService();
      const output: Pg[] = [];

      for (let index = 1; index <= basePdf.numPages; index += 1) {
        const page = await basePdf.getPage(index);
        const viewport = page.getViewport({ scale });
        const baseCanvas = document.createElement("canvas");
        baseCanvas.width = viewport.width;
        baseCanvas.height = viewport.height;
        const canvasContext = baseCanvas.getContext("2d");
        if (!canvasContext) continue;

        await page.render({ canvasContext, viewport }).promise;

        const ann = document.createElement("div");
        ann.className = "annotationLayer";
        const text = document.createElement("div");
        text.className = "textLayer";

        const AnnotationLayerBuilder = pdfjsViewer.AnnotationLayerBuilder as unknown as new (
          options: Record<string, unknown>
        ) => AnnotationBuilderInstance;
        const annotationBuilder = new AnnotationLayerBuilder({
          pageDiv: ann,
          pdfPage: page,
          renderForms: false,
          linkService,
          enableScripting: false,
        });
        annotationBuilder.render(viewport, "display");

        const TextLayerBuilder = pdfjsViewer.TextLayerBuilder as unknown as new (
          options: Record<string, unknown>
        ) => TextBuilderInstance;
        const textBuilder = new TextLayerBuilder({
          textLayerDiv: text,
          pageIndex: index - 1,
          viewport,
          findController: null,
          enhanced: true,
        });
        textBuilder.setTextContent(await page.getTextContent());
        textBuilder.render();

        output.push({ baseCanvas, ann, text, w: viewport.width, h: viewport.height });
        if (cancelled) return;
      }

      if (!cancelled) setPages(output);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pdfScrollWrap">
      <div className="toolbar"><b>Viewer</b> — défilement vertical</div>
      {pages.map((page, index) => (
        <div key={index} className="pageShell" style={{ width: page.w }}>
          <div className="pageBadge">Page {index + 1}</div>
          <div style={{ position: "relative", width: page.w, height: page.h }}>
            <canvas ref={(element) => {
              if (element && element !== page.baseCanvas) element.replaceWith(page.baseCanvas);
            }} />
            <div ref={(element) => {
              if (element && page.ann.parentElement !== element) element.replaceChildren(page.ann);
            }} />
            <div ref={(element) => {
              if (element && page.text.parentElement !== element) element.replaceChildren(page.text);
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}
