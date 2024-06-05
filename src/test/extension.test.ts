import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

// import the functions from fmt.ts
import * as fmt from '../fmt';

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
