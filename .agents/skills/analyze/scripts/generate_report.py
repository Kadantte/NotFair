#!/usr/bin/env python3
"""
Generate a professional HTML analysis report following consulting-grade design standards.

Design principles:
- Assertion-evidence structure: chart titles and section headlines state the conclusion
- High signal-to-noise: no decorative chartjunk, every element earns its place
- Prominent metrics: KPI tiles display key numbers at a glance before the detail
- Direct labeling: values shown on bars, not just accessible via hover
- Purposeful color: single blue accent, semantic red/green for trends, grey for context
- Clear hierarchy: verdict → KPIs → evidence → recommendations

Usage:
  python3 generate_report.py --data /tmp/analysis.json --output docs/analysis/report.html
  open docs/analysis/report.html

Input JSON schema: see references/report-schema.md
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime


# ---------------------------------------------------------------------------
# Color system
# ---------------------------------------------------------------------------

PRIMARY_BLUE    = "#2563EB"   # Primary accent — charts, links, verdict card
BLUE_DARK       = "#1D4ED8"   # Hover state
POSITIVE_GREEN  = "#059669"   # Trend up / positive
NEGATIVE_RED    = "#DC2626"   # Trend down / negative
NEUTRAL_AMBER   = "#D97706"   # Warning / neutral trend
SLATE_900       = "#0F172A"   # Primary text
SLATE_600       = "#475569"   # Secondary text
SLATE_400       = "#94A3B8"   # Muted text / comparison series
SLATE_200       = "#E2E8F0"   # Borders
SLATE_100       = "#F1F5F9"   # Card backgrounds, table headers
SLATE_50        = "#F8FAFC"   # Page background

CHART_COLORS = [
    PRIMARY_BLUE,   # Primary series
    SLATE_400,      # Comparison / secondary series (prior period, benchmark)
    "#7C3AED",      # Purple — tertiary
    POSITIVE_GREEN,
    NEUTRAL_AMBER,
    NEGATIVE_RED,
]

CONFIDENCE_STYLES = {
    "High":                  {"bg": "#DCFCE7", "color": "#14532D", "border": "#86EFAC"},
    "Medium":                {"bg": "#FEF9C3", "color": "#713F12", "border": "#FDE047"},
    "Low":                   {"bg": "#FEE2E2", "color": "#7F1D1D", "border": "#FCA5A5"},
    "Data quality concern":  {"bg": "#F1F5F9", "color": "#334155", "border": "#CBD5E1"},
}

TREND_COLOR = {
    "up":       POSITIVE_GREEN,
    "positive": POSITIVE_GREEN,
    "down":     NEGATIVE_RED,
    "negative": NEGATIVE_RED,
    "flat":     SLATE_400,
}

TREND_ICON = {
    "up":       "↑",
    "positive": "↑",
    "down":     "↓",
    "negative": "↓",
    "flat":     "→",
}


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------

def render_kpis(kpis: list) -> str:
    """Large-number KPI tiles displayed prominently before the findings detail."""
    if not kpis:
        return ""
    tiles = []
    for kpi in kpis:
        label  = kpi.get("label", "")
        value  = kpi.get("value", "")
        change = kpi.get("change") or kpi.get("delta", "")  # e.g. "+18% vs prior week"
        trend  = kpi.get("trend", "")        # "up" | "down" | "flat"
        trend_color = TREND_COLOR.get(trend, SLATE_400)
        trend_icon  = TREND_ICON.get(trend, "")
        change_html = ""
        if change:
            change_html = (
                f'<div class="kpi-change" style="color:{trend_color}">'
                f'{trend_icon} {change}'
                f'</div>'
            )
        tiles.append(
            f'<div class="kpi-tile">'
            f'  <div class="kpi-label">{label}</div>'
            f'  <div class="kpi-value">{value}</div>'
            f'  {change_html}'
            f'</div>'
        )
    return (
        '<div class="section-label">Key metrics</div>'
        '<div class="kpi-grid">'
        + "".join(tiles)
        + "</div>"
    )


def render_findings(findings: list) -> str:
    """Findings list with optional confidence badges."""
    if not findings:
        return ""
    items = []
    for i, f in enumerate(findings):
        # Support both {label, value} and {title, body} shapes
        label      = f.get("label") or f.get("title", "")
        value      = f.get("value") or f.get("body", "")
        note       = f.get("note", "")
        trend      = f.get("trend", "")
        confidence = f.get("confidence", "")   # "High" | "Medium" | "Low" | "Data quality concern"

        trend_color = TREND_COLOR.get(trend, "")
        trend_icon  = TREND_ICON.get(trend, "")

        note_html = ""
        if note and trend_color:
            note_html = f' <span style="color:{trend_color};font-weight:600">{trend_icon} {note}</span>'
        elif note:
            note_html = f' <span style="color:{SLATE_600}">{note}</span>'

        badge_html = ""
        if confidence and confidence in CONFIDENCE_STYLES:
            s = CONFIDENCE_STYLES[confidence]
            badge_html = (
                f' <span class="confidence-badge" '
                f'style="background:{s["bg"]};color:{s["color"]};border-color:{s["border"]}">'
                f'{confidence}'
                f'</span>'
            )

        items.append(
            f'<li class="finding-item">'
            f'  <div class="finding-label">{label}{badge_html}</div>'
            f'  <div class="finding-value">{value}{note_html}</div>'
            f'</li>'
        )
    return "<ul class='findings-list'>" + "".join(items) + "</ul>"


def render_so_what(so_what: list) -> str:
    """Numbered recommendations — consulting convention is numbered priority order."""
    if not so_what:
        return ""
    items = []
    for i, item in enumerate(so_what, start=1):
        if isinstance(item, dict):
            action = item.get("action", "")
            reason = item.get("reason", "")
            text = f'<strong>{action}</strong>' + (f'<br><span class="action-reason">{reason}</span>' if reason else "")
        else:
            text = str(item)
        items.append(
            f'<li class="action-item">'
            f'  <span class="action-num">{i}</span>'
            f'  <span class="action-text">{text}</span>'
            f'</li>'
        )
    return "<ol class='action-list'>" + "".join(items) + "</ol>"


def render_charts_html(charts: list) -> str:
    if not charts:
        return ""
    parts = []
    for i, chart in enumerate(charts):
        title    = chart.get("title", "")
        subtitle = chart.get("subtitle", "")
        insight  = chart.get("insight", "")   # The one-line conclusion stated as assertion

        subtitle_html = f'<div class="chart-subtitle">{subtitle}</div>' if subtitle else ""
        insight_html  = f'<div class="chart-insight">{insight}</div>'   if insight  else ""

        parts.append(
            f'<div class="card">'
            f'  <div class="chart-header">'
            f'    <div class="chart-title">{title}</div>'
            f'    {subtitle_html}'
            f'    {insight_html}'
            f'  </div>'
            f'  <div class="chart-wrapper">'
            f'    <canvas id="chart_{i}"></canvas>'
            f'  </div>'
            f'</div>'
        )
    return "\n".join(parts)


def _render_accent_card(content: str, label: str, accent_class: str) -> str:
    """Render a card with a left-border accent color."""
    if not content:
        return ""
    return (
        f'<div class="card {accent_class}">'
        f'  <div class="section-label">{label}</div>'
        f'  <p class="body-text">{content}</p>'
        f'</div>'
    )


def _format_datalabel_callback() -> str:
    """Return a JS formatter that abbreviates large numbers for datalabels."""
    return """function(value) {
        if (value === null || value === undefined) return '';
        var abs = Math.abs(value);
        if (abs >= 1000000) return (value / 1000000).toFixed(1) + 'M';
        if (abs >= 1000) return (value / 1000).toFixed(1) + 'K';
        if (Number.isInteger(value)) return value.toString();
        return value.toFixed(1);
    }"""


def render_charts_js(charts: list) -> str:
    if not charts:
        return ""
    blocks = []
    for i, chart in enumerate(charts):
        chart_type     = chart.get("type", "bar")
        canvas_id      = f"chart_{i}"
        datasets       = chart.get("datasets", [])
        labels         = json.dumps(chart.get("labels", []))
        reference_line = chart.get("reference_line")   # {"value": 500, "label": "Average"}

        dataset_configs = []
        for j, ds in enumerate(datasets):
            color = ds.get("color", CHART_COLORS[j % len(CHART_COLORS)])
            is_comparison = (j > 0)  # Second series = grey by default (prior period)
            if is_comparison and "color" not in ds:
                color = SLATE_400

            alpha_fill = color + "1A"   # 10% opacity for line fill

            # Bar styles
            bar_border_radius = 3
            cfg = {
                "label":       ds.get("label", ""),
                "data":        ds.get("data", []),
                "borderColor": color,
                "borderWidth": 2,
            }

            if chart_type in ("bar", "horizontal_bar"):
                cfg["backgroundColor"] = color
                cfg["borderRadius"]     = bar_border_radius
                cfg["borderSkipped"]    = False
            elif chart_type == "line":
                cfg["backgroundColor"] = alpha_fill
                cfg["fill"]            = j == 0   # only fill primary series
                cfg["tension"]         = 0.25
                cfg["pointRadius"]     = 4
                cfg["pointHoverRadius"] = 6
                cfg["pointBackgroundColor"] = color
            elif chart_type == "doughnut":
                cfg["backgroundColor"] = CHART_COLORS[j % len(CHART_COLORS)]
                cfg["borderColor"]     = "#FFFFFF"
                cfg["borderWidth"]     = 2

            dataset_configs.append(json.dumps(cfg))

        datasets_js = "[" + ", ".join(dataset_configs) + "]"

        js_type  = {"horizontal_bar": "bar"}.get(chart_type, chart_type)
        index_axis = '"y"' if chart_type == "horizontal_bar" else '"x"'

        show_legend = str(len(datasets) > 1).lower()

        # datalabels: show on bars, suppress on lines
        show_datalabels = chart_type in ("bar", "horizontal_bar")
        datalabel_anchor = '"start"' if chart_type == "horizontal_bar" else '"end"'
        datalabel_align  = '"right"' if chart_type == "horizontal_bar" else '"top"'

        datalabels_config = ""
        if show_datalabels:
            datalabels_config = f"""
              datalabels: {{
                display: true,
                anchor: {datalabel_anchor},
                align: {datalabel_align},
                color: '{SLATE_600}',
                font: {{ size: 11, weight: '600', family: 'Inter, sans-serif' }},
                formatter: {_format_datalabel_callback()},
                clamp: true,
              }},"""
        else:
            datalabels_config = "datalabels: { display: false },"

        # Annotation plugin: reference line (avg, target, etc.)
        annotations_config = ""
        if reference_line:
            ref_val   = reference_line.get("value", 0)
            ref_label = reference_line.get("label", "Avg")
            ref_content = json.dumps(f"{ref_label}: {ref_val}")  # safe for any label text
            is_horiz = chart_type == "horizontal_bar"
            coord    = "x" if is_horiz else "y"
            position = "start" if is_horiz else "end"
            annotations_config = f"""
              annotation: {{
                annotations: {{
                  refLine: {{
                    type: 'line',
                    {coord}Min: {ref_val},
                    {coord}Max: {ref_val},
                    borderColor: '{NEUTRAL_AMBER}',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    label: {{
                      display: true,
                      content: {ref_content},
                      position: '{position}',
                      backgroundColor: '{NEUTRAL_AMBER}',
                      color: '#fff',
                      font: {{ size: 10, family: 'Inter, sans-serif' }},
                      padding: {{ x: 6, y: 3 }},
                      borderRadius: 3,
                    }}
                  }}
                }}
              }},"""

        blocks.append(f"""
        new Chart(document.getElementById('{canvas_id}'), {{
          type: '{js_type}',
          data: {{
            labels: {labels},
            datasets: {datasets_js}
          }},
          options: {{
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: {index_axis},
            layout: {{ padding: {{ top: {20 if chart_type in ('bar', 'horizontal_bar') else 8}, right: 8, bottom: 0, left: 0 }} }},
            plugins: {{
              legend: {{
                display: {show_legend},
                position: 'bottom',
                labels: {{
                  font: {{ size: 12, family: 'Inter, sans-serif' }},
                  color: '{SLATE_600}',
                  boxWidth: 12,
                  boxHeight: 12,
                  padding: 16,
                  usePointStyle: true,
                }}
              }},
              tooltip: {{
                backgroundColor: '{SLATE_900}',
                titleFont: {{ size: 12, family: 'Inter, sans-serif', weight: '600' }},
                bodyFont: {{ size: 12, family: 'Inter, sans-serif' }},
                padding: 12,
                cornerRadius: 6,
                callbacks: {{
                  label: function(ctx) {{
                    var v = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed.x;
                    if (v === null || v === undefined) return ctx.dataset.label;
                    var abs = Math.abs(v);
                    var fmt = abs >= 1000000 ? (v/1000000).toFixed(2)+'M' :
                              abs >= 1000    ? (v/1000).toFixed(1)+'K'    : v.toLocaleString();
                    return ctx.dataset.label ? ctx.dataset.label + ': ' + fmt : fmt;
                  }}
                }}
              }},
              {datalabels_config}
              {annotations_config}
            }},
            scales: {{
              x: {{
                grid: {{
                  color: '{SLATE_200}',
                  drawBorder: false,
                  display: {'false' if js_type == 'bar' and chart_type != 'horizontal_bar' else 'true'},
                }},
                border: {{ display: false }},
                ticks: {{
                  font: {{ size: 11, family: 'Inter, sans-serif' }},
                  color: '{SLATE_400}',
                  maxRotation: 0,
                }}
              }},
              y: {{
                grid: {{
                  color: '{SLATE_200}',
                  drawBorder: false,
                  display: {'false' if chart_type == 'horizontal_bar' else 'true'},
                }},
                border: {{ display: false }},
                ticks: {{
                  font: {{ size: 11, family: 'Inter, sans-serif' }},
                  color: '{SLATE_400}',
                }}
              }}
            }}
          }}
        }});
