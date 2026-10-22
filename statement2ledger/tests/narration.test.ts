import { describe, expect, it } from 'vitest';
import { defaultCategorizationEngine } from '../src/core/categorize';
import { parseIndianDate } from '../src/core/dates';
import { parseIndianAmountToPaise } from '../src/core/money';
import { parseNarration } from '../src/core/narration';

describe('Narration Intelligence Engine - 45+ Real World Bank Narrations', () => {
  // CRITICAL REQUIREMENT 4.3 WORKED EXAMPLE:
  it('passes the worked example from Section 4.3', () => {
    const rawNarration = 'UPI-SWIGGY-BENGALURU-982347923-HDFC0001';
    const rawDate = '15/10/26';
    const withdrawalAmt = '450.00';

    const parsedDate = parseIndianDate(rawDate);
    const parsedAmount = parseIndianAmountToPaise(withdrawalAmt);
    const parsedNarr = parseNarration(rawNarration);
    const cat = defaultCategorizationEngine.categorize(
      parsedNarr.vendor,
      rawNarration,
      parsedNarr.mode,
      true, // Withdrawal is debit
      parsedAmount.paise
    );

    expect(parsedDate).toBe('2026-10-15');
    expect(parsedNarr.vendor).toBe('Swiggy');
    expect(parsedNarr.mode).toBe('UPI');
    expect(parsedNarr.reference).toBe('982347923');
    expect(cat.category).toBe('Food & Dining');
    expect(parsedAmount.paise).toBe(45000); // 450.00
  });

  // 1-10: UPI Varied Real-World Strings
  it('parses UPI Slash formatted strings (ICICI / Axis format)', () => {
    const res = parseNarration('UPI/123456789012/SWIGGY/swiggy@icici/PAYMENT');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Swiggy');
    expect(res.reference).toBe('123456789012');
    expect(res.vpa).toBe('swiggy@icici');
  });

  it('parses UPI Zomato with VPA and IFSC in string', () => {
    const res = parseNarration('UPI-ZOMATO-ZOMATO@HDFCBANK-HDFC0000001-123456789012-PAYMENT FROM PHONE');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Zomato');
    expect(res.reference).toBe('123456789012');
    expect(res.ifsc).toBe('HDFC0000001');
  });

  it('parses UPI Blinkit quick commerce', () => {
    const res = parseNarration('UPI/DR/428912389123/BLINKIT/blinkit@hdfcbank/GROCERIES');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Blinkit');
    expect(res.reference).toBe('428912389123');
  });

  it('parses UPI Zepto grocery delivery', () => {
    const res = parseNarration('UPI-ZEPTO-KIRANAKART-zepto@hdfcbank-992384729124');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Zepto');
    expect(res.reference).toBe('992384729124');
  });

  it('parses UPI BigBasket online supermarket', () => {
    const res = parseNarration('UPI/CR/998124982142/BIGBASKET/SUPERMARKET GROCERY/PAY');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('BigBasket');
  });

  it('parses UPI Uber trip payment', () => {
    const res = parseNarration('UPI/428910293812/UBER INDIA/uber.india@icici/RIDE');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Uber');
    expect(res.reference).toBe('428910293812');
  });

  it('parses UPI Ola cabs ride', () => {
    const res = parseNarration('UPI-OLA-ANI TECHNOLOGIES-981249120491-OLACABS');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Ola');
  });

  it('parses UPI Rapido bike taxi', () => {
    const res = parseNarration('UPI/DR/102938475612/RAPIDO AUTO/rapido@icici');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Rapido');
  });

  it('parses UPI CRED credit card bill payment', () => {
    const res = parseNarration('UPI-CRED-DREAMPLUG TECHNOLOGIES-cred@axisbank-882194819284');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('CRED');
  });

  it('parses UPI Amazon Pay shopping', () => {
    const res = parseNarration('UPI/DR/778129384910/AMAZON PAY/amazonpay@icici/ORDER');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Amazon');
  });

  // 11-15: NEFT Inward and Outward
  it('parses NEFT salary credit from employer', () => {
    const res = parseNarration('NEFT CR-HDFC0001234-INFOSYS TECHNOLOGIES-SALARY FOR OCT');
    expect(res.mode).toBe('NEFT');
    expect(res.ifsc).toBe('HDFC0001234');
    expect(res.vendor).toBe('Infosys Technologies');
  });

  it('parses NEFT freelance remittance from Upwork', () => {
    const res = parseNarration('NEFT CR-CITI0000001-UPWORK ESCROW INC-OCT INVOICE');
    expect(res.mode).toBe('NEFT');
    expect(res.vendor).toBe('Upwork');
  });

  it('parses NEFT debit transfer to supplier', () => {
    const res = parseNarration('NEFT DR-UTIB0000123-ABC SUPPLIERS PVT LTD-INV9821');
    expect(res.mode).toBe('NEFT');
    expect(res.ifsc).toBe('UTIB0000123');
  });

  it('parses NEFT interbank transfer to SBI', () => {
    const res = parseNarration('NEFT DR-SBIN0001234-RAMESH KUMAR-FAMILY SUPPORT');
    expect(res.mode).toBe('NEFT');
    expect(res.ifsc).toBe('SBIN0001234');
  });

  it('parses NEFT with 16-character alphanumeric UTR', () => {
    const res = parseNarration('NEFT CR-HDFCN00293847102-PAYROLL SERVICES');
    expect(res.mode).toBe('NEFT');
    expect(res.reference).toBe('HDFCN00293847102');
  });

  // 16-20: RTGS and IMPS
  it('parses RTGS high value business payment', () => {
    const res = parseNarration('RTGS-SBIN0001234-XYZ ENTERPRISES-UTR987654321098');
    expect(res.mode).toBe('RTGS');
    expect(res.ifsc).toBe('SBIN0001234');
  });

  it('parses IMPS merchant payment', () => {
    const res = parseNarration('IMPS-428912389123-SWIGGY-HDFC0001');
    expect(res.mode).toBe('IMPS');
    expect(res.vendor).toBe('Swiggy');
    expect(res.reference).toBe('428912389123');
  });

  it('parses IMPS person to account transfer', () => {
    const res = parseNarration('IMPS/P2A/428912389123/RAHUL/HDFC');
    expect(res.mode).toBe('IMPS');
    expect(res.reference).toBe('428912389123');
  });

  it('parses IMPS fund transfer with 12-digit RRN', () => {
    const res = parseNarration('IMPS-892102938471-TRANSFER TO SISTER');
    expect(res.mode).toBe('IMPS');
    expect(res.reference).toBe('892102938471');
  });

  it('parses IMPS with ICICI IFSC', () => {
    const res = parseNarration('IMPS/ICIC0000102/339201928471/FLIPKART');
    expect(res.mode).toBe('IMPS');
    expect(res.vendor).toBe('Flipkart');
    expect(res.reference).toBe('339201928471');
  });

  // 21-25: ACH / NACH / ECS Mandates
  it('parses ACH Home Loan EMI debit', () => {
    const res = parseNarration('ACH D- HDFC0000123- HDFC BANK HOME LOAN EMI');
    expect(res.mode).toBe('ACH');
    expect(res.vendor).toBe('HDFC Bank');
  });

  it('parses NACH Insurance premium mandate', () => {
    const res = parseNarration('NACH/HDFC LIFE/0019283921/PREMIUM PAYMENT');
    expect(res.mode).toBe('ACH');
    expect(res.vendor).toBe('HDFC Life');
  });

  it('parses ECS consumer finance mandate', () => {
    const res = parseNarration('ECS/BAJAJ FINANCE/EMI 98123-LOAN');
    expect(res.mode).toBe('ACH');
  });

  it('parses CMS mandate debit', () => {
    const res = parseNarration('CMS/MUTUAL FUND SIP/GROWW/0019283');
    expect(res.mode).toBe('ACH');
    expect(res.vendor).toBe('Groww');
  });

  it('parses ACH Zerodha SIP mandate', () => {
    const res = parseNarration('ACH D- ZERODHA BROKING-COIN SIP INVESTMENT');
    expect(res.mode).toBe('ACH');
    expect(res.vendor).toBe('Zerodha');
  });

  // 26-30: POS Card Swipes & E-Commerce
  it('parses POS card swipe with masked card number', () => {
    const res = parseNarration('POS 4XXXXXXXXXXX1234 AMAZON INDIA BANGALORE');
    expect(res.mode).toBe('POS');
    expect(res.vendor).toBe('Amazon');
    expect(res.reference).toBe('1234');
  });

  it('parses POS supermarket retail swipe', () => {
    const res = parseNarration('POS 411111XXXXXX9876 RELIANCE SMART MUMBAI');
    expect(res.mode).toBe('POS');
    expect(res.vendor).toBe('Reliance Retail');
  });

  it('parses POS food delivery swipe', () => {
    const res = parseNarration('POS DEBIT CARD SWIGGY INSTAMART GURGAON');
    expect(res.mode).toBe('POS');
    expect(res.vendor).toBe('Swiggy');
  });

  it('parses POS electronics store purchase', () => {
    const res = parseNarration('POS CROMA ELECTRONICS PUNE 4289');
    expect(res.mode).toBe('POS');
    expect(res.vendor).toBe('Croma');
  });

  it('parses POS Decathlon sports purchase', () => {
    const res = parseNarration('POS 4XXXXXXXXXXX5555 DECATHLON SPORTS NOIDA');
    expect(res.mode).toBe('POS');
    expect(res.vendor).toBe('Decathlon');
  });

  // 31-35: ATM Cash Withdrawals & Cheques
  it('parses ATM cash withdrawal via NFS network', () => {
    const res = parseNarration('ATM WDL-NFS-HDFC0001-CASH WITHDRAWAL-1234');
    expect(res.mode).toBe('ATM');
    expect(res.vendor).toBe('ATM Cash Withdrawal');
  });

  it('parses CWDR branch ATM cash wdl', () => {
    const res = parseNarration('CWDR/ATM/KORAMANGALA BRANCH/SELF');
    expect(res.mode).toBe('ATM');
  });

  it('parses Cheque clearing debit with 6-digit cheque number', () => {
    const res = parseNarration('CHQ CLRG - 000123 - SELF CASH');
    expect(res.mode).toBe('CHEQUE');
    expect(res.reference).toBe('000123');
  });

  it('parses Cheque deposit credit', () => {
    const res = parseNarration('CHEQUE DEPOSIT 104523 CLEARING HOUSE');
    expect(res.mode).toBe('CHEQUE');
    expect(res.reference).toBe('104523');
  });

  it('parses CTS cheque clearing', () => {
    const res = parseNarration('CTS CHEQUE CLRNG: 000452 / TO SHYAM');
    expect(res.mode).toBe('CHEQUE');
    expect(res.reference).toBe('000452');
  });

  // 36-40: Interest, TDS, Charges, Salary
  it('parses Savings Bank Interest Credit', () => {
    const res = parseNarration('15/10/26 INT.PD: 01-07-2026 TO 30-09-2026');
    expect(res.mode).toBe('INTEREST');
    expect(res.vendor).toBe('Bank Interest');
  });

  it('parses Quarterly Interest Credit', () => {
    const res = parseNarration('QUARTERLY INTEREST CREDIT SB ACCOUNT');
    expect(res.mode).toBe('INTEREST');
  });

  it('parses TDS deduction on interest', () => {
    const res = parseNarration('TDS ON INTEREST DEDUCTED UNDER SECTION 194A');
    expect(res.mode).toBe('TDS');
    expect(res.vendor).toBe('Income Tax Department');
  });

  it('parses Consolidated Bank Charges', () => {
    const res = parseNarration('CONSOLIDATED CHARGES FOR Q2 + GST');
    expect(res.mode).toBe('CHARGES');
    expect(res.vendor).toBe('Bank Charges');
  });

  it('parses Annual Debit Card Maintenance Charges', () => {
    const res = parseNarration('ANNUAL DEBIT CARD MAINTENANCE AMC FEE');
    expect(res.mode).toBe('CHARGES');
  });

  // 41-45: NetBanking, Reversals, Freelance & Travel
  it('parses Salary Credit', () => {
    const res = parseNarration('SALARY CREDIT - OCT 2026 - TATA CONSULTANCY');
    expect(res.mode).toBe('SALARY');
  });

  it('parses UPI reversal / refund', () => {
    const res = parseNarration('REV-UPI-SWIGGY-982347923-REFUND');
    expect(res.mode).toBe('REFUND');
    expect(res.vendor).toBe('Swiggy');
  });

  it('parses IRCTC train ticket payment', () => {
    const res = parseNarration('UPI/DR/123498124981/IRCTC TICKETS/irctc@sbi');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('IRCTC');
  });

  it('parses Jio mobile recharge', () => {
    const res = parseNarration('UPI-RELIANCE JIO-JIO PREPAID-9821498124');
    expect(res.mode).toBe('UPI');
    expect(res.vendor).toBe('Jio');
  });

  it('parses NetBanking third party transfer', () => {
    const res = parseNarration('TPT-TRANSFER TO AASHISH-1234');
    expect(res.mode).toBe('NETBANKING');
  });
});
