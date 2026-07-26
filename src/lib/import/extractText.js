// The ONLY impure edge of the import pipeline: PDF bytes → text. Everything downstream
// (detectBank, the adapters, suggestWallet, dedupe) is pure and unit-tested.
//
// Worker wiring (docs/pdfjs-research-notes.md §2): pdf.js ships its worker as a plain .mjs
// that no bundler auto-wires, so `GlobalWorkerOptions.workerSrc` must be set by hand. The
// `?url` import lives HERE, in our own source, because Vite cannot resolve a `?url` import
// written inside a third-party module (vitejs/vite#10837). Do NOT replace this with
// `new URL('pdfjs-dist/...', import.meta.url)` — Vite only special-cases static RELATIVE
// paths, so that form appears to work in dev and breaks in the production build.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { itemsToLines } from './textLayout.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * @param {File|Blob} file
 * @returns {Promise<{ text: string, lines: Array<{y:number,text:string,cells:object[]}>, pageCount: number }>}
 * @throws {Error} with a user-facing message for encrypted / unreadable PDFs
 */
export async function extractText(file) {
  const buffer = await file.arrayBuffer()

  // Cleanup goes through the LOADING TASK, not the document: pdf.js v6 removed
  // PDFDocumentProxy.prototype.destroy, so doc.destroy() throws at runtime.
  let loadingTask
  let doc
  try {
    loadingTask = pdfjsLib.getDocument({
      // pdf.js TRANSFERS this buffer to the worker and detaches it, so the copy matters:
      // without it a retry on the same File object would see an empty buffer.
      data: new Uint8Array(buffer.slice(0)),
      // Text extraction never decodes JPEG2000/JBIG2 images, so the wasm decoders are dead
      // weight here — off by default avoids shipping ~900 KB of .wasm assets entirely.
      useWasm: false,
      isEvalSupported: false,
    })
    doc = await loadingTask.promise
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error('This PDF is password-protected and cannot be read.', { cause: err })
    }
    throw new Error('This file could not be read as a PDF.', { cause: err })
  }

  try {
    const lines = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const { items } = await page.getTextContent()
      lines.push(...itemsToLines(items))
      page.cleanup()
    }

    return {
      text: lines.map(l => l.text).join('\n'),
      lines,
      pageCount: doc.numPages,
    }
  } finally {
    await loadingTask.destroy()
  }
}