""")
    return "\n".join(blocks)


def render_tables_html(tables: list) -> str:
    if not tables:
        return ""
    parts = []
    for t_idx, table in enumerate(tables):
        title   = table.get("title", "")
        headers = table.get("headers", [])
        rows    = table.get("rows", [])

        header_html = "".join(
            f'<th onclick="sortTable(this, {t_idx})" class="sortable-header">'
            f'{h} <span class="sort-icon">↕</span></th>'
            for h in headers
        )
        rows_html = "".join(
            "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>"
            for row in rows
        )
        parts.append(
            f'<div class="card">'
            f'  <div class="section-label">{title}</div>'
            f'  <div class="table-wrapper">'
            f'    <table id="table_{t_idx}">'
            f'      <thead><tr>{header_html}</tr></thead>'
            f'      <tbody>{rows_html}</tbody>'
            f'    </table>'
            f'  </div>'
            f'</div>'
        )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main HTML template
# ---------------------------------------------------------------------------

def generate_html(data: dict) -> str:
    title        = data.get("title", "Analysis Report")
    verdict      = data.get("verdict", "")
    question     = data.get("question", "")
    date_str     = data.get("date", datetime.now().strftime("%Y-%m-%d %H:%M"))
    kpis         = data.get("kpis", [])
    findings     = data.get("findings", [])
    charts       = data.get("charts", [])
    tables       = data.get("tables", [])
    so_what      = data.get("so_what", [])
    data_sources = data.get("data_sources", "")
    dq_notes     = data.get("data_quality_notes", "")
    vs_last      = data.get("vs_last_analysis", "")

    kpis_html     = render_kpis(kpis)
    findings_html = render_findings(findings)
    charts_html   = render_charts_html(charts)
    tables_html   = render_tables_html(tables)
    so_what_html  = render_so_what(so_what)
    charts_js     = render_charts_js(charts)

    vs_last_html = _render_accent_card(vs_last, "vs. last analysis", "card-accent-amber")
    dq_html      = _render_accent_card(dq_notes, "Data quality notes", "card-accent-red")

    question_html = f'<div class="header-question">"{question}"</div>' if question else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2/dist/chartjs-plugin-datalabels.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3/dist/chartjs-plugin-annotation.min.js"></script>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: {SLATE_50};
      color: {SLATE_900};
      line-height: 1.55;
      padding: 32px 40px 64px;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
    }}

    .container {{
      max-width: 1100px;
      margin: 0 auto;
    }}

    /* ---- Header ---- */
    .header {{
      margin-bottom: 28px;
    }}
    .header-meta {{
      font-size: 11px;
      font-weight: 600;
      color: {SLATE_400};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }}
    .header-title {{
      font-size: 22px;
      font-weight: 700;
      color: {SLATE_900};
      margin-bottom: 4px;
      line-height: 1.3;
    }}
    .header-question {{
      font-size: 14px;
      color: {SLATE_600};
      font-style: italic;
    }}

    /* ---- Verdict card ---- */
    .verdict-card {{
      background: {PRIMARY_BLUE};
      color: white;
      border-radius: 10px;
      padding: 24px 28px;
      margin-bottom: 20px;
    }}
    .verdict-label {{
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.7;
      margin-bottom: 10px;
    }}
    .verdict-text {{
      font-size: 18px;
      font-weight: 600;
      line-height: 1.4;
    }}

    /* ---- KPI grid ---- */
    .section-label {{
      font-size: 10px;
      font-weight: 700;
      color: {SLATE_400};
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }}
    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }}
    .kpi-tile {{
      background: white;
      border: 1px solid {SLATE_200};
      border-radius: 8px;
      padding: 18px 20px;
    }}
    .kpi-label {{
      font-size: 11px;
      font-weight: 600;
      color: {SLATE_400};
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }}
    .kpi-value {{
      font-size: 28px;
      font-weight: 700;
      color: {SLATE_900};
      line-height: 1.1;
    }}
    .kpi-change {{
      font-size: 12px;
      font-weight: 600;
      margin-top: 6px;
    }}

    /* ---- Cards ---- */
    .card {{
      background: white;
      border: 1px solid {SLATE_200};
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 12px;
    }}
    .card-accent-amber {{
      border-left: 3px solid {NEUTRAL_AMBER};
    }}
    .card-accent-red {{
      border-left: 3px solid {NEGATIVE_RED};
    }}
    .body-text {{
      font-size: 14px;
      color: {SLATE_600};
      line-height: 1.6;
    }}

    /* ---- Findings ---- */
    .findings-list {{
      list-style: none;
    }}
    .finding-item {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding: 12px 0;
      border-bottom: 1px solid {SLATE_100};
    }}
    .finding-item:last-child {{ border-bottom: none; padding-bottom: 0; }}
    .finding-item:first-child {{ padding-top: 0; }}
    .finding-label {{
      font-size: 14px;
      color: {SLATE_900};
      flex: 1;
      line-height: 1.5;
    }}
    .finding-value {{
      font-size: 14px;
      color: {SLATE_600};
      line-height: 1.6;
      flex: 2;
    }}
    .confidence-badge {{
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      vertical-align: middle;
      margin-left: 6px;
      white-space: nowrap;
    }}

    /* ---- Charts ---- */
    .chart-header {{
      margin-bottom: 16px;
    }}
    .chart-title {{
      font-size: 14px;
      font-weight: 700;
      color: {SLATE_900};
      line-height: 1.4;
    }}
    .chart-subtitle {{
      font-size: 12px;
      color: {SLATE_400};
      margin-top: 3px;
    }}
    .chart-insight {{
      font-size: 12px;
      color: {SLATE_600};
      margin-top: 6px;
      font-style: italic;
      border-left: 2px solid {PRIMARY_BLUE};
      padding-left: 8px;
    }}
    .chart-wrapper {{
      position: relative;
      height: 260px;
    }}

    /* ---- Tables ---- */
    .table-wrapper {{
      overflow-x: auto;
      margin-top: 4px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }}
    thead th {{
      text-align: left;
      padding: 8px 12px;
      background: {SLATE_100};
      font-weight: 600;
      font-size: 11px;
      color: {SLATE_600};
      border-bottom: 1px solid {SLATE_200};
      white-space: nowrap;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    .sortable-header {{
      cursor: pointer;
      user-select: none;
    }}
    .sortable-header:hover {{ background: {SLATE_200}; }}
    .sort-icon {{ opacity: 0.4; font-size: 10px; margin-left: 4px; }}
    tbody tr:hover {{ background: {SLATE_50}; }}
    tbody td {{
      padding: 10px 12px;
      border-bottom: 1px solid {SLATE_100};
      color: {SLATE_900};
      line-height: 1.4;
    }}
    tbody tr:last-child td {{ border-bottom: none; }}
    tbody td:not(:first-child) {{
      font-variant-numeric: tabular-nums;
    }}

    /* ---- So what ---- */
    .action-list {{
      list-style: none;
    }}
    .action-item {{
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid {SLATE_100};
    }}
    .action-item:last-child {{ border-bottom: none; padding-bottom: 0; }}
    .action-item:first-child {{ padding-top: 0; }}
    .action-num {{
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      background: {PRIMARY_BLUE};
      color: white;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 1px;
    }}
    .action-text {{
      font-size: 14px;
      color: {SLATE_900};
      line-height: 1.5;
    }}
    .action-reason {{
      font-size: 13px;
      color: {SLATE_600};
      margin-top: 4px;
      display: block;
    }}

    /* ---- Footer ---- */
    .footer {{
      margin-top: 28px;
      font-size: 11px;
      color: {SLATE_400};
      text-align: center;
      line-height: 1.7;
      border-top: 1px solid {SLATE_200};
      padding-top: 16px;
    }}
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <div class="header-meta">Analysis · {date_str}</div>
      <div class="header-title">{title}</div>
      {question_html}
    </div>

    <div class="verdict-card">
      <div class="verdict-label">Bottom line</div>
      <div class="verdict-text">{verdict}</div>
    </div>

    {dq_html}

    {kpis_html}

    <div class="card">
      <div class="section-label">Why</div>
      {findings_html}
    </div>

    {vs_last_html}

    {charts_html}

    {tables_html}

    <div class="card">
      <div class="section-label">So what</div>
      {so_what_html}
    </div>

    <div class="footer">
      Data sources: {data_sources}
    </div>

  </div>

  <script>
    // Register datalabels and annotation plugins globally
    Chart.register(ChartDataLabels);
    Chart.register(window['chartjs-plugin-annotation']?.default || {{}});

    // Sort table by column
    function sortTable(th, tableIdx) {{
      const table = document.getElementById('table_' + tableIdx);
      const tbody = table.querySelector('tbody');
      const headers = table.querySelectorAll('th');
      const colIdx = Array.from(headers).indexOf(th);
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const asc = th.dataset.sortDir !== 'asc';
      th.dataset.sortDir = asc ? 'asc' : 'desc';
      headers.forEach(h => h.querySelector('.sort-icon').textContent = '↕');
      th.querySelector('.sort-icon').textContent = asc ? '↑' : '↓';
      rows.sort((a, b) => {{
        const aVal = a.cells[colIdx]?.textContent.trim() || '';
        const bVal = b.cells[colIdx]?.textContent.trim() || '';
        const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }});
      rows.forEach(r => tbody.appendChild(r));
    }}

    // Initialize charts
    {charts_js}
  </script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate professional HTML analysis report")
    parser.add_argument("--data",   required=True, help="Path to JSON data file")
    parser.add_argument("--output", required=True, help="Output HTML file path")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Error: data file not found: {args.data}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(data_path.read_text())
    html = generate_html(data)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    print(f"Report saved: {args.output}")


if __name__ == "__main__":
    main()
