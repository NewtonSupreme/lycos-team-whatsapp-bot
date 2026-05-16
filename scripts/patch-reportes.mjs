import { readFileSync, writeFileSync } from 'fs';

const path = 'app/dashboard/reportes/page.tsx';
let content = readFileSync(path, 'utf8');

// 1. Add cierre-pdf import
if (!content.includes('cierre-pdf')) {
  content = content.replace(
    "import { generateInvoicePDF, generateEgresoPDF } from '@/lib/invoice-pdf';",
    "import { generateInvoicePDF, generateEgresoPDF } from '@/lib/invoice-pdf';\nimport { generateCierrePDF, type CierreData } from '@/lib/cierre-pdf';"
  );
  console.log('Added cierre-pdf import');
}

// 2. Add state
if (!content.includes('showCierreWizard')) {
  content = content.replace(
    "  const [showManualEgreso, setShowManualEgreso] = useState(false);",
    "  const [showManualEgreso, setShowManualEgreso] = useState(false);\n  const [showCierreWizard, setShowCierreWizard] = useState(false);"
  );
  console.log('Added state');
}

// 3. Add button
const oldBtn = '            <Button onClick={() => setShowManual(true)} variant="outline" className="gap-2 flex-1 sm:flex-none border-border">';
if (content.includes(oldBtn) && !content.includes('Cierre PDF')) {
  content = content.replace(oldBtn,
    `            <Button onClick={() => setShowCierreWizard(true)} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold">
              <FileText className="w-4 h-4" /> Cierre PDF
            </Button>
` + oldBtn
  );
  console.log('Added button');
}

// 4. Add wizard render
const scanModalLine = "      {scanMode && (";
if (!content.includes('showCierreWizard &&') && content.includes(scanModalLine)) {
  content = content.replace(
    scanModalLine,
    `      {showCierreWizard && (
        <CierreWizard ventas={ventas} onClose={() => setShowCierreWizard(false)} onSaved={() => setShowCierreWizard(false)} />
      )}
` + scanModalLine
  );
  console.log('Added wizard render');
}

// 5. Insert the CierreWizard component (loaded from a separate file to avoid template literal evaluation)
const wizardCode = readFileSync('scripts/cierre-wizard-component.tsx', 'utf8');
const manualModalMarker = "// ── Modal: Formulario Manual ────────────────────────────────────";

if (!content.includes('CierreWizard Component') && content.includes(manualModalMarker)) {
  content = content.replace(manualModalMarker, wizardCode + '\n' + manualModalMarker);
  console.log('Inserted CierreWizard component');
}

writeFileSync(path, content, 'utf8');
console.log('Done. File size:', content.length);
