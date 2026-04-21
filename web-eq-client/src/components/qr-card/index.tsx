import { useRef, useCallback } from "react";
// White logo is visible on the teal header background
import eqLogoWhite from "../../assets/images/white_transparent_logo.png";
import "./qr-card.scss";

export interface QRCardProps {
  qrUrl: string;
  name: string;
  meta?: string;
  badge?: string;
  hint: string;
  filename: string;
}

// 2× resolution so it looks crisp when printed
const W    = 600;
const H    = 760;
const TEAL = "#00695C";
const BRAND = "EaseQueue";
const SITE  = "app.easequeue.com";

/** Polyfill-free rounded-rect path. */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Load an image from a src and return an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(img); // resolve anyway — logo failure shouldn't block download
    img.src = src;
  });
}

async function buildBrandedPng(qrBlobUrl: string, name: string, meta?: string): Promise<string> {
  const [logoImg, qrImg] = await Promise.all([
    loadImage(eqLogoWhite),
    loadImage(qrBlobUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Teal header ───────────────────────────────────────
  const HEADER_H = 110;
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, 0, W, HEADER_H);

  // Logo (white) — drawn only if it actually loaded
  const LOGO_SIZE = 52;
  const logoX     = W / 2 - (LOGO_SIZE + 12 + 120) / 2; // "EaseQueue" ≈ 120px at 26px bold
  const logoY     = (HEADER_H - LOGO_SIZE) / 2;
  if (logoImg.width > 0) {
    ctx.drawImage(logoImg, logoX, logoY, LOGO_SIZE, LOGO_SIZE);
  }

  // Brand name
  ctx.fillStyle    = "#ffffff";
  ctx.font         = "bold 26px Inter, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.fillText(BRAND, logoX + LOGO_SIZE + 12, HEADER_H / 2);

  // ── QR code box ───────────────────────────────────────
  const QR   = 300;
  const qrX  = (W - QR) / 2;
  const qrY  = HEADER_H + 36;
  const PAD  = 16;

  // Card shadow + background
  ctx.shadowColor = "rgba(0,0,0,0.10)";
  ctx.shadowBlur  = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle   = "#f8fafc";
  rrect(ctx, qrX - PAD, qrY - PAD, QR + PAD * 2, QR + PAD * 2, 14);
  ctx.fill();

  // Border
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth   = 1.5;
  rrect(ctx, qrX - PAD, qrY - PAD, QR + PAD * 2, QR + PAD * 2, 14);
  ctx.stroke();

  // QR image
  if (qrImg.width > 0) {
    ctx.drawImage(qrImg, qrX, qrY, QR, QR);
  }

  // ── Text section ─────────────────────────────────────
  const textTop = qrY + QR + PAD + 36;
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";

  // Name
  ctx.fillStyle = "#1e293b";
  ctx.font      = "bold 22px Inter, Segoe UI, sans-serif";
  ctx.fillText(clip(name, 36), W / 2, textTop);

  // Meta
  let metaBottom = textTop;
  if (meta) {
    ctx.fillStyle = "#00695C";
    ctx.font      = "15px Inter, Segoe UI, sans-serif";
    ctx.fillText(clip(meta, 44), W / 2, textTop + 32);
    metaBottom = textTop + 32;
  }

  // CTA pill background
  const CTA_TEXT = "Scan to book an appointment";
  const ctaY     = metaBottom + 38;
  ctx.font       = "14px Inter, Segoe UI, sans-serif";
  const ctaW     = ctx.measureText(CTA_TEXT).width + 40;
  const ctaH     = 34;
  ctx.fillStyle  = "#E0F2F1";
  rrect(ctx, (W - ctaW) / 2, ctaY - ctaH + 8, ctaW, ctaH, 17);
  ctx.fill();
  ctx.fillStyle     = "#00574B";
  ctx.textBaseline  = "middle";
  ctx.fillText(CTA_TEXT, W / 2, ctaY - ctaH / 2 + 8);

  // ── Footer ────────────────────────────────────────────
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(48, H - 50);
  ctx.lineTo(W - 48, H - 50);
  ctx.stroke();

  ctx.fillStyle    = "#94a3b8";
  ctx.font         = "13px Inter, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`Powered by ${BRAND} · ${SITE}`, W / 2, H - 26);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error("Canvas export failed"));
    }, "image/png");
  });
}

export default function QRCard({ qrUrl, name, meta, badge, hint, filename }: QRCardProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const handleDownload = useCallback(async () => {
    const a = anchorRef.current;
    if (!a) return;
    try {
      const brandedUrl = await buildBrandedPng(qrUrl, name, meta);
      a.href     = brandedUrl;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(brandedUrl), 8000);
    } catch {
      // Fallback: download raw QR
      a.href     = qrUrl;
      a.download = filename;
      a.click();
    }
  }, [qrUrl, name, meta, filename]);

  const handlePrint = useCallback(() => {
    // Sanitise user-supplied strings before embedding in HTML
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));

    const html = `<!DOCTYPE html><html lang="en">
<head>
  <meta charset="utf-8">
  <title>QR Code — ${esc(name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,Segoe UI,sans-serif;background:#fff;display:flex;justify-content:center;padding:32px 16px}
    .card{width:320px;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,.10)}
    .header{background:#00695C;padding:18px 20px;text-align:center}
    .header span{color:#fff;font-size:18px;font-weight:700;letter-spacing:.01em}
    .body{padding:24px 20px;text-align:center}
    .qr-wrap{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:inline-block;margin-bottom:18px}
    .qr-wrap img{width:220px;height:220px;display:block}
    .name{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px}
    .meta{font-size:13px;color:#00695C;font-weight:600;margin-bottom:12px}
    .cta{font-size:12px;color:#00574B;background:#E0F2F1;padding:6px 16px;border-radius:20px;display:inline-block}
    .footer{padding:12px 20px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:0}.card{box-shadow:none;border:none;border-radius:0}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><span>${BRAND}</span></div>
    <div class="body">
      <div class="qr-wrap"><img src="${qrUrl}" alt="QR Code"></div>
      <div class="name">${esc(name)}</div>
      ${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
      <div class="cta">Scan to book an appointment</div>
    </div>
    <div class="footer">Powered by ${BRAND} &middot; ${SITE}</div>
  </div>
  <script>window.addEventListener('load',()=>window.print())<\/script>
</body></html>`;

    // Use a blob URL instead of document.write (avoids deprecation + CSP issues)
    const blob    = new Blob([html], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    const win     = window.open(blobUrl, "_blank", "width=520,height=680,noopener,noreferrer");
    // Revoke after the window has had time to load
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    if (!win) URL.revokeObjectURL(blobUrl); // popup blocked — clean up immediately
  }, [qrUrl, name, meta]);

  return (
    <div className="qr-card">
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: "none" }} aria-hidden />

      <div className="qr-card__layout">
        {/* QR image */}
        <div className="qr-card__image-wrap">
          <img src={qrUrl} alt={`QR code for ${name}`} className="qr-card__image" draggable={false} />
        </div>

        {/* Details */}
        <div className="qr-card__details">
          {badge && <span className="qr-card__badge">{badge}</span>}
          <h3 className="qr-card__name">{name}</h3>
          {meta && (
            <p className="qr-card__meta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              {meta}
            </p>
          )}
          <p className="qr-card__hint">{hint}</p>
          <p className="qr-card__site">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            {SITE}
          </p>
          <div className="qr-card__actions">
            <button className="btn btn-primary qr-card__btn" onClick={handleDownload}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PNG
            </button>
            <button className="btn btn-secondary qr-card__btn" onClick={handlePrint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
