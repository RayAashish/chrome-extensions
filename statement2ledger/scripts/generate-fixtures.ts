/**
 * Statement2Ledger - Synthetic Bank Statement Fixture Generator
 * 
 * Generates deterministic synthetic PDFs and CSVs imitating the layouts of
 * HDFC, SBI, and ICICI bank statements without using any real personal financial data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function generateFixtures() {
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  console.log('Generating synthetic bank statement fixtures...');

  // 1. Generate HDFC Multi-Page PDF with split Withdrawal/Deposit and multi-line narrations
  await generateHdfcMultipagePdf(path.join(fixturesDir, 'hdfc_multipage_synthetic.pdf'));

  // 2. Generate SBI PDF with Txn Date, Branch Code, Debit/Credit
  await generateSbiPdf(path.join(fixturesDir, 'sbi_multiline_synthetic.pdf'));

  // 3. Generate ICICI PDF
  await generateIciciPdf(path.join(fixturesDir, 'icici_synthetic.pdf'));

  // 4. Generate HDFC CSV with multi-line quoted narration and BOM
  generateHdfcCsv(path.join(fixturesDir, 'hdfc_sample.csv'));

  // 5. Generate SBI CSV
  generateSbiCsv(path.join(fixturesDir, 'sbi_sample.csv'));

  // 6. Generate ICICI CSV with single Amount + Dr/Cr column
  generateIciciCsv(path.join(fixturesDir, 'icici_sample.csv'));

  // 7. Generate Corrupted Balance CSV (deliberate math error to test reconciliation failure detection)
  generateCorruptedCsv(path.join(fixturesDir, 'corrupted_balance_sample.csv'));

  console.log('All synthetic fixtures generated successfully in fixtures/ !');
}

async function generateHdfcMultipagePdf(outputPath: string) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // --- Page 1 ---
  let page = pdfDoc.addPage([600, 800]);
  let y = 760;

  // Header Bank Info
  page.drawText('HDFC BANK LIMITED', { x: 50, y, size: 14, font: boldFont, color: rgb(0.05, 0.2, 0.45) });
  y -= 18;
  page.drawText('Statement of Account - Savings Account: 50100982341234', { x: 50, y, size: 10, font });
  y -= 14;
  page.drawText('Customer Name: MR. RAHUL SHARMA', { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText('Period: 01/10/2026 to 31/10/2026 | Opening Balance: 50,000.00', { x: 50, y, size: 9, font });
  y -= 25;

  // Table Column Headers
  const drawHeaders = (p: any, curY: number) => {
    p.drawRectangle({ x: 45, y: curY - 5, width: 510, height: 20, color: rgb(0.9, 0.93, 0.97) });
    p.drawText('Date', { x: 50, y: curY, size: 8, font: boldFont });
    p.drawText('Narration', { x: 110, y: curY, size: 8, font: boldFont });
    p.drawText('Chq/Ref No', { x: 270, y: curY, size: 8, font: boldFont });
    p.drawText('Value Dt', { x: 340, y: curY, size: 8, font: boldFont });
    p.drawText('Withdrawal', { x: 400, y: curY, size: 8, font: boldFont });
    p.drawText('Deposit', { x: 460, y: curY, size: 8, font: boldFont });
    p.drawText('Closing Balance', { x: 505, y: curY, size: 8, font: boldFont });
    return curY - 20;
  };

  y = drawHeaders(page, y);

  // Row 1: Salary
  page.drawText('01/10/26', { x: 50, y, size: 8, font });
  page.drawText('SALARY CREDIT - OCT 2026', { x: 110, y, size: 8, font });
  page.drawText('CMS98124', { x: 270, y, size: 8, font });
  page.drawText('01/10/26', { x: 340, y, size: 8, font });
  page.drawText('1,85,000.00', { x: 460, y, size: 8, font });
  page.drawText('2,35,000.00', { x: 505, y, size: 8, font });
  y -= 12;
  page.drawText('INFOSYS TECHNOLOGIES LTD', { x: 110, y, size: 8, font });
  y -= 20;

  // Row 2: Worked Example requirement in 4.3!
  page.drawText('15/10/26', { x: 50, y, size: 8, font });
  page.drawText('UPI-SWIGGY-BENGALURU-982347923-HDFC0001', { x: 110, y, size: 8, font });
  page.drawText('982347923', { x: 270, y, size: 8, font });
  page.drawText('15/10/26', { x: 340, y, size: 8, font });
  page.drawText('450.00', { x: 400, y, size: 8, font });
  page.drawText('2,34,550.00', { x: 505, y, size: 8, font });
  y -= 20;

  // Row 3: Multiline UPI Uber
  page.drawText('16/10/26', { x: 50, y, size: 8, font });
  page.drawText('UPI/428910293812/UBER INDIA', { x: 110, y, size: 8, font });
  page.drawText('428910293812', { x: 270, y, size: 8, font });
  page.drawText('16/10/26', { x: 340, y, size: 8, font });
  page.drawText('380.00', { x: 400, y, size: 8, font });
  page.drawText('2,34,170.00', { x: 505, y, size: 8, font });
  y -= 12;
  page.drawText('uber.india@icici/RIDE TO AIRPORT', { x: 110, y, size: 8, font });
  y -= 20;

  // Row 4: Amazon POS (split across page boundary)
  page.drawText('18/10/26', { x: 50, y, size: 8, font });
  page.drawText('POS 4XXXXXXXXXXX1234 AMAZON PAY', { x: 110, y, size: 8, font });
  page.drawText('1234', { x: 270, y, size: 8, font });
  page.drawText('18/10/26', { x: 340, y, size: 8, font });
  page.drawText('2,499.00', { x: 400, y, size: 8, font });
  page.drawText('2,31,671.00', { x: 505, y, size: 8, font });
  y -= 12;
  page.drawText('Carried Forward: 2,31,671.00', { x: 110, y, size: 8, font: boldFont });
  page.drawText('Page 1 of 2', { x: 280, y: 30, size: 8, font });

  // --- Page 2 ---
  page = pdfDoc.addPage([600, 800]);
  y = 760;
  page.drawText('HDFC BANK LIMITED - Continued', { x: 50, y, size: 10, font: boldFont });
  y -= 16;
  page.drawText('Brought Forward: 2,31,671.00', { x: 50, y, size: 8, font: boldFont });
  y -= 20;

  y = drawHeaders(page, y);

  // Continuation of Amazon purchase line
  page.drawText('BANGALORE RETAIL STORE ORDER 402', { x: 110, y, size: 8, font });
  y -= 20;

  // Row 5: Loan EMI ACH
  page.drawText('20/10/26', { x: 50, y, size: 8, font });
  page.drawText('ACH D- HDFC0000123- HDFC BANK HOME LOAN EMI', { x: 110, y, size: 8, font });
  page.drawText('ACH8912', { x: 270, y, size: 8, font });
  page.drawText('20/10/26', { x: 340, y, size: 8, font });
  page.drawText('42,500.00', { x: 400, y, size: 8, font });
  page.drawText('1,89,171.00', { x: 505, y, size: 8, font });
  y -= 20;

  // Row 6: Freelance Income NEFT
  page.drawText('24/10/26', { x: 50, y, size: 8, font });
  page.drawText('NEFT CR-CITI0000001-UPWORK ESCROW INC', { x: 110, y, size: 8, font });
  page.drawText('CITIN98124', { x: 270, y, size: 8, font });
  page.drawText('24/10/26', { x: 340, y, size: 8, font });
  page.drawText('1,20,000.00', { x: 460, y, size: 8, font });
  page.drawText('3,09,171.00', { x: 505, y, size: 8, font });
  y -= 12;
  page.drawText('OCTOBER CONSULTING INVOICE 2026', { x: 110, y, size: 8, font });
  y -= 20;

  // Row 7: Interest & TDS
  page.drawText('31/10/26', { x: 50, y, size: 8, font });
  page.drawText('INT.PD: 01-07-2026 TO 30-09-2026 SB INTEREST', { x: 110, y, size: 8, font });
  page.drawText('31/10/26', { x: 340, y, size: 8, font });
  page.drawText('3,450.00', { x: 460, y, size: 8, font });
  page.drawText('3,12,621.00', { x: 505, y, size: 8, font });
  y -= 20;

  page.drawText('31/10/26', { x: 50, y, size: 8, font });
  page.drawText('TDS DEDUCTION ON SB INTEREST UNDER SEC 194A', { x: 110, y, size: 8, font });
  page.drawText('31/10/26', { x: 340, y, size: 8, font });
  page.drawText('345.00', { x: 400, y, size: 8, font });
  page.drawText('3,12,276.00', { x: 505, y, size: 8, font });
  y -= 30;

  // Summary footer
  page.drawText('Closing Balance: 3,12,276.00 | Total Debits: 45,794.00 | Total Credits: 3,08,450.00', {
    x: 50,
    y,
    size: 9,
    font: boldFont
  });
  page.drawText('Page 2 of 2', { x: 280, y: 30, size: 8, font });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

async function generateSbiPdf(outputPath: string) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([600, 800]);
  let y = 750;

  page.drawText('STATE BANK OF INDIA', { x: 50, y, size: 14, font: boldFont, color: rgb(0.1, 0.4, 0.7) });
  y -= 18;
  page.drawText('Account Name: MR. AMIT VERMA | Account Number: 00000030192837465', { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText('Branch: KORAMANGALA (01234) | Opening Balance: 25,000.00', { x: 50, y, size: 9, font });
  y -= 25;

  page.drawRectangle({ x: 45, y: y - 5, width: 510, height: 20, color: rgb(0.92, 0.95, 0.98) });
  page.drawText('Txn Date', { x: 50, y, size: 8, font: boldFont });
  page.drawText('Value Date', { x: 105, y, size: 8, font: boldFont });
  page.drawText('Description', { x: 160, y, size: 8, font: boldFont });
  page.drawText('Ref No.', { x: 300, y, size: 8, font: boldFont });
  page.drawText('Branch', { x: 370, y, size: 8, font: boldFont });
  page.drawText('Debit', { x: 415, y, size: 8, font: boldFont });
  page.drawText('Credit', { x: 465, y, size: 8, font: boldFont });
  page.drawText('Balance', { x: 515, y, size: 8, font: boldFont });
  y -= 20;

  // SBI Row 1
  page.drawText('05/10/2026', { x: 50, y, size: 8, font });
  page.drawText('05/10/2026', { x: 105, y, size: 8, font });
  page.drawText('BY TRANSFER-UPI/CR/6281928391/ZOMATO/FOOD', { x: 160, y, size: 8, font });
  page.drawText('6281928391', { x: 300, y, size: 8, font });
  page.drawText('01234', { x: 370, y, size: 8, font });
  page.drawText('680.00', { x: 415, y, size: 8, font });
  page.drawText('24,320.00', { x: 515, y, size: 8, font });
  y -= 20;

  // SBI Row 2
  page.drawText('10/10/2026', { x: 50, y, size: 8, font });
  page.drawText('10/10/2026', { x: 105, y, size: 8, font });
  page.drawText('ATM WDL-NFS-SBIN0001-KORAMANGALA', { x: 160, y, size: 8, font });
  page.drawText('ATM4912', { x: 300, y, size: 8, font });
  page.drawText('01234', { x: 370, y, size: 8, font });
  page.drawText('5,000.00', { x: 415, y, size: 8, font });
  page.drawText('19,320.00', { x: 515, y, size: 8, font });
  y -= 20;

  // SBI Row 3
  page.drawText('15/10/2026', { x: 50, y, size: 8, font });
  page.drawText('15/10/2026', { x: 105, y, size: 8, font });
  page.drawText('INB TRANSFER FROM A/C 9812498214', { x: 160, y, size: 8, font });
  page.drawText('TRF1029', { x: 300, y, size: 8, font });
  page.drawText('01234', { x: 370, y, size: 8, font });
  page.drawText('50,000.00', { x: 465, y, size: 8, font });
  page.drawText('69,320.00', { x: 515, y, size: 8, font });
  y -= 20;

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

async function generateIciciPdf(outputPath: string) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([600, 800]);
  let y = 750;

  page.drawText('ICICI BANK LIMITED', { x: 50, y, size: 14, font: boldFont, color: rgb(0.65, 0.15, 0.15) });
  y -= 18;
  page.drawText('Detailed Statement - Account Number: 001101928374', { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText('Opening Balance: 10,000.00', { x: 50, y, size: 9, font });
  y -= 25;

  page.drawRectangle({ x: 45, y: y - 5, width: 510, height: 20, color: rgb(0.98, 0.93, 0.93) });
  page.drawText('Value Date', { x: 50, y, size: 8, font: boldFont });
  page.drawText('Txn Date', { x: 110, y, size: 8, font: boldFont });
  page.drawText('Cheque No.', { x: 170, y, size: 8, font: boldFont });
  page.drawText('Transaction Remarks', { x: 230, y, size: 8, font: boldFont });
  page.drawText('Withdrawal', { x: 380, y, size: 8, font: boldFont });
  page.drawText('Deposit', { x: 445, y, size: 8, font: boldFont });
  page.drawText('Balance', { x: 505, y, size: 8, font: boldFont });
  y -= 20;

  page.drawText('02/10/2026', { x: 50, y, size: 8, font });
  page.drawText('02/10/2026', { x: 110, y, size: 8, font });
  page.drawText('000000', { x: 170, y, size: 8, font });
  page.drawText('UPI/428912/BLINKIT/blinkit@hdfcbank', { x: 230, y, size: 8, font });
  page.drawText('750.00', { x: 380, y, size: 8, font });
  page.drawText('9,250.00', { x: 505, y, size: 8, font });
  y -= 20;

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

function generateHdfcCsv(outputPath: string) {
  const content = `\uFEFFHDFC BANK LIMITED - Account Statement
Account Number: 50100982341234
Period: 01/10/2026 to 31/10/2026
Opening Balance: 50000.00
Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance
01/10/2026,"SALARY CREDIT - OCT 2026
INFOSYS TECHNOLOGIES LTD",CMS98124,01/10/2026,,185000.00,235000.00
15/10/2026,UPI-SWIGGY-BENGALURU-982347923-HDFC0001,982347923,15/10/2026,450.00,,234550.00
16/10/2026,"UPI/428910293812/UBER INDIA
uber.india@icici/RIDE",428910293812,16/10/2026,380.00,,234170.00
18/10/2026,POS 4XXXXXXXXXXX1234 AMAZON PAY BANGALORE,1234,18/10/2026,2499.00,,231671.00
20/10/2026,ACH D- HDFC0000123- HDFC BANK HOME LOAN EMI,ACH8912,20/10/2026,42500.00,,189171.00
24/10/2026,NEFT CR-CITI0000001-UPWORK ESCROW INC-OCT INVOICE,CITIN98124,24/10/2026,,120000.00,309171.00
31/10/2026,INT.PD: 01-07-2026 TO 30-09-2026 SB INTEREST,,31/10/2026,,3450.00,312621.00
31/10/2026,TDS DEDUCTION ON SB INTEREST UNDER SEC 194A,,31/10/2026,345.00,,312276.00
`;
  fs.writeFileSync(outputPath, content, 'utf-8');
}

function generateSbiCsv(outputPath: string) {
  const content = `STATE BANK OF INDIA
Account Statement for 00000030192837465
Txn Date,Value Date,Description,Ref No./Cheque No.,Branch Code,Debit,Credit,Balance
05/10/2026,05/10/2026,BY TRANSFER-UPI/CR/6281928391/ZOMATO/FOOD,6281928391,01234,680.00,,24320.00
10/10/2026,10/10/2026,ATM WDL-NFS-SBIN0001-KORAMANGALA,ATM4912,01234,5000.00,,19320.00
15/10/2026,15/10/2026,INB TRANSFER FROM A/C 9812498214,TRF1029,01234,,50000.00,69320.00
`;
  fs.writeFileSync(outputPath, content, 'utf-8');
}

function generateIciciCsv(outputPath: string) {
  const content = `ICICI BANK LIMITED - Detailed Statement
Account Number: 001101928374
Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )
02/10/2026,02/10/2026,000000,UPI/428912/BLINKIT/blinkit@hdfcbank,750.00,,9250.00
08/10/2026,08/10/2026,000000,UPI/981241/ZEPTO/zepto@hdfcbank,450.00,,8800.00
`;
  fs.writeFileSync(outputPath, content, 'utf-8');
}

function generateCorruptedCsv(outputPath: string) {
  // Notice row 2 has a corrupted balance: 235000 - 450 should be 234550, but stated as 230000!
  const content = `HDFC BANK LIMITED
Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance
01/10/2026,SALARY CREDIT,CMS1,01/10/2026,,235000.00,235000.00
15/10/2026,UPI-SWIGGY-BENGALURU-982347923,982347923,15/10/2026,450.00,,230000.00
16/10/2026,UPI-UBER,4289,16/10/2026,380.00,,229620.00
`;
  fs.writeFileSync(outputPath, content, 'utf-8');
}

generateFixtures().catch(console.error);
