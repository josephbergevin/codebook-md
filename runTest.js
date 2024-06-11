const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, './');
        const extensionTestsPath = path.resolve(__dirname, './src/test');
        
        // Download VS Code, setup environment, and run tests
        await runTests({
            version: 'stable', // or specify a specific version
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions',
                './src/test/md.test.ts' // Specify the path to your test file here
            ],
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
