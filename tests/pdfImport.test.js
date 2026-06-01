import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { extractTextFromPdf, scorePdfExtraction } from '../modules/extraction.js';

function streamObject(number, content, lengthObject) {
  const compressed = deflateSync(Buffer.from(content, 'latin1'));
  return {
    object: Buffer.concat([
      Buffer.from(`${number} 0 obj\n<</Length ${lengthObject} 0 R /Filter /FlateDecode>> stream\n`, 'latin1'),
      compressed,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]),
    lengthObject: Buffer.from(`${lengthObject} 0 obj\n${compressed.length}\nendobj\n`, 'latin1'),
  };
}

function buildEncodedPdf() {
  const encode = text => [...text].map(char => {
    const code = char === ' ' ? 0x0003
      : char === '@' ? 0x0038
      : char === '.' ? 0x0039
      : /[A-Z]/.test(char) ? 0x0004 + char.charCodeAt(0) - 0x41
      : 0x001E + char.charCodeAt(0) - 0x61;
    return code.toString(16).padStart(4, '0');
  }).join('');
  const cmap = `
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0003> <0020>
<0039> <002E>
endbfchar
3 beginbfrange
<0004> <001D> <0041>
<001E> <0037> <0061>
<0038> <0038> <0040>
endbfrange
endcmap
end
end
`;
  const content = `
BT
/F1 12 Tf
<${encode('Paul Oteng')}> Tj
0 -14 Td
<${encode('Experience')}> Tj
0 -14 Td
<${encode('paul@example.com')}> Tj
ET
`;
  const contentStream = streamObject(5, content, 7);
  const cmapStream = streamObject(6, cmap, 8);

  return new Blob([
    '%PDF-1.4\n',
    '1 0 obj\n<</Type /Catalog>>\nendobj\n',
    '4 0 obj\n<</Type /Font /Subtype /Type0 /ToUnicode 6 0 R>>\nendobj\n',
    '9 0 obj\n<</Resources <</Font <</F1 4 0 R>>>>>>\nendobj\n',
    contentStream.object,
    cmapStream.object,
    contentStream.lengthObject,
    cmapStream.lengthObject,
    '%%EOF\n',
  ], { type: 'application/pdf' });
}

const extracted = await extractTextFromPdf(buildEncodedPdf());
assert.match(extracted, /Paul Oteng/);
assert.match(extracted, /Experience/);
assert.match(extracted, /paul@example\.com/);
assert.doesNotMatch(extracted, /%PDF-|endobj|endstream/);
assert.equal(scorePdfExtraction(extracted).level, 'partial');

const corruptFallback = new Blob([
  '%PDF-1.4\n',
  '1 0 obj\n<</Length 99>> stream\n',
  'compressed-looking bytes with enough printable text to tempt a raw scan\n',
  'endstream\nendobj\nxref\nstartxref\n123\n%%EOF\n',
], { type: 'application/pdf' });
assert.equal(await extractTextFromPdf(corruptFallback), '');

console.log('pdfImport checks passed');
