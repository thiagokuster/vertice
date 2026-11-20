export function parseCsv(input: string) {
  const text = input.replace(/^\uFEFF/, "");
  const headerLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

const HEADERS: Record<string, string> = {
  sku: "sku",
  nome: "name",
  name: "name",
  categoria: "category",
  category: "category",
  unidade: "unit",
  unit: "unit",
  codigo_barras: "barcode",
  codigo_de_barras: "barcode",
  barcode: "barcode",
  descricao: "description",
  description: "description",
  fornecedor: "supplier",
  supplier: "supplier",
  minimo: "min",
  min: "min",
  maximo: "max",
  max: "max",
  custo: "cost",
  preco: "price",
  price: "price",
  localizacao: "location",
  location: "location",
  controla_validade: "expiry",
  validade: "expiry",
};

export type ProductCsvRow = {
  line: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  barcode: string;
  description: string;
  supplier: string;
  min: string;
  max: string;
  cost: string;
  price: string;
  location: string;
  expiry: string;
};

function headerKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return HEADERS[normalized] ?? "";
}

export function parseProductCsv(input: string) {
  const table = parseCsv(input);
  if (table.length < 2) return { rows: [] as ProductCsvRow[], fields: [] as string[], error: "O arquivo precisa de um cabeçalho e ao menos um produto." };
  const columns = table[0].map(headerKey);
  const fields = [...new Set(columns.filter((key) => key))];
  if (!fields.includes("sku") || !fields.includes("name") || !fields.includes("category")) {
    return { rows: [] as ProductCsvRow[], fields, error: "O cabeçalho precisa ter sku, nome e categoria." };
  }
  const rows = table.slice(1).map((cells, index) => {
    const record: Record<string, string> = {};
    columns.forEach((key, cellIndex) => {
      if (key) record[key] = cells[cellIndex] ?? "";
    });
    return {
      line: index + 2,
      sku: record.sku ?? "",
      name: record.name ?? "",
      category: record.category ?? "",
      unit: record.unit ?? "",
      barcode: record.barcode ?? "",
      description: record.description ?? "",
      supplier: record.supplier ?? "",
      min: record.min ?? "",
      max: record.max ?? "",
      cost: record.cost ?? "",
      price: record.price ?? "",
      location: record.location ?? "",
      expiry: record.expiry ?? "",
    };
  });
  return { rows, fields, error: null as string | null };
}
