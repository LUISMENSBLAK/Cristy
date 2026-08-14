import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'

const sourcePath = path.resolve('src/utils/escPos.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
})

const errors = (transpiled.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
assert.equal(errors.length, 0, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))

const outputPath = path.resolve('.printing-test.cjs')
fs.writeFileSync(outputPath, transpiled.outputText)
const require = createRequire(import.meta.url)
const escPos = require(outputPath)

try {
  const spanish = 'áéíóúÁÉÍÓÚñÑüÜ¿¡'
  assert.deepEqual(
    Array.from(escPos.encodeCp850(spanish)),
    [160, 130, 161, 162, 163, 181, 144, 214, 224, 233, 164, 165, 129, 154, 168, 173],
  )

  const first = Uint8Array.from([0x1b, 0x40])
  const second = Uint8Array.from([0x0a, 0x1d, 0x56])
  const joined = escPos.concatBytes(first, second)
  assert.deepEqual(Array.from(joined), [0x1b, 0x40, 0x0a, 0x1d, 0x56])

  const hex = escPos.bytesToHex(joined)
  assert.equal(hex, '1b400a1d56')
  assert.deepEqual(Array.from(escPos.hexToBytes(hex)), Array.from(joined))
  assert.equal(escPos.bytesToBase64(Uint8Array.from([0x41, 0x42, 0x43])), 'QUJD')
  assert.throws(() => escPos.hexToBytes('abc'), /inválida/i)

  const ticket = escPos.buildEscPosBytes({
    orderId: '12345678-ABCD',
    items: [{ nombre: 'Café con piñón', cantidad: 2, precio_unitario: 35.5 }],
    total: 71,
    metodoPago: 'efectivo',
    fecha: '22/07/2026 10:00',
    tipoPedido: 'PARA LLEVAR',
    atendidoPor: 'Luis',
  }, {
    negocio_nombre: 'Abaroa Cafetería',
    ticket_mensaje_despedida: '¡Gracias!',
  })

  assert.ok(ticket.length > 100)
  assert.deepEqual(Array.from(ticket.slice(0, 5)), [0x1b, 0x40, 0x1b, 0x74, 0x02])
  assert.deepEqual(Array.from(ticket.slice(-4)), [0x1d, 0x56, 0x42, 0x00])
  assert.ok(escPos.wrapText('uno dos tres cuatro', 8).every(line => line.length <= 8))

  console.log('Pruebas ESC/POS superadas: codificación CP850, bytes, Base64, ticket y corte.')
} finally {
  fs.rmSync(outputPath, { force: true })
}
