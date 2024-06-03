import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

// import the functions from fmt.ts
import * as fmt from '../fmt';

// import the functions from md.ts
import * as md from '../md';

// import the functions from config.ts
import * as config from '../config';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('fmt.helloWorldMessage should return the correct message', () => {
		const extensionName = 'Test Extension';
		const message = fmt.helloWorldMessage(extensionName);
		assert.strictEqual(message, `Hello World from Test Extension!`);
	});

	test('fmtUpper should return the correct message', () => {
		const str = 'hello';
		const message = fmt.toUpper(str);
		assert.strictEqual(message, 'HELLO');
	});
});

// tests for md.ts
suite('md.ts Test Suite', () => {
	test('permalinkToCodeDocument should return the correct message', () => {
		const permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L15';
		const permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
		const workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
		const codeDoc = md.permalinkToCodeDocument(permalink, permalinkPrefix, workspaceRoot);
		// test the object
		assert.deepEqual(codeDoc, new md.CodeDocument(
			'/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts',
			9,
			15,
			'ts',
		));
		// test the method toFullFileLoc
		assert.deepEqual(codeDoc.toFullFileLoc(), '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9');
	});
});

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
