const fs = require("node:fs");
const path = require("node:path");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const chromiumModule = require("@sparticuz/chromium");
const chromium = chromiumModule.default || chromiumModule;
const puppeteer = require("puppeteer-core");

const REGION = "asia-south1";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "travelog-itinerary";
const HTML_PATH = path.join(__dirname, "runtime", "Itinerary-Builder.html");
const QUOTE_ID_PATTERN = /^[A-Za-z0-9_-]{3,160}$/;
const PDF_CACHE_COLLECTION = "sharedPdfCache";
const PDF_CACHE_CHUNK_BYTES = 700 * 1024;

if (!getApps().length) initializeApp();

const firstQueryValue = value => Array.isArray(value) ? value[0] : String(value || "");

const escapeHtmlAttribute = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const safeFilePart = value => String(value || "Itinerary")
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 120) || "Itinerary";

const safeCachePart = value => String(value || "")
  .replace(/[^A-Za-z0-9_-]/g, "")
  .slice(0, 80);

const sendPdf = (res, pdf, name) => {
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `attachment; filename="${name}.pdf"`);
  res.set("Content-Length", String(pdf.length));
  res.status(200).send(Buffer.from(pdf));
};

const pdfCacheRef = (quoteId, version) => getFirestore()
  .collection(PDF_CACHE_COLLECTION)
  .doc(`${quoteId}_${version}`);

const readCachedPdf = async (quoteId, version) => {
  const cacheRef = pdfCacheRef(quoteId, version);
  const manifest = await cacheRef.get();
  if (!manifest.exists) return null;
  const chunkCount = Number(manifest.data()?.chunkCount || 0);
  if (!chunkCount) return null;
  const chunks = await Promise.all(Array.from({ length: chunkCount }, (_, index) => (
    cacheRef.collection("parts").doc(String(index).padStart(4, "0")).get()
  )));
  if (chunks.some(chunk => !chunk.exists)) return null;
  return Buffer.concat(chunks.map(chunk => {
    const value = chunk.data()?.data;
    if (Buffer.isBuffer(value)) return value;
    if (value?.toUint8Array) return Buffer.from(value.toUint8Array());
    return Buffer.from(value || []);
  }));
};

const writeCachedPdf = async (quoteId, version, pdf) => {
  const db = getFirestore();
  const cacheRef = pdfCacheRef(quoteId, version);
  const chunks = [];
  for (let offset = 0; offset < pdf.length; offset += PDF_CACHE_CHUNK_BYTES) {
    chunks.push(pdf.subarray(offset, offset + PDF_CACHE_CHUNK_BYTES));
  }
  const batch = db.batch();
  batch.set(cacheRef, {
    quoteId,
    version,
    chunkCount: chunks.length,
    size: pdf.length,
    createdAt: new Date().toISOString()
  });
  chunks.forEach((chunk, index) => {
    batch.set(cacheRef.collection("parts").doc(String(index).padStart(4, "0")), { data: chunk });
  });
  await batch.commit();

  const stale = await db.collection(PDF_CACHE_COLLECTION).where("quoteId", "==", quoteId).get();
  await Promise.all(stale.docs.filter(doc => doc.id !== cacheRef.id).map(async doc => {
    const staleBatch = db.batch();
    const count = Number(doc.data()?.chunkCount || 0);
    for (let index = 0; index < count; index += 1) {
      staleBatch.delete(doc.ref.collection("parts").doc(String(index).padStart(4, "0")));
    }
    staleBatch.delete(doc.ref);
    await staleBatch.commit();
  }));
};

const functionUrl = (name, req) => {
  const host = String(req.get("host") || "");
  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)) {
    return `${req.protocol}://${host}/${PROJECT_ID}/${REGION}/${name}`;
  }
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
};

