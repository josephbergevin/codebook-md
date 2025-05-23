"use strict";
// Mock the document object with a more complete type assertion
const mockDocument = {
    createElement: jest.fn().mockReturnValue({
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        classList: { add: jest.fn() },
    }),
    querySelector: jest.fn().mockReturnValue({
        appendChild: jest.fn(),
    }),
};
// Use a proper type-safe approach for mocking
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.document = mockDocument;
//# sourceMappingURL=extension.test.js.map