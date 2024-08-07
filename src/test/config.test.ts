import { describe, it } from 'node:test';
import { expect } from 'chai';

// import the functions from config.ts
import * as config from '../config';

// tests for config.ts
describe('config.ts Test Suite', () => {
    const workspacePath = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
    it('fullTempPath with relative folder', () => {
        const tempPath = './temp';
        const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
        const message = config.fullTempPath(tempPath, currentFile, workspacePath);
        expect(message).to.equal('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/temp');
    });
    it('fullTempPath with empty tempPath', () => {
        const tempPath = '';
        const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
        const message = config.fullTempPath(tempPath, currentFile, workspacePath);
        expect(message).to.equal('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md');
    });
});