const injectBackendMeta = (html, req) => {
  const customerName = firstQueryValue(req.query.name).trim();
  const itineraryCode = firstQueryValue(req.query.code).trim();
  const shareTitle = [customerName, itineraryCode].filter(Boolean).join(" - ") || "Travel Itinerary Proposal";
  const escapedShareTitle = escapeHtmlAttribute(shareTitle);
  const tags = [
    `<meta name="itinerary-share-preview-endpoint" content="${escapeHtmlAttribute(functionUrl("sharePreview", req))}">`,
    `<meta name="itinerary-pdf-download-endpoint" content="${escapeHtmlAttribute(functionUrl("downloadPdf", req))}">`
  ].join("\n  ");
  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapedShareTitle}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/i, `$1${escapedShareTitle}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/i, `$1${escapedShareTitle}$2`)
    .replace("</head>", `  ${tags}\n</head>`);
};

const customerHeaders = res => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "SAMEORIGIN");
};

exports.sharePreview = onRequest({
  region: REGION,
  invoker: "public",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 20,
  cors: false
}, (req, res) => {
  customerHeaders(res);
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const quoteId = firstQueryValue(req.query.quote);
  if (!QUOTE_ID_PATTERN.test(quoteId)) {
    res.status(400).send("Invalid itinerary link");
    return;
  }

  try {
    const html = injectBackendMeta(fs.readFileSync(HTML_PATH, "utf8"), req);
    res.type("html").send(html);
  } catch (error) {
    console.error("Unable to serve itinerary preview", error);
    res.status(500).send("Itinerary preview is temporarily unavailable");
  }
});

const localBrowserExecutable = () => {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || "";
};

const launchPdfBrowser = async () => {
  if (process.platform === "linux") {
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: { width: 980, height: 1200, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: "shell"
    });
  }

  const executablePath = localBrowserExecutable();
  if (!executablePath) throw new Error("Chrome or Edge is required for local PDF testing");
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 980, height: 1200, deviceScaleFactor: 1 }
  });
};

exports.downloadPdf = onRequest({
  region: REGION,
  invoker: "public",
  timeoutSeconds: 120,
  memory: "2GiB",
  maxInstances: 4,
  concurrency: 1,
  cors: false
}, async (req, res) => {
  customerHeaders(res);
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const quoteId = firstQueryValue(req.query.quote);
  if (!QUOTE_ID_PATTERN.test(quoteId)) {
    res.status(400).send("Invalid itinerary link");
    return;
  }

  const name = safeFilePart(firstQueryValue(req.query.code) || firstQueryValue(req.query.name));
  const cacheVersion = safeCachePart(firstQueryValue(req.query.v));
  const prepareOnly = firstQueryValue(req.query.prepare) === "1";

  if (cacheVersion) {
    try {
      const cachedPdf = await readCachedPdf(quoteId, cacheVersion);
      if (cachedPdf) {
        if (prepareOnly) {
          res.status(204).send();
          return;
        }
        sendPdf(res, cachedPdf, name);
        return;
      }
    } catch (error) {
      console.warn("PDF cache lookup failed; regenerating", error);
    }
  }

  const previewUrl = new URL(functionUrl("sharePreview", req));
  previewUrl.searchParams.set("quote", quoteId);
  previewUrl.searchParams.set("view", "pdf");
  previewUrl.searchParams.set("server", "1");
  if (cacheVersion) previewUrl.searchParams.set("v", cacheVersion);
  ["name", "code"].forEach(key => {
    const value = firstQueryValue(req.query[key]);
    if (value) previewUrl.searchParams.set(key, value);
  });

  let browser;
  try {
    browser = await launchPdfBrowser();
    const page = await browser.newPage();
    await page.goto(previewUrl.toString(), { waitUntil: "networkidle0", timeout: 90000 });
    await page.waitForFunction(() => (
      document.body.classList.contains("customer-pdf-mode")
      && !document.documentElement.classList.contains("customer-pdf-pending")
    ), { timeout: 90000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const images = [...document.querySelectorAll("#customerPdf img[src]")];
      await Promise.all(images.map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        })));
    });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true
    });
    const pdfBuffer = Buffer.from(pdf);
    if (cacheVersion) {
      try {
        await writeCachedPdf(quoteId, cacheVersion, pdfBuffer);
      } catch (error) {
        console.warn("PDF cache write failed; serving generated file", error);
      }
    }
    if (prepareOnly) {
      res.status(204).send();
      return;
    }
    sendPdf(res, pdfBuffer, name);
  } catch (error) {
    console.error("Server PDF generation failed", error);
    if (!res.headersSent) res.status(500).send("PDF generation failed. Please try again.");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});
