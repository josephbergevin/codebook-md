Here are some examples of TypeScript code snippets that can import internal code from this project:

```ts
// ./typescript.ts:5-20

// class & interface using the classic "animal" example: 
// Animal interface can speak, run, and eat
export interface Animal {
    speak(): void;
    trick(): void;
}
    
// Dog class implements Animal interface
// Dog class also has "breed" property
export class Dog implements Animal {
    breed: string;

    constructor(breed: string) {
        this.breed = breed;
    }

    speak() {
        console.log("Woof!");
    }

    trick() {
        console.log("[rolls over]");
    }
}

// Cat class implements Animal interface
// Cat class also has "color" property
export class Cat implements Animal {
    color: string;

    constructor(color: string) {
        this.color = color;
    }

    speak() {
        console.log("Meow!");
    }

    trick() {
        console.log("[catches mouse]");
    }
}

// usage: create a slice of animals
let animals: Animal[] = [
    new Dog("Golden Retriever"),
    new Cat("Black")
];

// iterate through the slice of animals
for (let animal of animals) {
    animal.speak();
    animal.trick();
}

```

```text
Woof!
[rolls over]
Meow!
[catches mouse]
```