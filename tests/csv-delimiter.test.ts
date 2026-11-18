import { describe, expect, it } from 'vitest';
import { delimiterOf, parseCsv } from '../src/lib/csv';

describe('CSV files from any broker or spreadsheet', () => {
  it('detects commas, semicolons, tabs and pipes (ignoring ones inside quotes)', () => {
    expect(delimiterOf('Symbol,Side,Qty\nNVDA,Buy,10')).toBe(',');
    expect(delimiterOf('Symbol;Side;Qty\n"NVDA, Inc";Buy;10')).toBe(';');
    expect(delimiterOf('Symbol\tSide\tQty\nNVDA\tBuy\t10')).toBe('\t');
    expect(delimiterOf('Symbol|Side|Qty')).toBe('|');
    expect(delimiterOf('just one column')).toBe(',');
  });
  it('parses semicolon files the same as comma files', () => {
    expect(parseCsv('Symbol;Price\n"AAPL; Class A";1,5\n')).toEqual([['Symbol', 'Price'], ['AAPL; Class A', '1,5']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
