/// <reference types="vite/client" />
/// <reference types="@types/w3c-web-serial" />
/// <reference types="@types/w3c-web-usb" />

// Declare module for importing markdown files as raw strings
declare module '*.md?raw' {
    const content: string
    export default content
}

type UUID = ReturnType<typeof window.crypto.randomUUID>
