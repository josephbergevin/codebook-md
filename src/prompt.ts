/* eslint-disable @typescript-eslint/no-explicit-any */
import { window, InputBoxOptions, QuickPickItem, QuickPickOptions } from 'vscode';

/**
 * PromptType defines the available types of prompts
 */
export enum PromptType {
  String = 'String',
  Date = 'Date'
}

/**
 * Prompt represents a single prompt within a code block
 */
export interface Prompt {
  type: PromptType;
  placeholder: string;
  originalText: string;
  format?: string; // Optional date format string
}

/**
 * Interface for date selection items in the calendar
 */
interface DateQuickPickItem extends QuickPickItem {
  date: Date;
  action?: 'prev-month' | 'next-month' | 'manual-entry';
}

/**
 * PromptHandler is responsible for detecting, processing, and gathering input for prompts
 */
export class PromptHandler {
  /**
   * Detects all prompts in the given text using the specified pattern
   * @param text The text to search for prompts
   * @returns Array of detected prompts with their details
   */
  public static detectPrompts(text: string): Prompt[] {
    const prompts: Prompt[] = [];
    // Pattern to match [>].prompt.Type('placeholder' or "placeholder", optional format string)
    // For Date type, it allows an optional format parameter: [>].prompt.Date('date', 'YYYY-MM-DD')
    const promptRegex = /\[>\]\.prompt\.(String|Date)\((['"])([^'"]*)\2(?:\s*,\s*(['"])([^'"]*)\4)?\)/g;

    let match;
    while ((match = promptRegex.exec(text)) !== null) {
      const [originalText, type, , placeholder, , format] = match;
      prompts.push({
        type: type as PromptType,
        placeholder: placeholder.trim(),
        originalText,
        format: format?.trim() // Store the optional format string if provided
      });
    }

    return prompts;
  }

  /**
   * Checks if the given text contains any prompts
   * @param text The text to check
   * @returns True if prompts are detected, false otherwise
   */
  public static hasPrompts(text: string): boolean {
    return PromptHandler.detectPrompts(text).length > 0;
  }

  /**
   * Processes all prompts in the given text by gathering user input
   * and replacing the prompt patterns with the provided values
   * @param text The text containing prompts to process
   * @returns The text with prompts replaced by user input values
   */
  public static async processPrompts(text: string): Promise<string> {
    const prompts = PromptHandler.detectPrompts(text);
    let processedText = text;

    for (const prompt of prompts) {
      const userInput = await PromptHandler.gatherInput(prompt);
      if (userInput === undefined) {
        // User cancelled the prompt, abort processing
        throw new Error('Prompt cancelled by user');
      }

      // Replace the prompt with the user input
      processedText = processedText.replace(prompt.originalText, userInput);
    }

    return processedText;
  }

  /**
   * Gathers input from the user based on the prompt type
   * @param prompt The prompt to gather input for
   * @returns The user's input or undefined if cancelled
   */
  private static async gatherInput(prompt: Prompt): Promise<string | undefined> {
    switch (prompt.type) {
      case PromptType.String:
        return PromptHandler.gatherStringInput(prompt);
      case PromptType.Date:
        return PromptHandler.gatherDateInput(prompt);
      default:
        throw new Error(`Unsupported prompt type: ${prompt.type}`);
    }
  }

  /**
   * Gathers string input from the user
   * @param prompt The prompt to gather input for
   * @returns The user's input or undefined if cancelled
   */
  private static async gatherStringInput(prompt: Prompt): Promise<string | undefined> {
    const inputOptions: InputBoxOptions = {
      prompt: prompt.placeholder,
      placeHolder: 'Enter text...',
      title: 'CodebookMD Prompt'
    };

    return window.showInputBox(inputOptions);
  }

  /**
   * Gathers date input from the user using a calendar-style interface
   * @param prompt The prompt to gather input for
   * @returns The user's input or undefined if cancelled
   */
  private static async gatherDateInput(prompt: Prompt): Promise<string | undefined> {
    // Start with the current date
    const currentMonth = new Date();
    currentMonth.setDate(1); // Set to first day of month

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Generate calendar for the current month
      const calendarItems = PromptHandler.generateCalendarItems(currentMonth);

      // Add navigation options at the top
      const prevMonthItem: DateQuickPickItem = {
        label: `$(arrow-left) ${PromptHandler.getMonthName(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}`,
        detail: 'Previous Month',
        date: new Date(),
        action: 'prev-month'
      };

      const nextMonthItem: DateQuickPickItem = {
        label: `${PromptHandler.getMonthName(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} $(arrow-right)`,
        detail: 'Next Month',
        date: new Date(),
        action: 'next-month'
      };

      const manualEntryItem: DateQuickPickItem = {
        label: '$(keyboard) Enter Date Manually',
        detail: 'Type a date in YYYY-MM-DD format',
        date: new Date(),
        action: 'manual-entry'
      };

      // Add month header as the first item (not selectable)
      const monthHeaderItem: DateQuickPickItem = {
        label: `$(calendar) ${PromptHandler.getMonthName(currentMonth)} ${currentMonth.getFullYear()}`,
        detail: 'Select a date below',
        date: new Date(),
        picked: false
      };

      const allItems = [
        monthHeaderItem,
        prevMonthItem,
        nextMonthItem,
        manualEntryItem,
        ...calendarItems
      ];

      // Show the calendar picker
      const options: QuickPickOptions = {
        title: 'CodebookMD Date Picker',
        placeHolder: prompt.placeholder,
        matchOnDetail: true
      };

      const selection = await window.showQuickPick(allItems, options);

      if (!selection) {
        // User cancelled
        return undefined;
      }

      if (selection.action === 'prev-month') {
        // Go to previous month
        currentMonth.setMonth(currentMonth.getMonth() - 1);
      } else if (selection.action === 'next-month') {
        // Go to next month
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      } else if (selection.action === 'manual-entry') {
        // User wants to enter date manually
        return PromptHandler.manualDateEntry(prompt.placeholder, prompt.format);
      } else {
        // User selected a date
        return PromptHandler.formatDate(selection.date, prompt.format);
      }
    }
  }

  /**
   * Generates calendar items for a specific month
   * @param currentMonth The month to generate calendar items for
   * @returns Array of DateQuickPickItems representing days in the month
   */
  private static generateCalendarItems(currentMonth: Date): DateQuickPickItem[] {
    const items: DateQuickPickItem[] = [];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Get number of days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Create an item for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isToday = PromptHandler.isToday(date);

      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
      items.push({
        label: `${day}${isToday ? ' (Today)' : ''}`,
        detail: `${dayOfWeek}, ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        date: date,
        picked: isToday
      });
    }

    return items;
  }

  /**
   * Checks if a date is today
   * @param date The date to check
   * @returns True if the date is today, false otherwise
   */
  private static isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  /**
   * Gets the name of the month for display
   * @param date The date to get the month name from
   * @returns The month name with year
   */
  private static getMonthName(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long' });
  }

  /**
   * Formats a date according to the specified format or defaults to YYYY-MM-DD
   * @param date The date to format
   * @param format Optional format string (e.g., 'YYYY-MM-DD', 'MM/DD/YYYY', etc.)
   * @returns The formatted date string
   */
  private static formatDate(date: Date, format?: string): string {
    if (!format) {
      // Default format is YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Custom format handling
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Months are 0-based in JavaScript
    const day = date.getDate();

    let formattedDate = format;

    // Handle year formats
    formattedDate = formattedDate.replace(/YYYY/g, year.toString());
    formattedDate = formattedDate.replace(/YY/g, year.toString().slice(-2));

    // Handle month formats
    formattedDate = formattedDate.replace(/MM/g, String(month).padStart(2, '0'));
    formattedDate = formattedDate.replace(/M/g, month.toString());

    // Handle day formats
    formattedDate = formattedDate.replace(/DD/g, String(day).padStart(2, '0'));
    formattedDate = formattedDate.replace(/D/g, day.toString());

    return formattedDate;
  }

  /**
   * Handles manual date entry when the user prefers to type a date
   * @param placeholder The placeholder text to show
   * @param format Optional date format string to use when formatting the entered date
   * @returns The entered date or undefined if cancelled
   */
  private static async manualDateEntry(placeholder: string, format?: string): Promise<string | undefined> {
    const inputOptions: InputBoxOptions = {
      prompt: placeholder,
      placeHolder: 'YYYY-MM-DD',
      title: 'CodebookMD Date Prompt - Manual Entry',
      validateInput: (value) => {
        // Simple date format validation (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return 'Please enter a date in YYYY-MM-DD format';
        }

        // Check if it's a valid date
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return 'Please enter a valid date';
        }

        return null;
      }
    };

    const dateString = await window.showInputBox(inputOptions);
    if (dateString) {
      // Parse the entered date and format it according to the user's preference
      const date = new Date(dateString);
      return PromptHandler.formatDate(date, format);
    }

    return undefined;
  }
}
