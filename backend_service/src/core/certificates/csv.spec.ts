import { csvCell, csvLine, UTF8_BOM } from './csv.js';

describe('csvCell', () => {
  it.each([
    ['plain', 'plain'],
    ['Nguyễn', 'Nguyễn'],
    ["O'Neil", "O'Neil"],
    ['', ''],
  ])('leaves %j alone', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each([
    ['Smith, Jo', '"Smith, Jo"'],
    ['Say "hi"', '"Say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['cr\rhere', '"cr\rhere"'],
  ])('quotes %j as %j (RFC 4180)', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+61 400', "'+61 400"],
    ['-2', "'-2"],
    ['@cmd', "'@cmd"],
    ['\tTab', "'\tTab"],
  ])('prefixes formula-like %j with an apostrophe', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('protects first, then quotes, so a formula with a comma stays one safe cell', () => {
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it('only checks the first character', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('Mary-Jane')).toBe('Mary-Jane');
  });
});

describe('csvLine', () => {
  it('joins cells with commas and ends with CRLF', () => {
    expect(csvLine(['a', 'b, c', '=x'])).toBe(`a,"b, c",'=x\r\n`);
  });

  it('has a BOM constant for the start of the file', () => {
    expect(UTF8_BOM).toBe('﻿');
  });
});
