// Spreadsheet-safe CSV cell: quote everything and neutralise leading formula characters.
export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function dealsToCsv(deals) {
  const header = ["Destination", "Country", "From", "Fare (MYR)", "Dates", "Trip days", "Stops", "Airline", "Booking link"];
  const rows = deals.map((deal) => [
    deal.city,
    deal.country,
    (deal.origins || [deal.origin]).join(" + "),
    deal.price,
    deal.date,
    deal.days,
    deal.stops,
    deal.airline || "",
    deal.link || deal.originOptions?.find((option) => option.link)?.link || "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
