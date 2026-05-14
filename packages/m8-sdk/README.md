# @yam8d/m8-sdk

Client SDK for iframe applications that communicate with an M8 host.

## Install

```bash
npm install @yam8d/m8-sdk
```

For local development before the package is published:

```bash
npm install ../yam8d/packages/m8-sdk
```

## Usage

```ts
import { createM8Client } from '@yam8d/m8-sdk'

const m8 = await createM8Client()

console.log(m8.state.viewName)
await m8.sendKeyPress(['play'])

const unsubscribe = m8.onStateChange((state) => {
  console.log(state.cursorPos)
})

unsubscribe()
m8.disconnect()
```

For React or other environments where top-level `await` is not convenient:

```ts
import { createM8ClientSync } from '@yam8d/m8-sdk'

const { client, connect } = createM8ClientSync()
await connect()
```

The app must run inside the host iframe. Opening it directly in a standalone browser tab cannot establish the SDK handshake.
