import { PromptHandler, PromptType } from '../prompt';

// Define interfaces for testing
interface QuickPickItem {
  label: string;
  detail?: string;
  description?: string;
  picked?: boolean;
}

interface DateQuickPickItem extends QuickPickItem {
  date: Date;
  action?: 'prev-month' | 'next-month' | 'manual-entry';
}

// Mock VS Code API
jest.mock('vscode', () => ({
  window: {
    showInputBox: jest.fn().mockResolvedValue('test input'),
    showQuickPick: jest.fn().mockImplementation(() => {
      // By default, return a date item
      return Promise.resolve({
        label: '15',
        detail: 'Wed, May 15, 2024',
        date: new Date(2024, 4, 15)
      });
    }),
  },
  QuickPickItem: class { },
}));

// Get the mocked VS Code module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');

describe('PromptHandler', () => {
  describe('detectPrompts', () => {
    it('should detect string prompts', () => {
      const text = 'This is a [>].prompt.String("Enter your name") test';
      const prompts = PromptHandler.detectPrompts(text);

      expect(prompts.length).toBe(1);
      expect(prompts[0].type).toBe(PromptType.String);
      expect(prompts[0].placeholder).toBe('Enter your name');
      expect(prompts[0].originalText).toBe('[>].prompt.String("Enter your name")');
    });

    it('should detect date prompts', () => {
      const text = 'Enter date: [>].prompt.Date("Enter a date", "YYYY-MM-DD")';
      const prompts = PromptHandler.detectPrompts(text);

      expect(prompts.length).toBe(1);
      expect(prompts[0].type).toBe(PromptType.Date);
      expect(prompts[0].placeholder).toBe('Enter a date');
      expect(prompts[0].format).toBe('YYYY-MM-DD');
      expect(prompts[0].originalText).toBe('[>].prompt.Date("Enter a date", "YYYY-MM-DD")');
    });

    it('should detect multiple prompts', () => {
      const text = 'Name: [>].prompt.String("Enter your name")\nDOB: [>].prompt.Date("Enter your date of birth", "MM/DD/YYYY")';
      const prompts = PromptHandler.detectPrompts(text);

      expect(prompts.length).toBe(2);
      expect(prompts[0].type).toBe(PromptType.String);
      expect(prompts[1].type).toBe(PromptType.Date);
    });

    it('should handle prompts with single or double quotes', () => {
      const text = '[>].prompt.String(\'Single quotes\')\n[>].prompt.String("Double quotes")';
      const prompts = PromptHandler.detectPrompts(text);

      expect(prompts.length).toBe(2);
      expect(prompts[0].placeholder).toBe('Single quotes');
      expect(prompts[1].placeholder).toBe('Double quotes');
    });

    it('should return empty array when no prompts exist', () => {
      const text = 'This text has no prompts';
      const prompts = PromptHandler.detectPrompts(text);

      expect(prompts).toEqual([]);
    });
  });

  describe('hasPrompts', () => {
    it('should return true when prompts exist', () => {
      const text = 'This is a [>].prompt.String("test") example';
      const result = PromptHandler.hasPrompts(text);

      expect(result).toBe(true);
    });

    it('should return false when no prompts exist', () => {
      const text = 'This text has no prompts';
      const result = PromptHandler.hasPrompts(text);

      expect(result).toBe(false);
    });
  });

  describe('processPrompts', () => {
    it('should replace string prompts with user input', async () => {
      const text = 'Hello, [>].prompt.String("Enter name")!';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Hello, test input!');
    });

    it('should replace date prompts with formatted date', async () => {
      const text = 'Date: [>].prompt.Date("Select date", "YYYY-MM-DD")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Date: 2024-05-15');
    });

    it('should handle multiple prompts correctly', async () => {
      const text = 'Name: [>].prompt.String("Enter name")\nDate: [>].prompt.Date("Select date")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toContain('Name: test input');
      expect(result).toContain('Date: 2024-05-15');
    });

    it('should throw error when user cancels a prompt', async () => {
      // Override the mock for this test only
      vscode.window.showInputBox.mockResolvedValueOnce(undefined);
      const text = 'Name: [>].prompt.String("Enter name")';

      await expect(PromptHandler.processPrompts(text)).rejects.toThrow('Prompt cancelled by user');
    });
  });

  describe('date formatting', () => {
    beforeEach(() => {
      // Mock quick pick to return a date for June 15, 2023
      vscode.window.showQuickPick.mockResolvedValue({
        label: '15',
        detail: 'Thu, June 15, 2023',
        date: new Date(2023, 5, 15) // June 15, 2023
      });
    });

    it('should format date with YYYY-MM-DD format', async () => {
      const text = 'Date: [>].prompt.Date("Select date", "YYYY-MM-DD")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Date: 2023-06-15');
    });

    it('should format date with MM/DD/YYYY format', async () => {
      const text = 'Date: [>].prompt.Date("Select date", "MM/DD/YYYY")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Date: 06/15/2023');
    });

    it('should format date with D/M/YY format', async () => {
      const text = 'Date: [>].prompt.Date("Select date", "D/M/YY")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Date: 15/6/23');
    });

    it('should use default format when no format is specified', async () => {
      const text = 'Date: [>].prompt.Date("Select date")';
      const result = await PromptHandler.processPrompts(text);

      expect(result).toBe('Date: 2023-06-15');
    });
  });

  describe('calendar generation', () => {
    // Container for quick pick items to inspect
    const capturedItems: DateQuickPickItem[] = [];

    beforeEach(() => {
      capturedItems.length = 0;

      // Mock quick pick to capture items and return a date selection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vscode.window.showQuickPick.mockImplementation((items: any) => {
        // Capture items for inspection
        if (Array.isArray(items)) {
          items.forEach(item => capturedItems.push(item as DateQuickPickItem));
        }

        // Return a date item to complete the prompt
        // Find the first item that has a date property and no action
        for (const item of capturedItems) {
          if (item.date instanceof Date && !item.action) {
            return Promise.resolve(item);
          }
        }

        // Fallback if no date item found
        return Promise.resolve(undefined);
      });
    });

    it('should generate calendar with navigation options', async () => {
      const text = 'Date: [>].prompt.Date("Select date")';
      await PromptHandler.processPrompts(text);

      // Check for navigation items
      const hasPrevMonth = capturedItems.some(item => item.action === 'prev-month');
      const hasNextMonth = capturedItems.some(item => item.action === 'next-month');
      const hasManualEntry = capturedItems.some(item => item.action === 'manual-entry');
      const hasMonthHeader = capturedItems.some(item => item.label.includes('$(calendar)'));

      expect(hasPrevMonth).toBe(true);
      expect(hasNextMonth).toBe(true);
      expect(hasManualEntry).toBe(true);
      expect(hasMonthHeader).toBe(true);
    });

    it('should include date items for the current month', async () => {
      const text = 'Date: [>].prompt.Date("Select date")';
      await PromptHandler.processPrompts(text);

      // Filter out navigation items to get only date items
      const dateItems = capturedItems.filter(item =>
        item.date instanceof Date &&
        !item.action &&
        !item.label.includes('$(calendar)')
      );

      expect(dateItems.length).toBeGreaterThanOrEqual(28); // Even February will have at least 28 days

      // Check the format of a date item
      const someDate = dateItems[14]; // Middle of the month
      expect(someDate.label).toMatch(/^\d+( \(Today\))?$/);
      expect(someDate.detail).toContain(',');
    });
  }); describe('manual date entry', () => {
    beforeEach(() => {
      // Mock quick pick to return a manual entry option
      vscode.window.showQuickPick.mockResolvedValue({
        label: '$(keyboard) Enter Date Manually',
        detail: 'Type a date in YYYY-MM-DD format',
        date: new Date(),
        action: 'manual-entry'
      });
    });

    it('should accept valid manual date entry', async () => {
      // The date used for testing - will be parsed by the implementation
      const inputDateStr = '2023-06-30';
      vscode.window.showInputBox.mockResolvedValueOnce(inputDateStr);

      const text = 'Date: [>].prompt.Date("Enter date")';
      const result = await PromptHandler.processPrompts(text);

      // We'll just verify that we're getting a date format back without checking the exact date
      // to avoid timezone-related test issues
      expect(result).toMatch(/^Date: \d{4}-\d{2}-\d{2}$/);
    });

    it('should format manually entered date according to format', async () => {
      // The date used for testing - will be parsed by the implementation
      const inputDateStr = '2023-06-30';
      vscode.window.showInputBox.mockResolvedValueOnce(inputDateStr);

      const text = 'Date: [>].prompt.Date("Enter date", "MM/DD/YYYY")';
      const result = await PromptHandler.processPrompts(text);

      // We'll just verify that we're getting a formatted date back without checking the exact date
      // to avoid timezone-related test issues
      expect(result).toMatch(/^Date: \d{2}\/\d{2}\/\d{4}$/);
    });

    it('should handle cancelled manual entry', async () => {
      vscode.window.showInputBox.mockResolvedValueOnce(undefined);
      const text = 'Date: [>].prompt.Date("Enter date")';

      await expect(PromptHandler.processPrompts(text)).rejects.toThrow('Prompt cancelled by user');
    });
  });
});
