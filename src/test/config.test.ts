import * as assert from 'assert';

// import the functions from config.ts
import * as config from '../config';

// tests for config.ts
suite('config.ts Test Suite', () => {
    const workspacePath = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
    test('fullTempPath with relative folder', () => {
        const tempPath = './temp';
        const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
        const message = config.fullTempPath(tempPath, currentFile, workspacePath);
        assert.strictEqual(message, '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/temp');
    });
    test('fullTempPath with empty tempPath', () => {
        const tempPath = '';
        const currentFile = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts';
        const message = config.fullTempPath(tempPath, currentFile, workspacePath);
        assert.strictEqual(message, '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md');
    });
});
