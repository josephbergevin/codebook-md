import * as assert from 'assert';

// import the functions from md.ts
import * as md from '../md';

// tests for md.ts
suite('md.ts Test Suite', () => {
    // permalinkToCodeDocument
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
        assert.deepEqual(codeDoc.toFullFileLocPos(), '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9');
    });

    test('CodeDocument - no file location', () => {
        const line = 'hello';
        const got = md.findCodeDocument(line);
        const want = null;
        assert.deepEqual(got, want);
    });

    test('CodeDocument - file location, no line numbers', () => {
        const line = 'here is a file: ../extension.ts';
        const got = md.findCodeDocument(line);
        const want = "../extension.ts";
        assert.deepEqual(got, want);
    });

    test('CodeDocument - file location with begin line number', () => {
        const line = 'here is a file: (../extension.ts:9)';
        const got = md.findCodeDocument(line);
        const want = '../extension.ts:9';
        assert.deepEqual(got, want);
    });

    test('CodeDocument - file location with line numbers', () => {
        const line = 'here is a file: (../extension.ts:9-15)';
        const got = md.findCodeDocument(line);
        const want = '../extension.ts:9-15';
        assert.deepEqual(got, want);
    });

    test('CodeDocument - file location in go', () => {
        const line = '    fmt.Println("./example.ts")';
        const got = md.findCodeDocument(line);
        const want = './example.ts';
        assert.deepEqual(got, want);
    });
});
