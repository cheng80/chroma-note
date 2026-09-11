// deno-lint-ignore no-import-prefix -- exact JSR version is pinned in deno.lock.
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  canonical,
  sha256,
  validatePng,
} from "../functions/record-lifecycle/index.ts";

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAHhlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAAEsAAAAAQAAASwAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAAGgAwAEAAAAAQAAAAEAAAAArE7Z4gAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAxJREFUCB1juHb5BAAE9AJyUWRfCQAAAABJRU5ErkJggg==",
  ),
  (value) => value.charCodeAt(0),
);

Deno.test("canonical payload hash is key-order independent", async () => {
  const a = { z: 1, a: { y: [2, 1], x: "값" } };
  const b = { a: { x: "값", y: [2, 1] }, z: 1 };
  assertEquals(canonical(a), canonical(b));
  assertEquals(await sha256(canonical(a)), await sha256(canonical(b)));
});

Deno.test("canonical payload rejects excessive nesting", () => {
  let nested: unknown = null;
  for (let depth = 0; depth < 10; depth++) nested = { value: nested };
  assertThrows(
    () => canonical(nested as Parameters<typeof canonical>[0]),
    Error,
    "too deeply nested",
  );
});

Deno.test("PNG bytes, CRC, decode length, hash and dimensions are verified", async () => {
  await validatePng(png, {
    sha256: await sha256(png),
    bytes: png.length,
    width: 1,
    height: 1,
  });
  const corrupt = Uint8Array.from(png);
  corrupt[corrupt.length - 5] ^= 1;
  const corruptHash = await sha256(corrupt);
  const pngHash = await sha256(png);
  await assertRejects(() =>
    validatePng(corrupt, {
      sha256: corruptHash,
      bytes: corrupt.length,
      width: 1,
      height: 1,
    })
  );
  await assertRejects(() =>
    validatePng(png, {
      sha256: pngHash,
      bytes: png.length,
      width: 2,
      height: 1,
    })
  );
  const trailing = new Uint8Array(png.length + 1);
  trailing.set(png);
  trailing[png.length] = 1;
  const trailingHash = await sha256(trailing);
  await assertRejects(() =>
    validatePng(trailing, {
      sha256: trailingHash,
      bytes: trailing.length,
      width: 1,
      height: 1,
    })
  );
});
