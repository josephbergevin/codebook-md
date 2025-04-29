# New Feature: Codebook-Prompts

## Why Introduce Codebook-Prompts?

- Often, users want to run a report or a notebook without having to track the changes made for updating a date or a filter.
- This is a new feature that allows users to create a code block that contains both code and prompts.
- Users can now write a code-block containing the code they want to run, along with prompt commands to get information before running the code.

## How to Use Codebook-Prompts

- Users can add a Codebook-Prompt to their code block by using the `codebook-prompt` tag.
- The input for the codebook-prompt will replace the prompt command when the code is run.
- The syntax for a codebook-prompt is as follows:
  - `[>].prompt.String(enter your favorite color)`
- The prompt types available are:
  - `String`: for string inputs
    - Uses a simple text box for input
  - `Date`: for date inputs
    - Uses a date picker for input

## Example Usage

```shellscript
# This is an example script to demonstrate how to use the prompt library in a shell script.
# It prompts the user for their name and favorite color, and then prints a message.
echo "My favorite color is [>].prompt.String('enter your favorite color')"

name=$(prompt.String('enter your name'))
echo "Hello, $name!"

echo "The date you picked was [>].prompt.Date('enter a date', 'YY-MM-DD')"
```