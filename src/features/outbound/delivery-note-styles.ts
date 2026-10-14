// Delivery-note paper layout matches the reference project.
export const DELIVERY_NOTE_CSS = `
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: "SimSun", "宋体", "NSimSun", serif;
                font-variant-numeric: tabular-nums;
                font-size: 12pt;
                font-weight: 500;
                color: #000;
                padding: 0;
                margin: 0 auto;
                width: 210mm;
                max-width: 100%;
                background: #fff;
              }
              .print-wrapper {
                position: relative;
                width: 100%;
              }
              .print-main {
                width: 100%;
                padding-right: 0;
              }
              .print-header {
                margin-bottom: 1mm;
                width: 100%;
              }
              .print-title {
                text-align: center;
                font-size: 24pt;
                font-weight: 700;
                margin: 0 0 1.5mm 0;
                letter-spacing: 2pt;
              }
              .print-company-info {
                display: table;
                width: 100%;
                margin-bottom: 0;
                font-size: 14pt;
                font-weight: 600;
                line-height: 1.25;
              }
              .company-left {
                display: table-cell;
                width: 56%;
                vertical-align: top;
                text-align: left;
              }
              .company-left p {
                margin: 0.4mm 0;
                text-align: left;
              }
              .company-line-phone {
                white-space: nowrap;
              }
              .company-right {
                display: table-cell;
                width: 44%;
                vertical-align: top;
                text-align: right;
              }
              .company-right p {
                margin: 0.4mm 0;
                text-align: right;
              }
              .print-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 0;
                font-size: 15pt;
                font-weight: 600;
                table-layout: fixed;
              }
              .print-table th, .print-table td {
                border: 1px solid #000;
                padding: 2mm 1.5mm;
                font-family: "SimSun", "宋体", "NSimSun", serif;
                color: #000;
                font-weight: 600;
              }
              .print-table th {
                background-color: #fff;
              }
              .print-table th:not(:last-child) {
                text-align: center;
              }
              .print-table th:last-child {
                text-align: left;
                padding-left: 3mm;
              }
              .print-table thead th {
                height: 11mm;
                box-sizing: border-box;
                vertical-align: middle;
                padding-top: 1mm;
                padding-bottom: 1mm;
              }
              .print-table tbody td:not(:last-child),
              .print-table tfoot td:not(:last-child) {
                text-align: center;
              }
              .print-table tbody td:last-child,
              .print-table tfoot td:last-child {
                text-align: left;
                padding-left: 3mm;
              }
              .print-table tbody td,
              .print-table tfoot td {
                height: 12mm;
                vertical-align: middle;
              }
              .print-tfoot-strong { font-weight: 600; }
              .print-table tfoot td.print-tfoot-rmb-zh {
                text-align: left;
                padding-left: 3mm;
              }
              .print-signature {
                display: table;
                width: 100%;
                margin-top: 2mm;
                font-size: 11pt;
                font-weight: 600;
                color: #000;
              }
              .signature-left {
                display: table-cell;
                width: 50%;
                text-align: left;
                vertical-align: top;
              }
              .signature-left p {
                margin: 1mm 0;
                text-align: left;
              }
              .signature-right {
                display: table-cell;
                width: 50%;
                text-align: right;
                vertical-align: top;
              }
              .signature-right p {
                margin: 1mm 0;
                text-align: right;
              }
              .print-notice-line {
                text-align: center;
                margin-top: 1mm;
                font-size: 10pt;
                font-weight: 600;
                color: #000;
                line-height: 1.35;
                white-space: nowrap;
              }
              .print-continued {
                text-align: center;
                margin-top: 4mm;
                font-size: 10pt;
                font-weight: 500;
                color: #333;
              }
              @media print {
                body {
                  padding: 0;
                  margin: 0 auto;
                  width: 210mm;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .print-title { font-size: 24pt; font-weight: 700; }
                .print-company-info { font-size: 14pt; }
                .print-page {
                  page-break-inside: avoid;
                  min-height: 140mm;
                }
                .print-page:not(.print-page-last) {
                  page-break-after: always;
                }
                .print-page:not(:first-child) {
                  page-break-before: always;
                }
                @page {
                  size: 241mm 140mm;
                  margin: 0;
                }
              }
`;
