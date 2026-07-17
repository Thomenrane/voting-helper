/**
 * Test support — builds a minimal valid multi-page PDF in memory
 * (uncompressed streams, correct xref offsets) so pdf.js-based extraction is
 * tested offline without depending on gitignored snapshot binaries.
 */
export function minimalPdf(pagesText: string[]): Uint8Array {
  const n = pagesText.length;
  const fontObj = 3 + 2 * n;
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pagesText.map((_, i) => `${3 + i} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  for (let i = 0; i < n; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${3 + n + i} 0 R ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`,
    );
  }
  for (const text of pagesText) {
    const escaped = text.replace(/[\\()]/g, (c) => `\\${c}`);
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((content, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
