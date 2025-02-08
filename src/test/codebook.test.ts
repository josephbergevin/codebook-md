import { describe, it } from 'mocha';
import { expect } from 'chai';

// import the functions from md.ts
import * as codebook from '../codebook';

// tests for md.ts
describe('md.ts Test Suite', () => {
  // permalinkToCodeDocument
  it('permalinkToCodeDocument should return the correct message', () => {
    const permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L15';
    const permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
    const workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
    const codeDoc = codebook.permalinkToCodeDocument(permalink, permalinkPrefix, workspaceRoot);
    // test the object
    expect(codeDoc).to.equal(new codebook.CodeDocument(
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
      '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/example.md',
      9,
      15,
      'ts',
    ));
    // test the method fullFileLocPos
    expect(codeDoc.absoluteFileLocPos()).to.equal('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9');
  });

  it('CodeDocument - no file location', () => {
    const line = 'hello';
    const got = codebook.findCodeDocument(line);
    const want = null;
    expect(got).to.equal(want);
  });

  it('CodeDocument - file location, no line numbers', () => {
    const line = 'here is a file: ../extension.ts';
    const got = codebook.findCodeDocument(line);
    const want = "../extension.ts";
    expect(got).to.equal(want);
  });

  it('CodeDocument - file location with begin line number', () => {
    const line = 'here is a file: (../extension.ts:9)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9';
    expect(got).to.equal(want);
  });

  it('CodeDocument - file location with line numbers', () => {
    const line = 'here is a file: (../extension.ts:9-15)';
    const got = codebook.findCodeDocument(line);
    const want = '../extension.ts:9-15';
    expect(got).to.equal(want);
  });

  it('CodeDocument - file location in go', () => {
    const line = '    fmt.Println("./example.ts")';
    const got = codebook.findCodeDocument(line);
    const want = './example.ts';
    expect(got).to.equal(want);
  });
});
