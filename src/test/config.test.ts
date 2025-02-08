import * as config from '../config';

describe('config.ts Test Suite', () => {
  const workspacePath = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
  it('fullTempPath with relative folder', () => {
    const tempPath = './temp';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullTempPath(tempPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/temp');
  });
  it('fullTempPath with empty tempPath', () => {
    const tempPath = '';
    const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
    const message = config.fullTempPath(tempPath, currentFile, workspacePath);
    expect(message).toBe('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md');
  });
});
