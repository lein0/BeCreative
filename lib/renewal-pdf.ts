function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, width = 90) {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw) {
      lines.push("");
      continue;
    }
    let rest = raw;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut < 24) cut = width;
      lines.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }
  return lines;
}

/** A small text PDF so membership terms can be downloaded without another service. */
export function textPdf(title: string, body: string) {
  const lines = wrap(`${title}\n\n${body}`);
  const pageSize = 46;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += pageSize) pages.push(lines.slice(index, index + pageSize));
  if (!pages.length) pages.push([""]);

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3 + pages.length * 2;
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  let nextId = 3;
  for (const page of pages) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    const commands = ["BT", "/F1 11 Tf", "54 740 Td", "14 TL"];
    page.forEach((line, index) => {
      if (index === 0) commands.push(`(${escapePdf(line)}) Tj`);
      else commands.push(`(${escapePdf(line)}) '`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects.splice(1, 0, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
