export type StatementFrequency = "monthly" | "quarterly" | "annual";
export type StatementFormat = "pdf" | "csv" | "xlsx";

export type StatementLine = {
  date: string;
  dsp: string;
  releaseTitle?: string | null;
  trackTitle?: string | null;
  units: number;
  grossAmount: string;
  splitPercentage: string;
  netAmount: string;
};

export type StatementDocument = {
  format: StatementFormat;
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type StatementInput = {
  statementId: string;
  userName: string;
  frequency: StatementFrequency;
  periodStart: string;
  periodEnd: string;
  currency: string;
  lines: StatementLine[];
};

export class RoyaltyStatementGenerator {
  generate(input: StatementInput, format: StatementFormat): StatementDocument {
    if (format === "csv") return this.generateCsv(input);
    if (format === "xlsx") return this.generateXlsx(input);
    return this.generatePdf(input);
  }

  private generateCsv(input: StatementInput): StatementDocument {
    const header = ["Date", "DSP", "Release", "Track", "Units", "Gross", "Split %", "Net"];
    const rows = input.lines.map((line) => [
      line.date,
      line.dsp,
      line.releaseTitle ?? "",
      line.trackTitle ?? "",
      String(line.units),
      line.grossAmount,
      line.splitPercentage,
      line.netAmount,
    ]);
    return {
      format: "csv",
      fileName: `${input.statementId}.csv`,
      mimeType: "text/csv",
      content: Buffer.from([header, ...rows].map(csvRow).join("\n")),
    };
  }

  private generateXlsx(input: StatementInput): StatementDocument {
    const rows = [
      ["Date", "DSP", "Release", "Track", "Units", "Gross", "Split %", "Net"],
      ...input.lines.map((line) => [
        line.date,
        line.dsp,
        line.releaseTitle ?? "",
        line.trackTitle ?? "",
        String(line.units),
        line.grossAmount,
        line.splitPercentage,
        line.netAmount,
      ]),
    ];
    return {
      format: "xlsx",
      fileName: `${input.statementId}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: createXlsx(rows),
    };
  }

  private generatePdf(input: StatementInput): StatementDocument {
    const total = input.lines.reduce((sum, line) => sum + Number(line.netAmount || 0), 0);
    const lines = [
      "TrackSyra Royalty Statement",
      `Statement: ${input.statementId}`,
      `Payee: ${input.userName}`,
      `Period: ${input.periodStart} to ${input.periodEnd}`,
      `Frequency: ${input.frequency}`,
      `Currency: ${input.currency}`,
      `Net payable: ${total.toFixed(2)}`,
      "",
      ...input.lines.map((line) => `${line.date} ${line.dsp} ${line.trackTitle ?? line.releaseTitle ?? "Catalog"} ${line.netAmount}`),
    ];
    return {
      format: "pdf",
      fileName: `${input.statementId}.pdf`,
      mimeType: "application/pdf",
      content: createPdf(lines),
    };
  }
}

function csvRow(cells: string[]) {
  return cells.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",");
}

function createPdf(lines: string[]): Buffer {
  const escapedLines = lines.slice(0, 42).map((line) => escapePdfText(line));
  const textCommands = ["BT", "/F1 11 Tf", "50 790 Td"];
  escapedLines.forEach((line, index) => {
    if (index > 0) textCommands.push("0 -16 Td");
    textCommands.push(`(${line}) Tj`);
  });
  textCommands.push("ET");
  const stream = textCommands.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createXlsx(rows: string[][]): Buffer {
  const files = new Map<string, Buffer>([
    ["[Content_Types].xml", xmlBuffer(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)],
    ["_rels/.rels", xmlBuffer(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)],
    ["xl/workbook.xml", xmlBuffer(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Royalty Statement" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)],
    ["xl/_rels/workbook.xml.rels", xmlBuffer(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)],
    ["xl/worksheets/sheet1.xml", xmlBuffer(createWorksheet(rows))],
  ]);
  return zipStore(files);
}

function createWorksheet(rows: string[][]): string {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function columnName(index: number): string {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function xmlBuffer(value: string): Buffer {
  return Buffer.from(value.trim(), "utf8");
}

function escapeXml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function zipStore(files: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + content.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
