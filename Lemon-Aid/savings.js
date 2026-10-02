/* Khusus halaman Savings */
const currentUser = requireLogin();
if (currentUser) initSavings();

function initSavings() {
  renderNav("savings");
  const f = getFinance();
  fillFinance(f);

  const pct = (f.saved / f.target) * 100;
  const label = pct === 0 ? "0" : pct < 0.01 ? "<0,01" : pct.toFixed(2).replace(".", ",");
  $("#s-progress").textContent = `Progress : ${label}%`;

  drawDonut(f.spending);
}

/* Diagram donat dari SVG (tanpa library) */
function drawDonut(s) {
  const parts = [
    ["Food", s.food, "#3f51b5"],
    ["Shopping", s.shopping, "#f0a830"],
    ["Others", s.others, "#39a4c8"],
  ];
  const total = parts.reduce((sum, p) => sum + p[1], 0) || 1;
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0, svg = "";

  parts.forEach(([, value, color]) => {
    const frac = value / total, len = frac * C;
    svg += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="22"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    if (frac > 0.05) {
      const mid = ((offset + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
      svg += `<text x="${60 + R * Math.cos(mid)}" y="${60 + R * Math.sin(mid)}">${Math.round(frac * 100)}%</text>`;
    }
    offset += len;
  });
  $("#donut").innerHTML = svg;

  $("#legend").innerHTML = parts
    .map(([name, , color]) => `<li><i style="background:${color}"></i>${esc(name)}</li>`)
    .join("");
}