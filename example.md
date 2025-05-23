```go
// ./src/codebook.ts:5-15
fmt.Println("Hello, World!")
```

### Bash

- look into ./src/codebook.ts:5-15
- file: [open](./src/codebook.ts)
- file and line: [open](./src/codebook.ts:5)
- file and line range: [open](./src/codebook.ts:5-8)

## Markdown Title

- file: [open file](file://Users/tijoe/example.ts)
- file: [open project](/example.ts)
- file: [open rel](./example.ts)
- file: [open rel (no dot)](example.ts)
- file: [open abs](/Users/tijoe/example.ts)
- file: [open abs:line](/Users/tijoe/example.ts:5)

```shellscript
brew update
brew upgrade
```

#### Go

```go
import (
    "fmt"
)

// checkout ./example.md:5-8

// checkout ./example.md

// ./apiplayground/codebook_md_exec.js

func main() {
    fmt.Println("hello, go!")
    fmt.Println("./example.md:3-5")
}
```

```go
fmt.Println("hello, go!")
```

## Rust

<a href="https://marketplace.visualstudio.com/items?itemName=josephbergevin.codebook-md">Joe woz ere</a>

#### HTTP Requests

Below are examples of HTTP requests that can be executed directly from the markdown file:

```http
# Simple GET Request 
# [>].output.showExecutableCodeInOutput(true)
GET https://jsonplaceholder.typicode.com/todos/1
```

```http
# POST Request Example with JSON body
# [>].output.showTimestamp(true)
POST https://jsonplaceholder.typicode.com/posts
Content-Type: application/json
Accept: application/json

{
  "title": "Test Post",
  "body": "This is a test post created from CodebookMD HTTP code block",
  "userId": 1
}
```

## Python

```python
print("hello, python!")
```

```shellscript
echo "hello, shell!"
```

## MD section

- checkout ./example.ts

```shellscript
# checkout ./example.ts
echo "hello, shell-script!"
```

MD section

```shellscript
echo hello, zsh - begin

echo "sleeping 3 seconds"
sleep 3

echo "sleeping 5 seconds"
sleep 5

echo hello, zsh 2 - end
# [>].output.replaceOutputCell(false)
# [>].output.showExecutableCodeInOutput(false)
```

```shellscript
# [>].output.replaceOutputCell(true)
echo "hello, bash 3"
```

```shellscript
mycli -t -e "SELECT workspace_id, slug FROM workspaces.workspaces LIMIT 10"
# [>].result.store('workspaceNames')
```

```javascript
console.log("hello, Javascript!");
```

```typescript
console.log("hello, Typescript!");
```

```sql
SELECT * FROM workspaces.workspaces LIMIT 10;
-- [>].output.showTimestamp(true)
-- [>].output.showExecutableCodeInOutput(true)
SELECT slug FROM workspaces.workspaces LIMIT 3;
-- [>].output.replaceOutputCell(false)
```

```http
GET https://example.com
```

```python
print("hello world")
```

```shellscript
echo "Hello, World!"
```

```shellscript
echo "Hello, World!"
```

```shellscript
echo "Hello, World!"
```

```shellscript
echo "Hello, World!"
```

```shellscript
echo "Hello, World!"
```

```javascript
console.log("Hello, World!");
```

```typescript
console.log("Hello, World!");
```

```sql
SELECT * FROM workspaces LIMIT 10;
```

```http
GET https://example.com
```

```markdown
- list item 1
  - sub-list item 1
  - sub-list item 2
- list item 2

```

- list item 1
  - sub-list item 1
  - sub-list item 2
- list item 2